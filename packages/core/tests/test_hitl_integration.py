"""End-to-end tests for HITL suspend/resume approvals (issue #746).

Covers the acceptance criteria: a run suspends at an approval block and
emits an NDJSON event carrying the token; ``rpaforge-runner approvals
approve|reject`` resolves the persisted request; the run resumes and branches
on the decision; rejection routes deterministically to the fallback branch;
and a crash between suspend and resume recovers cleanly through checkpoint
replay and token adoption.
"""

from __future__ import annotations

import io
import json
import threading
import time
from pathlib import Path
from typing import Any, ClassVar

import pytest

from rpaforge.cli.run import LoadedDiagram
from rpaforge.core.activity import activity, library, output
from rpaforge.core.checkpoint import CheckpointManager
from rpaforge.core.execution import ProcessBuilder
from rpaforge.core.runner import StudioEngine
from rpaforge.hitl.approval import ApprovalStatus, ApprovalStore
from rpaforge.hitl.suspend import EVENT_APPROVAL_REQUESTED
from rpaforge.runner.cli import main
from rpaforge.runner.logging import EventLogger
from rpaforge.runner.supervisor import ProcessSupervisor, SupervisorConfig


@library(name="HitlTestLib", category="Testing")
class HitlTestLib:
    """Test library recording which branch of the diagram executed."""

    calls: ClassVar[list[str]] = []

    @activity(name="Record", category="Testing")
    @output("Record a marker value")
    def record(self, value: str = "") -> str:
        type(self).calls.append(value)
        return value


@pytest.fixture(autouse=True)
def _reset_recorded_calls():
    """Keep the recorded-branch log isolated between tests."""
    HitlTestLib.calls.clear()
    yield
    HitlTestLib.calls.clear()


def _wait_until(predicate, timeout: float = 30.0, interval: float = 0.05):
    """Poll predicate until truthy, failing with AssertionError on timeout."""
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        value = predicate()
        if value:
            return value
        time.sleep(interval)
    raise AssertionError("Condition not met within timeout")


class TestEndToEndApproval:
    """Acceptance criterion 1: suspend at approval, CLI approve, resume."""

    def test_run_suspends_then_cli_approve_resumes_and_branches(
        self, tmp_path: Path, monkeypatch, capsys
    ):
        monkeypatch.setenv("RPAFORGE_DATA_DIR", str(tmp_path))
        document = _straight_diagram()
        proc_file = tmp_path / "hitl.process"
        proc_file.write_text(json.dumps(document), encoding="utf-8")

        sink = io.StringIO()
        supervisor = ProcessSupervisor(
            config=SupervisorConfig(), logger=EventLogger(stream=sink, ndjson=True)
        )
        loaded = LoadedDiagram(document=document, variables=[], source=proc_file)
        outcome: dict[str, Any] = {}
        thread = threading.Thread(
            target=lambda: outcome.update(result=supervisor.execute(loaded)),
            daemon=True,
        )
        thread.start()

        request = _wait_until(lambda: _first_pending(tmp_path))
        token = request.id

        tagged = _wait_until(lambda: _suspension_checkpoint(tmp_path))
        assert tagged.approval_token == token

        assert main(["approvals", "list", "--status", "pending"]) == 0
        listed = capsys.readouterr().out
        assert token in listed
        assert "Ship release 1.0?" in listed

        assert main(["approvals", "approve", token, "--comment", "ship it"]) == 0
        capsys.readouterr()

        thread.join(timeout=60)
        assert not thread.is_alive()

        code, payload = outcome["result"]
        assert int(code) == 0
        assert payload["status"] == "pass"
        assert HitlTestLib.calls == ["approved-path"]

        store = ApprovalStore()
        assert store.get(token).status == ApprovalStatus.APPROVED
        assert store.get(token).comment == "ship it"

        events = [
            json.loads(line) for line in sink.getvalue().splitlines() if line.strip()
        ]
        requested = [e for e in events if e["event"] == "approval_requested"]
        assert requested, "approval_requested NDJSON event must be emitted"
        assert requested[0]["token"] == token
        assert requested[0]["question"] == "Ship release 1.0?"
        assert any(
            e["event"] == "approval_resolved"
            and e.get("token") == token
            and e.get("decision") == "approved"
            for e in events
        )

        final = CheckpointManager(checkpoint_dir=tmp_path / "checkpoints").load()
        assert final is not None
        assert final.approval_token == ""


class TestRejectFallbackBranch:
    """Acceptance criterion 2: reject routes to the fallback branch."""

    def test_reject_routes_deterministically_to_catch_branch(
        self, tmp_path: Path, monkeypatch
    ):
        monkeypatch.setenv("RPAFORGE_DATA_DIR", str(tmp_path))
        document = _try_catch_diagram()
        proc_file = tmp_path / "hitl_fallback.process"
        proc_file.write_text(json.dumps(document), encoding="utf-8")

        sink = io.StringIO()
        supervisor = ProcessSupervisor(
            config=SupervisorConfig(), logger=EventLogger(stream=sink, ndjson=True)
        )
        loaded = LoadedDiagram(document=document, variables=[], source=proc_file)
        outcome: dict[str, Any] = {}
        thread = threading.Thread(
            target=lambda: outcome.update(result=supervisor.execute(loaded)),
            daemon=True,
        )
        thread.start()

        request = _wait_until(lambda: _first_pending(tmp_path))
        token = request.id

        assert main(["approvals", "reject", token]) == 0
        thread.join(timeout=60)
        assert not thread.is_alive()

        code, payload = outcome["result"]
        assert int(code) == 0
        assert payload["status"] == "pass"
        assert HitlTestLib.calls == ["rejected-fallback"]

        store = ApprovalStore()
        assert store.get(token).status == ApprovalStatus.REJECTED

        events = [
            json.loads(line) for line in sink.getvalue().splitlines() if line.strip()
        ]
        assert any(
            e["event"] == "approval_resolved"
            and e.get("token") == token
            and e.get("decision") == "rejected"
            for e in events
        )


class TestCrashRecovery:
    """Acceptance criterion 3: crash between suspend and resume recovers."""

    def test_crash_between_suspend_and_resume_recovers_cleanly(
        self, tmp_path: Path, monkeypatch
    ):
        monkeypatch.setenv("RPAFORGE_DATA_DIR", str(tmp_path))

        process_a = _hitl_process("Crash Recovery Proc")
        engine_a = StudioEngine()
        outcome_a: dict[str, Any] = {}
        thread_a = threading.Thread(
            target=lambda: outcome_a.update(result=engine_a.run(process_a)),
            daemon=True,
        )
        thread_a.start()

        request = _wait_until(lambda: _first_pending(tmp_path))
        token = request.id

        tagged = _wait_until(engine_a.get_checkpoint_data)
        assert tagged.approval_token == token

        # Simulate the crash: abandon the suspended run without deciding.
        # The orphaned pending token stays persisted on disk. A fresh engine
        # re-runs the same process; it must adopt the orphaned token rather
        # than minting a duplicate.
        process_b = _hitl_process("Crash Recovery Proc")
        engine_b = StudioEngine()
        adopted = threading.Event()

        def on_event(event_type: str, *_args: Any) -> None:
            if event_type == EVENT_APPROVAL_REQUESTED:
                adopted.set()

        engine_b.executor.add_listener(on_event)

        result_b: dict[str, Any] = {}
        thread_b = threading.Thread(
            target=lambda: result_b.update(result=engine_b.run(process_b)),
            daemon=True,
        )
        thread_b.start()

        assert adopted.wait(timeout=30), "recovered run never reached the block"
        assert (
            ApprovalStore().resolve(
                token, approved=True, comment="recovered after crash"
            )
            is not None
        )

        thread_b.join(timeout=60)
        assert not thread_b.is_alive()
        thread_a.join(timeout=10)

        recovered = result_b["result"]
        assert recovered.passed
        assert recovered.variables.get("approval_result") == "approved"
        assert recovered.variables.get("approval_comment") == "recovered after crash"

        store = ApprovalStore()
        assert store.get(token).status == ApprovalStatus.APPROVED
        assert len(list((tmp_path / "approvals").glob("*.json"))) == 1
        assert not store.list(ApprovalStatus.PENDING)

        cleared = engine_b.get_checkpoint_data()
        assert cleared is not None
        assert cleared.approval_token == ""


class TestDecisionVariableInjection:
    """Resume path injects ${approval_result} into process variables."""

    @pytest.mark.parametrize("approved", [True, False])
    def test_variables_injected_on_resolution(self, tmp_path, monkeypatch, approved):
        monkeypatch.setenv("RPAFORGE_DATA_DIR", str(tmp_path))

        process = _hitl_process("Var Injection Proc", output_variable="approval_token")
        engine = StudioEngine()
        outcome: dict[str, Any] = {}
        thread = threading.Thread(
            target=lambda: outcome.update(result=engine.run(process)), daemon=True
        )
        thread.start()

        request = _wait_until(lambda: _first_pending(tmp_path))
        assert ApprovalStore().resolve(request.id, approved=approved) is not None

        thread.join(timeout=60)
        assert not thread.is_alive()

        result = outcome["result"]
        variables = result.variables
        if approved:
            assert variables.get("approval_token") == request.id
        else:
            assert "approval_token" not in variables
        assert variables.get("approval_result") == (
            "approved" if approved else "rejected"
        )


class TestTtlExpiry:
    """Optional TTL: expired tokens follow reject semantics deterministically."""

    def test_expired_token_routes_to_failure_branch(self, tmp_path, monkeypatch):
        monkeypatch.setenv("RPAFORGE_DATA_DIR", str(tmp_path))

        builder = ProcessBuilder("TTL Proc")
        task = builder.add_task("Main")
        task.add_activity(
            "__hitl__",
            "Request Approval",
            node_id="appr-ttl",
            question="Too slow?",
            ttl_seconds=0.15,
        )
        engine = StudioEngine()
        result = engine.run(builder.build())

        assert result.failed
        assert result.variables.get("approval_result") == "rejected"
        assert not ApprovalStore().list(ApprovalStatus.PENDING)


class TestApprovalsCliErrors:
    """CLI error handling for unknown or already-decided tokens."""

    def test_approve_unknown_token_fails_with_configuration_error(
        self, tmp_path, monkeypatch, capsys
    ):
        monkeypatch.setenv("RPAFORGE_DATA_DIR", str(tmp_path))
        unknown = "f" * 32
        assert main(["approvals", "approve", unknown]) == 4
        assert "No pending approval" in capsys.readouterr().err

        assert main(["approvals", "reject", unknown, "--json"]) == 4
        payload = json.loads(capsys.readouterr().out)
        assert payload["status"] == "ERROR"

    def test_list_empty_store_reports_no_requests(self, tmp_path, monkeypatch, capsys):
        monkeypatch.setenv("RPAFORGE_DATA_DIR", str(tmp_path))
        assert main(["approvals", "list"]) == 0
        assert "No approval requests found." in capsys.readouterr().out


def _straight_diagram() -> dict[str, Any]:
    return {
        "version": "1.1.0",
        "metadata": {"id": "hitl-1", "name": "HITL Straight"},
        "nodes": [
            _start_node(),
            _activity_node(
                "hitl-1",
                "__hitl__",
                "Request Approval",
                values={"question": "Ship release 1.0?"},
                output_variable="approval_token",
            ),
            _activity_node(
                "ok-1", "HitlTestLib", "Record", values={"value": "approved-path"}
            ),
            _end_node(),
        ],
        "edges": [
            {"id": "e1", "source": "start-1", "target": "hitl-1", "sourceHandle": None},
            {"id": "e2", "source": "hitl-1", "target": "ok-1", "sourceHandle": None},
            {"id": "e3", "source": "ok-1", "target": "end-1", "sourceHandle": None},
        ],
        "variables": [],
    }


def _try_catch_diagram() -> dict[str, Any]:
    return {
        "version": "1.1.0",
        "metadata": {"id": "hitl-2", "name": "HITL Fallback"},
        "nodes": [
            _start_node(),
            {
                "id": "tc-1",
                "type": "try-catch",
                "position": {"x": 100, "y": 200},
                "data": {"blockData": {"type": "try-catch"}},
            },
            _activity_node(
                "hitl-1",
                "__hitl__",
                "Request Approval",
                values={"question": "Reject me?"},
            ),
            _activity_node(
                "ok-1", "HitlTestLib", "Record", values={"value": "approved-path"}
            ),
            _activity_node(
                "fb-1", "HitlTestLib", "Record", values={"value": "rejected-fallback"}
            ),
            _end_node(),
        ],
        "edges": [
            {"id": "e1", "source": "start-1", "target": "tc-1", "sourceHandle": None},
            {
                "id": "e2",
                "source": "tc-1",
                "target": "hitl-1",
                "sourceHandle": "output",
            },
            {"id": "e3", "source": "hitl-1", "target": "ok-1", "sourceHandle": None},
            {"id": "e4", "source": "ok-1", "target": "end-1", "sourceHandle": None},
            {"id": "e5", "source": "tc-1", "target": "fb-1", "sourceHandle": "error"},
            {"id": "e6", "source": "fb-1", "target": "end-1", "sourceHandle": None},
        ],
        "variables": [],
    }


def _start_node() -> dict[str, Any]:
    return {
        "id": "start-1",
        "type": "start",
        "position": {"x": 100, "y": 100},
        "data": {"blockData": {"type": "start", "processName": "HITL Flow"}},
    }


def _activity_node(
    node_id: str,
    library_name: str,
    activity_name: str,
    values: dict[str, Any] | None = None,
    output_variable: str = "",
) -> dict[str, Any]:
    data: dict[str, Any] = {
        "blockData": {"type": "activity", "library": library_name},
        "activity": {"name": activity_name, "library": library_name},
    }
    if values:
        data["activityValues"] = values
    if output_variable:
        data["outputVariable"] = output_variable
    return {
        "id": node_id,
        "type": "activity",
        "position": {"x": 100, "y": 300},
        "data": data,
    }


def _end_node() -> dict[str, Any]:
    return {
        "id": "end-1",
        "type": "end",
        "position": {"x": 100, "y": 500},
        "data": {"blockData": {"type": "end"}},
    }


def _hitl_process(name: str, output_variable: str = "") -> Any:
    builder = ProcessBuilder(name)
    task = builder.add_task("Main")
    kwargs: dict[str, Any] = {
        "node_id": "appr-1",
        "question": "Proceed with deployment?",
    }
    if output_variable:
        kwargs["output_variable"] = output_variable
    task.add_activity("__hitl__", "Request Approval", **kwargs)
    return builder.build()


def _first_pending(tmp_path: Path):
    store = ApprovalStore(directory=tmp_path / "approvals")
    requests = store.list(ApprovalStatus.PENDING)
    return requests[0] if requests else None


def _suspension_checkpoint(tmp_path: Path):
    manager = CheckpointManager(checkpoint_dir=tmp_path / "checkpoints")
    data = manager.load()
    if data is None or not data.approval_token:
        return None
    return data
