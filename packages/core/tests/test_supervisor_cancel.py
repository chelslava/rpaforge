"""Cooperative cancellation entry points of ProcessSupervisor (issue #857)."""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from rpaforge.cli.run import LoadedDiagram
from rpaforge.core.execution import ExecutionStatus
from rpaforge.runner.supervisor import ProcessSupervisor


def _write_diagram(tmp_path: Path) -> Path:
    nodes = [
        {"id": "start", "data": {"blockData": {"type": "start", "processName": "P"}}},
        {
            "id": "n1",
            "data": {
                "blockData": {
                    "type": "activity",
                    "library": "Rec",
                    "activity": {"name": "Fetch", "library": "Rec"},
                },
                "activity": {"name": "Fetch", "library": "Rec"},
                "activityValues": {},
            },
        },
        {"id": "end", "data": {"blockData": {"type": "end"}}},
    ]
    edges = [{"source": "start", "target": "n1"}, {"source": "n1", "target": "end"}]
    path = tmp_path / "p.process"
    path.write_text(json.dumps({"nodes": nodes, "edges": edges}), encoding="utf-8")
    return path


@dataclass
class _FakeResult:
    status: ExecutionStatus = ExecutionStatus.PASS
    elapsed_ms: int = 5
    message: str = ""


class _FakeEngine:
    """Engine double recording cancel() calls, with a mid-run hook."""

    def __init__(self, on_run: Any = None) -> None:
        self.cancel_calls = 0
        self.ran = False
        self.last_run_id = "run-fake"
        self.last_audit_path: Path | None = None
        self._on_run = on_run

    def cancel(self) -> None:
        self.cancel_calls += 1

    def close(self) -> None:
        return None

    def run(self, process: Any) -> _FakeResult:
        _ = process
        self.ran = True
        if self._on_run is not None:
            self._on_run()
        if self.cancel_calls:
            return _FakeResult(status=ExecutionStatus.CANCELLED)
        return _FakeResult()


class TestRequestCancel:
    """The daemon cancel-watcher entry point."""

    def test_cancel_before_start_skips_execution(self, tmp_path: Path) -> None:
        factories_called = []

        def factory(**_kw: Any) -> _FakeEngine:
            factories_called.append(True)
            return _FakeEngine()

        supervisor = ProcessSupervisor(engine_factory=factory)
        supervisor.request_cancel(reason="before start")

        code, payload = supervisor.execute(
            LoadedDiagram(
                document=json.loads(_write_diagram(tmp_path).read_text("utf-8")),
                variables=[],
                source=_write_diagram(tmp_path),
            )
        )
        assert code != 0
        assert payload["status"] == "cancelled"
        assert payload["message"] == "cancelled before start"
        assert not factories_called

    def test_cancel_during_run_interrupts_engine(self, tmp_path: Path) -> None:
        supervisor: ProcessSupervisor | None = None
        engine_box: list[_FakeEngine] = []

        def factory(**_kw: Any) -> _FakeEngine:
            engine = _FakeEngine(
                on_run=lambda: supervisor.request_cancel(reason="mid-run")
            )
            engine_box.append(engine)
            return engine

        supervisor = ProcessSupervisor(engine_factory=factory)
        code, payload = supervisor.execute(
            LoadedDiagram(
                document=json.loads(_write_diagram(tmp_path).read_text("utf-8")),
                variables=[],
                source=_write_diagram(tmp_path),
            )
        )
        assert payload["status"] == "cancelled"
        assert engine_box[0].cancel_calls == 1
        assert int(code) != 0
