"""Tests for the schedules config loader and ScheduleManager (issue #818)."""

from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest

from rpaforge.queues.models import QueueItemStatus
from rpaforge.queues.sqlite_store import SQLiteQueueStore
from rpaforge.runner.schedules import (
    ScheduleConfigError,
    ScheduleManager,
    ScheduleState,
    load_schedules,
)

UTC = timezone.utc


def _write_schedules(path: Path, entries: list[dict]) -> Path:
    path.write_text(json.dumps(entries), encoding="utf-8")
    return path


def _single_schedule_file(
    tmp_path: Path, name: str, cron: str, diagram: str = "a.process", **extra: object
) -> Path:
    entry: dict[str, object] = {"name": name, "cron": cron, "diagram_path": diagram}
    entry.update(extra)
    return _write_schedules(tmp_path / f"{name}.json", [entry])


@pytest.fixture()
def store(tmp_path: Path) -> SQLiteQueueStore:
    return SQLiteQueueStore(db_path=tmp_path / "queue.db")


class TestLoadSchedules:
    """Config file validation."""

    def test_loads_valid_spec(self, tmp_path: Path) -> None:
        specs = load_schedules(
            _single_schedule_file(
                tmp_path,
                "morning",
                "30 9 * * 1-5",
                variables={"env": "prod"},
                priority="High",
                missed_run_policy="catch_up",
            )
        )
        assert len(specs) == 1
        assert specs[0].name == "morning"
        assert specs[0].priority == "High"
        assert specs[0].missed_run_policy == "catch_up"
        assert specs[0].variables == {"env": "prod"}

    @pytest.mark.parametrize(
        "entries",
        [
            [{"name": "x", "cron": "bad cron", "diagram_path": "a"}],  # bad cron
            [{"name": "x", "cron": "* * * * *"}],  # missing diagram_path
            [{"name": "", "cron": "* * * * *", "diagram_path": "a"}],  # empty name
            [{"cron": "* * * * *", "diagram_path": "a"}],  # missing name
            [  # duplicate names
                {"name": "x", "cron": "* * * * *", "diagram_path": "a"},
                {"name": "x", "cron": "0 0 * * *", "diagram_path": "b"},
            ],
            [  # bad policy
                {
                    "name": "x",
                    "cron": "* * * * *",
                    "diagram_path": "a",
                    "missed_run_policy": "whenever",
                },
            ],
            [  # bad variables type
                {
                    "name": "x",
                    "cron": "* * * * *",
                    "diagram_path": "a",
                    "variables": [1],
                },
            ],
        ],
    )
    def test_invalid_configs_raise(self, tmp_path: Path, entries: list[dict]) -> None:
        file = _write_schedules(tmp_path / "s.json", entries)
        with pytest.raises(ScheduleConfigError):
            load_schedules(file)

    def test_invalid_json_raises(self, tmp_path: Path) -> None:
        file = tmp_path / "s.json"
        file.write_text("{broken", encoding="utf-8")
        with pytest.raises(ScheduleConfigError, match="invalid schedules JSON"):
            load_schedules(file)


class TestScheduleManager:
    """Due-occurrence evaluation and enqueueing."""

    def test_fires_at_next_slot_after_anchor(
        self, tmp_path: Path, store: SQLiteQueueStore
    ) -> None:
        spec = load_schedules(
            _single_schedule_file(tmp_path, "s1", "0 9 * * *", "a.process")
        )[0]
        anchor = datetime(2026, 10, 28, 10, 0, tzinfo=UTC)
        manager = ScheduleManager([spec], ScheduleState(), store, "jobs", anchor=anchor)
        # Not yet 9:00 of the next day -> nothing due.
        assert manager.tick(anchor + timedelta(hours=2)) == []
        fired = manager.tick(anchor + timedelta(days=1))
        assert len(fired) == 1
        item = store.get_next_item("jobs", timeout_seconds=0.0)
        assert item is not None
        assert item.payload == {"diagram_path": "a.process", "variables": {}}
        # get_next_item acquires a lease, so the item shows as In Progress.
        assert store.get_queue_stats("jobs")[QueueItemStatus.IN_PROGRESS.value] == 1

    def test_state_persists_and_prevents_double_fire(self, tmp_path: Path) -> None:
        file = tmp_path / "schedules.json"
        file.write_text(
            json.dumps(
                [{"name": "s1", "cron": "* * * * *", "diagram_path": "a.process"}]
            ),
            encoding="utf-8",
        )
        specs = load_schedules(file)
        state_path = tmp_path / "state.json"
        store = SQLiteQueueStore(db_path=tmp_path / "q.db")

        anchor = datetime(2026, 10, 28, 10, 0, 30, tzinfo=UTC)
        state = ScheduleState(state_path)
        manager = ScheduleManager(specs, state, store, "jobs", anchor=anchor)

        now = anchor + timedelta(minutes=2)
        assert len(manager.tick(now)) == 1  # minute-boundary slot fired
        assert len(manager.tick(now + timedelta(seconds=10))) == 0  # no double fire

        # A fresh manager reading the same state does not re-fire.
        reloaded = ScheduleManager(
            specs, ScheduleState(state_path), store, "jobs", anchor=anchor
        )
        assert len(reloaded.tick(now + timedelta(seconds=20))) == 0
        assert store.get_queue_stats("jobs")[QueueItemStatus.NEW.value] == 1

    def test_skip_policy_fires_latest_only(self, tmp_path: Path) -> None:
        file = tmp_path / "schedules.json"
        file.write_text(
            json.dumps(
                [
                    {
                        "name": "s1",
                        "cron": "0 * * * *",  # hourly
                        "diagram_path": "a.process",
                        "missed_run_policy": "skip",
                    }
                ]
            ),
            encoding="utf-8",
        )
        specs = load_schedules(file)
        store = SQLiteQueueStore(db_path=tmp_path / "q.db")
        anchor = datetime(2026, 10, 28, 9, 30, tzinfo=UTC)
        manager = ScheduleManager(specs, ScheduleState(), store, "jobs", anchor=anchor)

        # Anchor at 9:30; by 13:00 the 10:00..13:00 slots (4) were missed.
        fired = manager.tick(datetime(2026, 10, 28, 13, 0, tzinfo=UTC))
        assert len(fired) == 1  # only the latest (13:00) occurrence

    def test_catch_up_policy_fires_all_missed(self, tmp_path: Path) -> None:
        file = tmp_path / "schedules.json"
        file.write_text(
            json.dumps(
                [
                    {
                        "name": "s1",
                        "cron": "0 * * * *",
                        "diagram_path": "a.process",
                        "missed_run_policy": "catch_up",
                    }
                ]
            ),
            encoding="utf-8",
        )
        specs = load_schedules(file)
        store = SQLiteQueueStore(db_path=tmp_path / "q.db")
        anchor = datetime(2026, 10, 28, 9, 30, tzinfo=UTC)
        manager = ScheduleManager(specs, ScheduleState(), store, "jobs", anchor=anchor)

        fired = manager.tick(datetime(2026, 10, 28, 13, 0, tzinfo=UTC))
        assert len(fired) == 4  # 10:00, 11:00, 12:00, 13:00

    def test_reference_and_priority_reach_queue(self, tmp_path: Path) -> None:
        file = tmp_path / "schedules.json"
        file.write_text(
            json.dumps(
                [
                    {
                        "name": "s1",
                        "cron": "* * * * *",
                        "diagram_path": "a.process",
                        "reference": "sched-ref",
                        "priority": "Low",
                    }
                ]
            ),
            encoding="utf-8",
        )
        specs = load_schedules(file)
        store = SQLiteQueueStore(db_path=tmp_path / "q.db")
        anchor = datetime(2026, 10, 28, 10, 0, 30, tzinfo=UTC)
        manager = ScheduleManager(specs, ScheduleState(), store, "jobs", anchor=anchor)
        manager.tick(anchor + timedelta(minutes=1))

        item = store.get_next_item("jobs", timeout_seconds=0.0)
        assert item is not None
        assert item.reference == "sched-ref"
        assert item.priority.value == "Low"


class TestDaemonIntegration:
    """End-to-end: the daemon polling loop enqueues and runs scheduled items."""

    def test_daemon_runs_scheduled_process(self, tmp_path: Path) -> None:
        from rpaforge.runner.daemon import RunnerDaemon, SQLiteEmbeddedQueue
        from rpaforge.runner.schedules import ScheduleManager

        diagram = {
            "version": "1.1.0",
            "metadata": {"id": "sched_run", "name": "Scheduled Process"},
            "nodes": [
                {
                    "id": "start",
                    "type": "start",
                    "label": "Start",
                    "position": {"x": 0, "y": 0},
                    "data": {"blockData": {"type": "start"}},
                }
            ],
            "edges": [],
            "variables": [],
        }
        proc_file = tmp_path / "scheduled.process"
        proc_file.write_text(json.dumps(diagram), encoding="utf-8")

        specs = load_schedules(
            _single_schedule_file(tmp_path, "minutely", "* * * * *", str(proc_file))
        )
        store = SQLiteQueueStore(db_path=tmp_path / "q.db")
        # Anchor 90s in the past: at least one minute boundary is inside the
        # (anchor, now] window, so the daemon's first tick has a due slot.
        anchor = datetime.now(timezone.utc) - timedelta(seconds=90)
        manager = ScheduleManager(
            specs,
            ScheduleState(tmp_path / "state.json"),
            store,
            "sched-queue",
            anchor=anchor,
        )

        backend = SQLiteEmbeddedQueue(db_path=tmp_path / "q.db")
        daemon = RunnerDaemon(
            queue_name="sched-queue",
            backend=backend,
            concurrency=1,
            poll_interval=0.05,
            max_tasks=1,
            schedule_manager=manager,
        )
        exit_code = daemon.run()
        assert exit_code == 0
        assert daemon.processed_count == 1

        stats = store.get_queue_stats("sched-queue")
        assert stats[QueueItemStatus.SUCCESSFUL.value] == 1
        # State file persisted the last-enqueued instant.
        assert ScheduleState(tmp_path / "state.json").get("minutely") is not None


class TestUpsertSchedule:
    """PUT /schedules file mutation (issue #857)."""

    def test_creates_file_when_missing(self, tmp_path: Path) -> None:
        from rpaforge.runner.schedules import upsert_schedule

        path = tmp_path / "schedules.json"
        spec = upsert_schedule(
            path,
            {"name": "nightly", "cron": "0 2 * * *", "diagram_path": "n.process"},
        )
        assert spec.name == "nightly"
        assert spec.cron.expression == "0 2 * * *"
        entries = json.loads(path.read_text(encoding="utf-8"))
        assert [e["name"] for e in entries] == ["nightly"]

    def test_replaces_same_name_keeps_others(self, tmp_path: Path) -> None:
        from rpaforge.runner.schedules import upsert_schedule

        path = _write_schedules(
            tmp_path / "s.json",
            [{"name": "a", "cron": "* * * * *", "diagram_path": "a.process"}],
        )
        upsert_schedule(
            path,
            {"name": "a", "cron": "0 0 * * *", "diagram_path": "b.process"},
        )
        upsert_schedule(
            path,
            {"name": "c", "cron": "30 9 * * 1-5", "diagram_path": "c.process"},
        )
        entries = json.loads(path.read_text(encoding="utf-8"))
        by_name = {e["name"]: e for e in entries}
        assert by_name["a"]["cron"] == "0 0 * * *"
        assert by_name["c"]["diagram_path"] == "c.process"
        assert len(entries) == 2

    def test_invalid_entry_rejected_without_write(self, tmp_path: Path) -> None:
        from rpaforge.runner.schedules import upsert_schedule

        path = _write_schedules(
            tmp_path / "s.json",
            [{"name": "a", "cron": "* * * * *", "diagram_path": "a.process"}],
        )
        before = path.read_text(encoding="utf-8")
        with pytest.raises(ScheduleConfigError):
            upsert_schedule(path, {"name": "bad", "cron": "bogus"})
        assert path.read_text(encoding="utf-8") == before

    def test_non_dict_entry_rejected(self, tmp_path: Path) -> None:
        from rpaforge.runner.schedules import upsert_schedule

        with pytest.raises(ScheduleConfigError, match="must be an object"):
            upsert_schedule(tmp_path / "s.json", "nope")


class TestDeleteSchedule:
    """DELETE /schedules file mutation (issue #876)."""

    def test_removes_target_keeps_others(self, tmp_path: Path) -> None:
        from rpaforge.runner.schedules import delete_schedule

        path = _write_schedules(
            tmp_path / "s.json",
            [
                {"name": "a", "cron": "* * * * *", "diagram_path": "a.process"},
                {"name": "b", "cron": "0 0 * * *", "diagram_path": "b.process"},
            ],
        )
        assert delete_schedule(path, "a") is True
        entries = json.loads(path.read_text(encoding="utf-8"))
        assert [e["name"] for e in entries] == ["b"]

    def test_missing_name_returns_false_without_write(self, tmp_path: Path) -> None:
        from rpaforge.runner.schedules import delete_schedule

        path = _write_schedules(
            tmp_path / "s.json",
            [{"name": "a", "cron": "* * * * *", "diagram_path": "a.process"}],
        )
        before = path.read_text(encoding="utf-8")
        assert delete_schedule(path, "ghost") is False
        assert path.read_text(encoding="utf-8") == before

    def test_missing_file_returns_false(self, tmp_path: Path) -> None:
        from rpaforge.runner.schedules import delete_schedule

        assert delete_schedule(tmp_path / "absent.json", "a") is False

    def test_invalid_json_raises(self, tmp_path: Path) -> None:
        from rpaforge.runner.schedules import delete_schedule

        path = tmp_path / "s.json"
        path.write_text("{not json", encoding="utf-8")
        with pytest.raises(ScheduleConfigError, match="cannot update"):
            delete_schedule(path, "a")


class TestSpecsHotReload:
    """ScheduleManager mtime-based hot reload (issue #857)."""

    def test_tick_reloads_changed_specs(
        self, tmp_path: Path, store: SQLiteQueueStore
    ) -> None:
        path = _single_schedule_file(tmp_path, "first", "* * * * *")
        manager = ScheduleManager(
            specs=load_schedules(path),
            state=ScheduleState(),
            store=store,
            queue_name="q",
            anchor=datetime(2026, 6, 1, tzinfo=UTC),
            specs_path=path,
        )
        assert [s.name for s in manager.specs] == ["first"]

        # Remote upsert replaces the file behind the manager's back.
        _write_schedules(
            path,
            [
                {"name": "first", "cron": "*/5 * * * *", "diagram_path": "a.process"},
                {"name": "second", "cron": "0 12 * * *", "diagram_path": "b.process"},
            ],
        )
        manager.tick(datetime(2026, 6, 1, 0, 1, tzinfo=UTC))
        assert {s.name for s in manager.specs} == {"first", "second"}
        assert {s.cron.expression for s in manager.specs} == {
            "*/5 * * * *",
            "0 12 * * *",
        }

    def test_invalid_file_keeps_previous_specs(
        self, tmp_path: Path, store: SQLiteQueueStore
    ) -> None:
        path = _single_schedule_file(tmp_path, "first", "* * * * *")
        manager = ScheduleManager(
            specs=load_schedules(path),
            state=ScheduleState(),
            store=store,
            queue_name="q",
            anchor=datetime(2026, 6, 1, tzinfo=UTC),
            specs_path=path,
        )
        path.write_text("{not json", encoding="utf-8")
        manager.tick(datetime(2026, 6, 1, 0, 1, tzinfo=UTC))
        assert [s.name for s in manager.specs] == ["first"]
