"""Core-side tests for the approval block lowering (issue #748, part 1)."""

from __future__ import annotations

import io as _io
import json as _json
import threading as _threading
import time as _time
from typing import Any

import pytest

from rpaforge.cli.run import LoadedDiagram
from rpaforge.core.diagram_converter import DiagramConverter
from rpaforge.core.execution import TryCatchGroup
from rpaforge.core.validator import ProcessValidator
from rpaforge.hitl.approval import ApprovalStatus, ApprovalStore
from rpaforge.runner.cli import main as _cli_main
from rpaforge.runner.logging import EventLogger
from rpaforge.runner.supervisor import ProcessSupervisor, SupervisorConfig


def _approval_diagram(block_data: dict[str, Any]) -> dict[str, Any]:
    return {
        "nodes": [
            {"id": "s", "data": {"blockData": {"type": "start"}}},
            {"id": "a", "data": {"blockData": {"type": "approval", **block_data}}},
            {
                "id": "fb",
                "data": {
                    "blockData": {
                        "type": "activity",
                        "library": "Flow",
                        "activity": {"name": "log_message", "library": "Flow"},
                        "params": {"message": "rejected path"},
                    }
                },
            },
            {"id": "e", "data": {"blockData": {"type": "end", "status": "PASS"}}},
        ],
        "edges": [
            {"source": "s", "target": "a", "sourceHandle": "output"},
            {"source": "a", "target": "e", "sourceHandle": "output"},
            {"source": "a", "target": "fb", "sourceHandle": "rejected"},
            {"source": "fb", "target": "e", "sourceHandle": "output"},
        ],
    }


VALID = {
    "question": "Ship release 1.0?",
    "on_reject": "fallback",
    "timeout_ttl": 300,
}


class TestApprovalValidator:
    def _errors(self, diagram: dict[str, Any]) -> list[str]:
        result = ProcessValidator().validate_diagram(diagram)
        return [e.error_type for e in result.errors]

    def test_valid_node_passes(self) -> None:
        assert self._errors(_approval_diagram(VALID)) == []

    def test_missing_question_rejected(self) -> None:
        errors = self._errors(_approval_diagram({**VALID, "question": "   "}))
        assert "MISSING_QUESTION" in errors

    @pytest.mark.parametrize("bad", ["auto", "", "APPLY"])
    def test_invalid_on_reject_rejected(self, bad: str) -> None:
        errors = self._errors(_approval_diagram({**VALID, "on_reject": bad}))
        assert "INVALID_ON_REJECT" in errors

    def test_on_reject_fail_passes_without_fallback_edge(self) -> None:
        diagram = _approval_diagram({**VALID, "on_reject": "fail"})
        diagram["edges"] = [
            e for e in diagram["edges"] if e.get("sourceHandle") != "rejected"
        ]
        assert self._errors(diagram) == []


class TestApprovalLowering:
    def test_lowes_to_try_catch_with_hitl_call(self) -> None:
        process = DiagramConverter().convert(_approval_diagram(VALID))
        groups = [
            item
            for task in process.tasks
            for item in task.activities
            if isinstance(item, TryCatchGroup)
        ]
        assert len(groups) == 1
        group = groups[0]
        call = group.try_activities[0]
        assert (call.library, call.activity) == ("__hitl__", "Request Approval")
        assert call.kwargs["question"] == "Ship release 1.0?"
        assert call.kwargs["ttl_seconds"] == 300.0
        assert call.node_id == "a"
        # rejected branch collected as catch activities
        assert len(group.catch_activities) == 1

    def test_output_variable_passthrough(self) -> None:
        diagram = _approval_diagram({**VALID, "output_variable": "token"})
        process = DiagramConverter().convert(diagram)
        group = next(
            item
            for task in process.tasks
            for item in task.activities
            if isinstance(item, TryCatchGroup)
        )
        assert group.try_activities[0].output_variable == "token"


# --- End-to-end: block-form approval diagram through the runner (AC-1) ---


def _block_diagram(on_reject: str = "fallback") -> dict[str, Any]:
    return {
        "version": "1.1.0",
        "metadata": {"id": "ap-e2e", "name": "Approval E2E"},
        "nodes": [
            {"id": "s", "data": {"blockData": {"type": "start"}}},
            {
                "id": "a",
                "data": {
                    "blockData": {
                        "type": "approval",
                        "question": "Ship release 1.0?",
                        "on_reject": on_reject,
                    }
                },
            },
            {
                "id": "ok",
                "data": {
                    "blockData": {
                        "type": "activity",
                        "library": "Flow",
                        "activity": {"name": "log_message", "library": "Flow"},
                        "params": {"message": "approved-path"},
                    }
                },
            },
            {
                "id": "rej",
                "data": {
                    "blockData": {
                        "type": "activity",
                        "library": "Flow",
                        "activity": {"name": "log_message", "library": "Flow"},
                        "params": {"message": "rejected-path"},
                    }
                },
            },
            {"id": "e", "data": {"blockData": {"type": "end", "status": "PASS"}}},
        ],
        "edges": [
            {"source": "s", "target": "a", "sourceHandle": "output"},
            {"source": "a", "target": "ok", "sourceHandle": "output"},
            {"source": "a", "target": "rej", "sourceHandle": "rejected"},
            {"source": "ok", "target": "e", "sourceHandle": "output"},
            {"source": "rej", "target": "e", "sourceHandle": "output"},
        ],
    }


def _run_through_runner(tmp_path, monkeypatch, decision):
    monkeypatch.setenv("RPAFORGE_DATA_DIR", str(tmp_path))
    document = _block_diagram()
    proc_file = tmp_path / "ap.process"
    proc_file.write_text(
        _json.dumps(document, default=lambda o: getattr(o, "__dict__", str(o))),
        encoding="utf-8",
    )
    sink = _io.StringIO()
    supervisor = ProcessSupervisor(
        config=SupervisorConfig(), logger=EventLogger(stream=sink, ndjson=True)
    )
    loaded = LoadedDiagram(document=document, variables=[], source=proc_file)
    outcome = {}
    t = _threading.Thread(
        target=lambda: outcome.update(result=supervisor.execute(loaded)), daemon=True
    )
    t.start()

    def _pending():
        store = ApprovalStore(directory=tmp_path / "approvals")
        reqs = store.list(ApprovalStatus.PENDING)
        return reqs[0] if reqs else None

    token = None
    for _ in range(600):
        req = _pending()
        if req:
            token = req.id
            break
        _time.sleep(0.05)
    assert token, "no pending approval appeared"
    assert _cli_main(["approvals", decision, token]) == 0
    t.join(timeout=60)
    assert not t.is_alive()
    code, payload = outcome["result"]
    events = [_json.loads(x) for x in sink.getvalue().splitlines() if x.strip()]
    return code, payload, token, events


class TestApprovalRunnerE2E:
    def test_approve_branch_runs(self, tmp_path, monkeypatch) -> None:
        code, payload, token, events = _run_through_runner(
            tmp_path, monkeypatch, "approve"
        )
        assert int(code) == 0 and payload["status"] == "pass"
        store = ApprovalStore(directory=tmp_path / "approvals")
        assert store.get(token).status == ApprovalStatus.APPROVED
        assert any(e["event"] == "approval_requested" for e in events)

    def test_reject_routes_to_fallback(self, tmp_path, monkeypatch) -> None:
        code, payload, token, events = _run_through_runner(
            tmp_path, monkeypatch, "reject"
        )
        assert int(code) == 0 and payload["status"] == "pass"
        store = ApprovalStore(directory=tmp_path / "approvals")
        assert store.get(token).status == ApprovalStatus.REJECTED
