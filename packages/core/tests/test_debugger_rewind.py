"""Tests for execution rewind and hot-reload (issue #849)."""

from __future__ import annotations

import json
import threading
import time
from pathlib import Path

import pytest

from rpaforge.core.checkpoint import CheckpointManager
from rpaforge.core.execution import ProcessBuilder
from rpaforge.core.executor import ProcessExecutor
from rpaforge.core.runner import (
    HotReloadRejectedError,
    ProcessRunner,
    RewindNotAllowedError,
)


class _GateLib:
    """Test library: n-step recorder + gate-guarded failure."""

    def __init__(self) -> None:
        self.steps: list[str] = []

    def step(self, name: str) -> str:
        self.steps.append(name)
        return name

    def gate(self, gate: str) -> str:
        """Fails unless ``gate`` == 'ok' (rewind acceptance scenario)."""
        if gate != "ok":
            raise RuntimeError(f"gate refused: {gate!r}")
        self.steps.append("gate-ok")
        return gate


def _build_runner(tmp_path: Path, lib: _GateLib, frequency: int = 2) -> ProcessRunner:
    executor = ProcessExecutor()
    executor.register_library("GateLib", lib)
    return ProcessRunner(
        executor=executor,
        checkpoint_manager=CheckpointManager(
            checkpoint_dir=tmp_path / "cps", frequency=frequency, keep_last=10
        ),
    )


def _ten_step_process(gate: str) -> object:
    builder = ProcessBuilder("Rewind Acceptance")
    task = builder.add_task("Main")
    for i in range(1, 11):
        if i == 8:
            task.add_activity("GateLib", "Gate", gate="fix", node_id=f"n{i}")
        else:
            task.add_activity("GateLib", "Step", name=f"s{i}", node_id=f"n{i}")
    process = builder.build()
    process.set_variable("fix", gate)
    return process


def _wait_paused(runner: ProcessRunner, timeout: float = 10.0) -> None:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if runner.state.value == "paused":
            return
        time.sleep(0.02)
    pytest.fail("runner did not pause in time")


# ---------------------------------------------------------------------------
# Checkpoint history
# ---------------------------------------------------------------------------


class TestCheckpointHistory:
    def test_list_and_load_by_id(self, tmp_path: Path):
        manager = CheckpointManager(checkpoint_dir=tmp_path / "cps", frequency=1)
        id1 = manager.save("p", "n1", "t", "running", {"a": 1}, [], {}, 1)
        id2 = manager.save("p", "n2", "t", "running", {"a": 2}, [], {}, 2)
        assert id1 and id2

        listed = manager.list_checkpoints()
        assert [c.checkpoint_id for c in listed] == [id2, id1]  # newest first

        loaded = manager.load_by_id(id1)
        assert loaded is not None
        assert loaded.current_node_id == "n1"
        assert loaded.variables == {"a": 1}
        assert manager.load_by_id("cp_missing") is None

    def test_runner_list_checkpoints_summary(self, tmp_path: Path):
        lib = _GateLib()
        runner = _build_runner(tmp_path, lib)
        runner.run(_ten_step_process("ok"))

        summaries = runner.list_checkpoints()
        assert summaries, "checkpoint history must exist after a run"
        newest = summaries[0]
        assert newest["activity_count"] == 10
        assert newest["current_node_id"] == "n10"
        assert newest["variable_count"] >= 0


# ---------------------------------------------------------------------------
# Rewind (acceptance: fail at 8 → rewind to checkpoint → corrected → pass)
# ---------------------------------------------------------------------------


class TestRewind:
    def test_fail_at_8_rewind_corrected_variable_passes(self, tmp_path: Path):
        lib = _GateLib()
        runner = _build_runner(tmp_path, lib, frequency=2)

        result = runner.run(_ten_step_process(gate="broken"))
        assert result.status.value.lower() == "fail"
        assert "gate refused" in result.message

        checkpoints = runner.list_checkpoints()
        assert checkpoints, "checkpoints must have been saved before the failure"
        # Latest checkpoint before the failing activity n8
        target = next(
            cp
            for cp in checkpoints
            if cp["activity_count"] < 8 and cp["activity_count"] >= 2
        )

        plan = runner.prepare_rewind(
            target["checkpoint_id"], variable_corrections={"fix": "ok"}
        )
        assert plan.resume_after_node_id == target["current_node_id"]

        # Re-issue the run with the ORIGINAL process; the stored spec skips
        # the executed prefix and restores variables (with the correction).
        steps_before_rewind = len(lib.steps)
        result2 = runner.run(_ten_step_process(gate="broken"))
        assert result2.status.value.lower() == "pass", result2.message

        # Activities up to and including the checkpoint node were NOT
        # re-executed; everything from the next node onward ran.
        rewind_steps = lib.steps[steps_before_rewind:]
        assert not {"s1", "s2", "s3", "s4", "s5", "s6"} & set(rewind_steps)
        assert "s7" in rewind_steps
        assert "gate-ok" in rewind_steps

    def test_skipped_prefix_does_not_reexecute(self, tmp_path: Path):
        lib = _GateLib()
        runner = _build_runner(tmp_path, lib, frequency=1)
        assert runner.run(_ten_step_process("ok")).status.value.lower() == "pass"
        executed_before = list(lib.steps)

        cp = next(c for c in runner.list_checkpoints() if c["activity_count"] == 4)
        runner.prepare_rewind(cp["checkpoint_id"])
        result = runner.run(_ten_step_process("ok"))
        assert result.status.value.lower() == "pass"

        # s1..s4 must not appear again
        names_after = lib.steps[len(executed_before) :]
        assert "s1" not in names_after
        assert "s4" not in names_after
        assert "s5" in names_after

    def test_unattended_rewind_refused(self, tmp_path: Path):
        lib = _GateLib()
        runner = _build_runner(tmp_path, lib)
        runner.unattended = True
        runner.run(_ten_step_process("ok"))
        cp = runner.list_checkpoints()[0]
        with pytest.raises(RewindNotAllowedError, match="unattended"):
            runner.prepare_rewind(cp["checkpoint_id"])

    def test_unknown_checkpoint_refused(self, tmp_path: Path):
        runner = _build_runner(tmp_path, _GateLib())
        with pytest.raises(RewindNotAllowedError, match="not found"):
            runner.prepare_rewind("cp_absent")


# ---------------------------------------------------------------------------
# Hot-reload (paused → edit → Apply & continue)
# ---------------------------------------------------------------------------


def _sample_document() -> dict:
    """n1 (step) → n2 (gate=${fix}) → n3 (step) as a diagram document."""
    return {
        "nodes": [
            {
                "id": "start",
                "data": {"blockData": {"type": "start", "processName": "HotReload"}},
            },
            {
                "id": "n1",
                "data": {
                    "blockData": {
                        "type": "activity",
                        "library": "GateLib",
                        "activity": {"name": "Step", "library": "GateLib"},
                    },
                    "activity": {"name": "Step", "library": "GateLib"},
                    "activityValues": {"name": "first"},
                },
            },
            {
                "id": "n2",
                "data": {
                    "blockData": {
                        "type": "activity",
                        "library": "GateLib",
                        "activity": {"name": "Gate", "library": "GateLib"},
                    },
                    "activity": {"name": "Gate", "library": "GateLib"},
                    "activityValues": {"gate": "fix"},
                },
            },
            {
                "id": "n3",
                "data": {
                    "blockData": {
                        "type": "activity",
                        "library": "GateLib",
                        "activity": {"name": "Step", "library": "GateLib"},
                    },
                    "activity": {"name": "Step", "library": "GateLib"},
                    "activityValues": {"name": "third"},
                },
            },
            {"id": "end", "data": {"blockData": {"type": "end"}}},
        ],
        "edges": [
            {"source": "start", "target": "n1", "sourceHandle": None},
            {"source": "n1", "target": "n2", "sourceHandle": None},
            {"source": "n2", "target": "n3", "sourceHandle": None},
            {"source": "n3", "target": "end", "sourceHandle": None},
        ],
        "variables": [{"name": "fix", "type": "string", "value": "broken"}],
    }


def _edited_document() -> dict:
    """Same diagram with n2's gate fixed and a new node n2b after it."""
    doc = json.loads(json.dumps(_sample_document()))
    for node in doc["nodes"]:
        if node["id"] == "n2":
            node["data"]["activityValues"]["gate"] = "ok"
    doc["nodes"].append(
        {
            "id": "n2b",
            "data": {
                "blockData": {
                    "type": "activity",
                    "library": "GateLib",
                    "activity": {"name": "Step", "library": "GateLib"},
                },
                "activity": {"name": "Step", "library": "GateLib"},
                "activityValues": {"name": "inserted"},
            },
        }
    )
    doc["edges"] = [e for e in doc["edges"] if e["source"] != "n2"]
    doc["edges"].append({"source": "n2", "target": "n2b", "sourceHandle": None})
    doc["edges"].append({"source": "n2b", "target": "n3", "sourceHandle": None})
    return doc


class TestHotReload:
    def test_edit_paused_params_and_insert_node(self, tmp_path: Path):
        from rpaforge.core.diagram_converter import DiagramConverter

        lib = _GateLib()
        runner = _build_runner(tmp_path, lib)
        runner.add_breakpoint("n2")

        run_error: list[Exception] = []

        def run_thread() -> None:
            try:
                runner.run(DiagramConverter().convert(_sample_document()))
            except Exception as exc:  # pragma: no cover
                run_error.append(exc)

        thread = threading.Thread(target=run_thread, daemon=True)
        thread.start()
        _wait_paused(runner)
        assert runner.get_current_node_id() == "n2"

        summary = runner.prepare_hot_reload(_edited_document())
        assert summary.paused_node_id == "n2"
        assert summary.modified_nodes == ["n2"]
        assert summary.changed_params["n2"] == ["<positional>"]
        assert summary.added_nodes == ["n2b"]

        # Stop the paused run and re-issue with the edited diagram; the
        # stored resume spec executes from the paused node with live vars.
        runner.remove_breakpoint("bp_n2_0")
        runner.cancel()
        thread.join(timeout=10)
        assert not run_error

        steps_before_rerun = len(lib.steps)
        result = runner.run(DiagramConverter().convert(_edited_document()))
        assert result.status.value.lower() == "pass", result.message

        # Prefix (n1) was skipped; edited gate passed; inserted node ran.
        rerun_steps = lib.steps[steps_before_rerun:]
        assert "first" not in rerun_steps
        assert "gate-ok" in rerun_steps
        assert "inserted" in rerun_steps
        assert "third" in rerun_steps

    def test_deleting_paused_node_rejected(self, tmp_path: Path):
        from rpaforge.core.diagram_converter import DiagramConverter

        lib = _GateLib()
        runner = _build_runner(tmp_path, lib)
        runner.add_breakpoint("n2")
        thread = threading.Thread(
            target=lambda: runner.run(DiagramConverter().convert(_sample_document())),
            daemon=True,
        )
        thread.start()
        _wait_paused(runner)

        doc = _edited_document()
        doc["nodes"] = [n for n in doc["nodes"] if n["id"] != "n2"]
        doc["edges"] = [
            e for e in doc["edges"] if e["source"] != "n2" and e["target"] != "n2"
        ]
        doc["edges"].append({"source": "n1", "target": "n2b", "sourceHandle": None})

        with pytest.raises(HotReloadRejectedError, match="deleted"):
            runner.prepare_hot_reload(doc)

        runner.cancel()
        thread.join(timeout=10)

    def test_requires_paused_state(self, tmp_path: Path):
        runner = _build_runner(tmp_path, _GateLib())
        with pytest.raises(HotReloadRejectedError, match="paused debug session"):
            runner.prepare_hot_reload(_edited_document())

    def test_unattended_refused(self, tmp_path: Path):
        from rpaforge.core.diagram_converter import DiagramConverter

        lib = _GateLib()
        runner = _build_runner(tmp_path, lib)
        runner.unattended = True
        runner.add_breakpoint("n2")
        thread = threading.Thread(
            target=lambda: runner.run(DiagramConverter().convert(_sample_document())),
            daemon=True,
        )
        thread.start()
        _wait_paused(runner)
        with pytest.raises(RewindNotAllowedError, match="unattended"):
            runner.prepare_hot_reload(_edited_document())
        runner.cancel()
        thread.join(timeout=10)
