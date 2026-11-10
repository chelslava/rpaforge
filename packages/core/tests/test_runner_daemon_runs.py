"""Daemon run-record and per-run log file wiring (issue #857)."""

from __future__ import annotations

import json
import threading
from pathlib import Path

from rpaforge.queues.models import QueueItemStatus
from rpaforge.runner.daemon import RunnerDaemon, SQLiteEmbeddedQueue


def _write_diagram(tmp_path: Path) -> Path:
    nodes = [
        {"id": "start", "data": {"blockData": {"type": "start", "processName": "P"}}},
        {
            "id": "n1",
            "data": {
                "blockData": {
                    "type": "activity",
                    "library": "NoSuchLib",
                    "activity": {"name": "Fetch", "library": "NoSuchLib"},
                },
                "activity": {"name": "Fetch", "library": "NoSuchLib"},
                "activityValues": {},
            },
        },
        {"id": "end", "data": {"blockData": {"type": "end"}}},
    ]
    edges = [{"source": "start", "target": "n1"}, {"source": "n1", "target": "end"}]
    path = tmp_path / "p.process"
    path.write_text(json.dumps({"nodes": nodes, "edges": edges}), encoding="utf-8")
    return path


class TestDaemonRunRecords:
    """``_process_item`` records runs and mirrors logs to disk."""

    def test_processed_item_writes_run_record_and_log_file(
        self, tmp_path: Path
    ) -> None:
        backend = SQLiteEmbeddedQueue(db_path=tmp_path / "q.db")
        store = backend.store
        diagram = _write_diagram(tmp_path)
        item = store.add_item("q", {"diagram_path": str(diagram)})

        daemon = RunnerDaemon(
            queue_name="q",
            backend=backend,
            max_tasks=1,
            logs_dir=tmp_path / "logs",
        )
        runner = threading.Thread(target=daemon.run, daemon=True)
        runner.start()
        runner.join(timeout=60)

        run = store.get_run(item.id)
        assert run is not None
        assert run["status"] in ("success", "failed")
        assert run["diagram_path"] == str(diagram)
        assert run["exit_code"] is not None

        log_file = tmp_path / "logs" / f"{item.id}.ndjson"
        assert log_file.exists()
        events = [
            json.loads(line)
            for line in log_file.read_text(encoding="utf-8").splitlines()
            if line.strip()
        ]
        assert any(e["event"] == "process_started" for e in events)

        final_item = store.get_item(item.id)
        assert final_item.status in (
            QueueItemStatus.SUCCESSFUL,
            QueueItemStatus.FAILED,
            QueueItemStatus.RETRIED,
        )
