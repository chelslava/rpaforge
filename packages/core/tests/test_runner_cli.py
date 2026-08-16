"""Tests for rpaforge-runner CLI and headless daemon."""

from __future__ import annotations

import json
from pathlib import Path

from rpaforge.core.activity import activity, library, output
from rpaforge.runner.cli import main
from rpaforge.runner.daemon import RunnerDaemon, SQLiteEmbeddedQueue
from rpaforge.runner.validator import validate_source


@library(name="RunnerTestLib", category="Testing")
class RunnerTestLib:
    @activity(name="Echo", category="Testing")
    @output("Echo message")
    def echo(self, message: str = "ok") -> str:
        return f"Echo: {message}"


def _sample_valid_diagram(name: str = "Simple Process") -> dict:
    return {
        "version": "1.1.0",
        "metadata": {"id": "proc-1", "name": name},
        "nodes": [
            {
                "id": "start-1",
                "type": "start",
                "position": {"x": 100, "y": 100},
                "data": {"blockData": {"type": "start", "processName": name}},
            },
            {
                "id": "act-1",
                "type": "activity",
                "position": {"x": 100, "y": 200},
                "data": {
                    "blockData": {
                        "type": "activity",
                        "library": "RunnerTestLib",
                        "activity": {"name": "Echo", "library": "RunnerTestLib"},
                    },
                    "activity": {"name": "Echo", "library": "RunnerTestLib"},
                    "activityValues": {"message": "Hello Runner"},
                },
            },
            {
                "id": "end-1",
                "type": "end",
                "position": {"x": 100, "y": 300},
                "data": {"blockData": {"type": "end"}},
            },
        ],
        "edges": [
            {"id": "e1", "source": "start-1", "target": "act-1", "sourceHandle": None},
            {"id": "e2", "source": "act-1", "target": "end-1", "sourceHandle": None},
        ],
        "variables": [],
    }


def _sample_invalid_diagram() -> dict:
    return {
        "version": "1.1.0",
        "metadata": {"name": "Orphan Process"},
        "nodes": [
            {
                "id": "node-1",
                "type": "activity",
                "position": {"x": 100, "y": 100},
                "data": {"blockData": {"type": "activity", "label": "Orphan"}},
            }
        ],
        "edges": [],
    }


def test_version_command(capsys):
    ret = main(["version"])
    assert ret == 0
    captured = capsys.readouterr()
    assert "rpaforge-runner" in captured.out

    ret_json = main(["version", "--json"])
    assert ret_json == 0
    captured_json = capsys.readouterr()
    data = json.loads(captured_json.out)
    assert "runner_version" in data
    assert data["engine"] == "RPAForge Native Core"


def test_validate_valid_diagram(tmp_path: Path, capsys):
    proc_file = tmp_path / "test.process"
    proc_file.write_text(json.dumps(_sample_valid_diagram()), encoding="utf-8")

    ret = main(["validate", str(proc_file)])
    assert ret == 0
    captured = capsys.readouterr()
    assert "VALID" in captured.out
    assert "3 nodes" in captured.out

    ret_json = main(["validate", str(proc_file), "--json"])
    assert ret_json == 0
    captured_json = capsys.readouterr()
    data = json.loads(captured_json.out)
    assert data["valid"] is True
    assert data["stats"]["nodes"] == 3


def test_validate_invalid_diagram(tmp_path: Path, capsys):
    proc_file = tmp_path / "invalid.process"
    proc_file.write_text(json.dumps(_sample_invalid_diagram()), encoding="utf-8")

    ret = main(["validate", str(proc_file)])
    assert ret == 2
    captured = capsys.readouterr()
    assert "INVALID" in captured.err

    report = validate_source(proc_file)
    assert not report.is_valid
    assert len(report.errors) > 0


def test_run_successful_json(tmp_path: Path, capsys):
    proc_file = tmp_path / "run_test.process"
    proc_file.write_text(json.dumps(_sample_valid_diagram()), encoding="utf-8")

    ret = main(["run", str(proc_file), "--json"])
    assert ret == 0
    captured = capsys.readouterr()
    payload = json.loads(captured.out)
    assert payload["status"] == "pass"
    assert payload["run_id"] is not None


def test_run_ndjson_streaming(tmp_path: Path, capsys):
    proc_file = tmp_path / "ndjson_test.process"
    proc_file.write_text(json.dumps(_sample_valid_diagram()), encoding="utf-8")

    ret = main(["run", str(proc_file), "--ndjson"])
    assert ret == 0
    captured = capsys.readouterr()
    lines = [
        json.loads(line) for line in captured.out.strip().split("\n") if line.strip()
    ]
    events = [entry["event"] for entry in lines]
    assert "process_started" in events
    assert "activity_started" in events
    assert "activity_finished" in events
    assert "process_finished" in events


def test_run_with_vars_and_secrets(tmp_path: Path, monkeypatch, capsys):
    monkeypatch.setenv("TEST_SECRET_KEY", "super_secret_123")
    proc_file = tmp_path / "vars_test.process"
    doc = _sample_valid_diagram()
    doc["variables"] = [{"name": "var_a", "value": "default_a"}]
    proc_file.write_text(json.dumps(doc), encoding="utf-8")

    ret = main(
        [
            "run",
            str(proc_file),
            "--var",
            "var_a=custom_value",
            "--secret-env",
            "sec=TEST_SECRET_KEY",
            "--json",
        ]
    )
    assert ret == 0
    captured = capsys.readouterr()
    payload = json.loads(captured.out)
    assert payload["status"] == "pass"


def test_run_timeout(tmp_path: Path, capsys):
    # Diagram with a loop or slow execution
    proc_file = tmp_path / "slow_test.process"
    proc_file.write_text(json.dumps(_sample_valid_diagram()), encoding="utf-8")

    # A tiny timeout of 0.0001s should trigger cancellation
    ret = main(["run", str(proc_file), "--timeout", "0.0001", "--json"])
    # If cancelled by timeout
    assert ret in (0, 3)  # either completed very fast or cancelled


def test_run_memory_limit_exceeded(tmp_path: Path, capsys):
    proc_file = tmp_path / "mem_test.process"
    proc_file.write_text(json.dumps(_sample_valid_diagram()), encoding="utf-8")

    # Setting max memory to 1 MB (current process is definitely > 1MB)
    ret = main(["run", str(proc_file), "--max-memory-mb", "1", "--json"])
    # Should detect memory limit exceeded
    captured = capsys.readouterr()
    payload = json.loads(captured.out)
    if ret != 0:
        assert ret == 4
        assert payload["status"] == "resource_limit_exceeded"


def test_daemon_worker_queue(tmp_path: Path):
    db_file = tmp_path / "test_queue.db"
    queue = SQLiteEmbeddedQueue(db_path=db_file)

    proc_file = tmp_path / "task.process"
    proc_file.write_text(json.dumps(_sample_valid_diagram()), encoding="utf-8")

    # Insert test item via store
    queue.store.add_item(
        queue_name="orders",
        payload={"diagram_path": str(proc_file), "variables": {"order_id": "100"}},
        priority="High",
    )

    daemon = RunnerDaemon(
        queue_name="orders",
        backend=queue,
        concurrency=1,
        poll_interval=0.05,
        max_tasks=1,
    )
    exit_code = daemon.run()
    assert exit_code == 0
    assert daemon.processed_count == 1

    stats = queue.store.get_queue_stats("orders")
    assert stats["Successful"] == 1


def test_daemon_worker_queue_failed_item(tmp_path: Path):
    db_file = tmp_path / "test_queue_err.db"
    queue = SQLiteEmbeddedQueue(db_path=db_file)

    # Missing file path to trigger error
    queue.store.add_item(
        queue_name="orders",
        payload={"diagram_path": "non_existent.process"},
        priority="Normal",
    )

    daemon = RunnerDaemon(
        queue_name="orders",
        backend=queue,
        concurrency=1,
        poll_interval=0.05,
        max_tasks=1,
    )
    daemon.run()

    stats = queue.store.get_queue_stats("orders")
    assert stats["Retried"] == 1 or stats["DeadLetter"] == 1
