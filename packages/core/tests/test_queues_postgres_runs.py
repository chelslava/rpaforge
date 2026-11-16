"""Runs/cancel surface of :class:`PostgreSQLQueueStore` (issue #887).

CI has no Postgres, so every statement the store issues is exercised through
a conformance fake connection: an in-memory row store that interprets exactly
the SQL shapes :mod:`rpaforge.queues.postgres_store` uses. A DSN-gated e2e
mirrors the two-stores-see-each-other acceptance against a real Postgres when
``RPAFORGE_TEST_PG_DSN`` is provided.
"""

from __future__ import annotations

import os
import re
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

import pytest

from rpaforge.queues.postgres_store import PostgreSQLQueueStore
from rpaforge.queues.sqlite_store import SQLiteQueueStore
from rpaforge.runner.serve import ServeApp, ServeConfig


class _FakeCursor:
    """Executes the store's statements against an in-memory row store."""

    def __init__(self, conn: _FakeConnection) -> None:
        self._conn = conn
        self._rowcount = 0
        self._result: list[tuple] = []

    def execute(self, query: str, params: Any = None) -> None:
        self._result = []
        self._rowcount = 0
        normalized = re.sub(r"\s+", " ", query).strip()
        params = tuple(params or ())
        db = self._conn.db

        if normalized.startswith(("CREATE", "ALTER", "NOTIFY")):
            return

        if normalized.startswith("INSERT INTO work_queue_items"):
            (
                item_id,
                queue_name,
                reference,
                priority,
                payload_json,
                status,
                max_retries,
                defer_until,
                created_at,
                updated_at,
            ) = params
            db["items"][item_id] = {
                "id": item_id,
                "queue_name": queue_name,
                "reference": reference,
                "priority": priority,
                "payload_json": payload_json,
                "status": status,
                "retry_count": 0,
                "max_retries": max_retries,
                "lock_expires_at": None,
                "defer_until": defer_until,
                "error_message": None,
                "created_at": created_at,
                "updated_at": updated_at,
                "cancel_requested": False,
            }
            self._rowcount = 1
            return

        if normalized.startswith("INSERT INTO run_records"):
            item_id, queue_name, started_at = params
            existing = db["runs"].get(item_id)
            db["runs"][item_id] = {
                "item_id": item_id,
                "queue_name": queue_name,
                "run_id": None,
                "diagram_path": None,
                "status": "running",
                "exit_code": None,
                "started_at": started_at,
                "finished_at": None,
                "audit_path": None,
                "error_message": None,
            }
            if existing is not None:
                # ON CONFLICT DO UPDATE: reset to a fresh running state.
                db["runs"][item_id]["started_at"] = started_at
            self._rowcount = 1
            return

        if normalized.startswith("UPDATE run_records"):
            (
                run_id,
                diagram_path,
                status,
                exit_code,
                finished_at,
                audit_path,
                error_message,
                item_id,
            ) = params
            record = db["runs"].get(item_id)
            if record is None:
                return
            record.update(
                run_id=run_id,
                diagram_path=diagram_path,
                status=status,
                exit_code=exit_code,
                finished_at=finished_at,
                audit_path=audit_path,
                error_message=error_message,
            )
            self._rowcount = 1
            return

        if normalized.startswith("UPDATE work_queue_items"):
            item = db["items"].get(params[-1])
            if item is None:
                return
            if "cancel_requested = TRUE" in normalized:
                # request_cancel: (reason, updated_at, item_id)
                reason, updated_at, _item_id = params
                if item["status"] != "InProgress":
                    return
                item["cancel_requested"] = True
                item["error_message"] = reason
                item["updated_at"] = updated_at
            elif "status = 'InProgress'" in normalized:
                # get_next_item pickup: (lock_expires_at, updated_at, item_id)
                lock_exp, updated_at, _item_id = params
                if item["status"] not in ("New", "Retried"):
                    return
                item["status"] = "InProgress"
                item["lock_expires_at"] = lock_exp
                item["updated_at"] = updated_at
            elif "retry_count = %s" in normalized:
                # set_item_status: (status, retry_count, error, defer, updated, id)
                status, retry_count, error_message, defer_until, updated_at, _ = params
                if status == "Failed":
                    status = "DeadLetter"
                item["status"] = status
                item["retry_count"] = retry_count
                item["error_message"] = error_message
                item["lock_expires_at"] = None
                item["defer_until"] = defer_until
                item["updated_at"] = updated_at
            elif "IN ('New', 'Retried')" in normalized:
                # cancel_item: (status, error_message, updated_at, item_id)
                status, error_message, updated_at, _item_id = params
                if item["status"] not in ("New", "Retried"):
                    return
                item["status"] = status
                item["error_message"] = error_message
                item["lock_expires_at"] = None
                item["defer_until"] = None
                item["updated_at"] = updated_at
            else:
                raise AssertionError(f"unsupported UPDATE shape: {normalized}")
            self._rowcount = 1
            return

        if normalized.startswith("SELECT id FROM work_queue_items"):
            queue_name = params[0]
            self._result = [
                (item_id,)
                for item_id, item in db["items"].items()
                if item["queue_name"] == queue_name
                and item["status"] == "InProgress"
                and item["cancel_requested"]
            ]
            return

        if normalized.startswith("SELECT status FROM work_queue_items"):
            item = db["items"].get(params[0])
            if item is not None:
                self._result = [(item["status"],)]
            return

        if normalized.startswith(
            "SELECT id, queue_name, reference, priority, payload_json, status"
        ):
            item_rows = [self._item_row(item) for item in db["items"].values()]
            if "WHERE id = %s" in normalized:
                match = [row for row in item_rows if row[0] == params[0]]
            elif "FOR UPDATE SKIP LOCKED" in normalized:
                # get_next_item fetch: eligible items by priority/created_at.
                queue_name = params[0]
                eligible = [
                    row
                    for row in item_rows
                    if row[1] == queue_name
                    and row[5] in ("New", "Retried")
                    and (row[9] is None or str(row[9]) <= str(params[1]))
                ]
                prio_rank = {"High": 1, "Normal": 2, "Low": 3}
                eligible.sort(key=lambda r: (prio_rank.get(r[3], 4), r[11]))
                match = eligible[:1]
            else:
                raise AssertionError(f"unsupported query shape: {normalized}")
            self._result = match
            return

        if normalized.startswith("SELECT item_id, queue_name, run_id"):
            if "WHERE item_id" in normalized:
                record = db["runs"].get(params[0])
                if record is not None:
                    self._result = [self._run_row(record)]
                return
            queue_name = params[0]
            status = params[1] if "AND status = %s" in normalized else None
            limit = params[-1]
            matched = [
                record
                for record in db["runs"].values()
                if record["queue_name"] == queue_name
                and (status is None or record["status"] == status)
            ]
            matched.sort(key=lambda r: (r["started_at"], r["item_id"]), reverse=True)
            self._result = [self._run_row(r) for r in matched[:limit]]
            return

        raise AssertionError(f"unsupported query shape: {normalized}")

    @staticmethod
    def _item_row(item: dict[str, Any]) -> tuple:
        return (
            item["id"],
            item["queue_name"],
            item["reference"],
            item["priority"],
            item["payload_json"],
            item["status"],
            item["retry_count"],
            item["max_retries"],
            item["lock_expires_at"],
            item["defer_until"],
            item["error_message"],
            item["created_at"],
            item["updated_at"],
        )

    @staticmethod
    def _run_row(record: dict[str, Any]) -> tuple:
        return (
            record["item_id"],
            record["queue_name"],
            record["run_id"],
            record["diagram_path"],
            record["status"],
            record["exit_code"],
            record["started_at"],
            record["finished_at"],
            record["audit_path"],
            record["error_message"],
        )

    def fetchone(self) -> tuple | None:
        return self._result[0] if self._result else None

    def fetchall(self) -> list[tuple]:
        return list(self._result)

    @property
    def rowcount(self) -> int:
        return self._rowcount

    def __enter__(self) -> _FakeCursor:
        return self

    def __exit__(self, *exc: Any) -> None:
        return None


class _FakeConnection:
    """One shared in-memory "database" for one or many store instances."""

    def __init__(self) -> None:
        #: {"items": {id: row}, "runs": {item_id: row}}
        self.db: dict[str, dict[str, dict[str, Any]]] = {
            "items": {},
            "runs": {},
        }

    def cursor(self) -> _FakeCursor:
        return _FakeCursor(self)

    def commit(self) -> None:
        return None


def _pg_store(conn: _FakeConnection) -> PostgreSQLQueueStore:
    return PostgreSQLQueueStore(conn)


class TestPostgresRunsSurface:
    """Store-level runs semantics mirrored from the sqlite store."""

    def test_record_started_and_finished_round_trip(self) -> None:
        store = _pg_store(_FakeConnection())
        item = store.add_item("jobs", {"diagram_path": "job.process"})
        store.record_run_started(item.id, "jobs")

        running = store.get_run(item.id)
        assert running is not None
        assert running["status"] == "running"
        assert running["queue_name"] == "jobs"
        assert running["finished_at"] is None

        store.record_run_finished(
            item.id,
            run_id="run-123",
            diagram_path="job.process",
            status="success",
            exit_code=0,
            audit_path="/tmp/audit.json",
        )
        doc = store.get_run(item.id)
        assert doc is not None
        assert doc["status"] == "success"
        assert doc["run_id"] == "run-123"
        assert doc["exit_code"] == 0
        assert doc["audit_path"] == "/tmp/audit.json"
        assert doc["error"] is None
        for key in (
            "item_id",
            "queue_name",
            "run_id",
            "diagram_path",
            "status",
            "exit_code",
            "started_at",
            "finished_at",
            "audit_path",
            "error",
        ):
            assert key in doc
        # Payload parity with the sqlite store: ISO timestamp strings.
        assert isinstance(doc["started_at"], str)
        assert isinstance(doc["finished_at"], str)

    def test_started_at_normalized_to_utc_iso(self) -> None:
        store = _pg_store(_FakeConnection())
        conn = store.dsn_or_connection
        item_id = "item-tz"
        # A session timezone other than UTC (what psycopg returns for
        # TIMESTAMPTZ): the served doc must still be a UTC ISO string.
        offset = timezone(timedelta(hours=2))
        conn.db["runs"][item_id] = {
            "item_id": item_id,
            "queue_name": "jobs",
            "run_id": None,
            "diagram_path": None,
            "status": "running",
            "exit_code": None,
            "started_at": datetime(2026, 11, 15, 12, 0, 0, tzinfo=offset),
            "finished_at": None,
            "audit_path": None,
            "error_message": None,
        }
        doc = store.get_run(item_id)
        assert doc is not None
        assert doc["started_at"] == "2026-11-15T10:00:00+00:00"

    def test_rerun_resets_finished_record(self) -> None:
        store = _pg_store(_FakeConnection())
        item = store.add_item("jobs", {"diagram_path": "job.process"})
        store.record_run_started(item.id, "jobs")
        store.record_run_finished(
            item.id, status="failed", exit_code=1, error_message="boom"
        )

        # Requeued item runs again: the record must return to a fresh state.
        store.record_run_started(item.id, "jobs")
        doc = store.get_run(item.id)
        assert doc is not None
        assert doc["status"] == "running"
        assert doc["run_id"] is None
        assert doc["exit_code"] is None
        assert doc["error"] is None
        assert doc["finished_at"] is None

    def test_list_runs_ordering_limit_and_status_filter(self) -> None:
        store = _pg_store(_FakeConnection())
        base = datetime(2026, 11, 15, 10, 0, 0, tzinfo=timezone.utc)
        for i, status in enumerate(("failed", "success", "success")):
            item_id = f"item-{i}"
            store.dsn_or_connection.db["runs"][item_id] = {
                "item_id": item_id,
                "queue_name": "jobs",
                "run_id": f"run-{i}",
                "diagram_path": "job.process",
                "status": status,
                "exit_code": 0,
                "started_at": base + timedelta(minutes=i),
                "finished_at": None,
                "audit_path": None,
                "error_message": None,
            }
        # A run of another queue must not leak into "jobs" listings.
        store.dsn_or_connection.db["runs"]["other"] = {
            "item_id": "other",
            "queue_name": "other-queue",
            "run_id": "run-x",
            "diagram_path": "x.process",
            "status": "success",
            "exit_code": 0,
            "started_at": base,
            "finished_at": None,
            "audit_path": None,
            "error_message": None,
        }

        runs = store.list_runs("jobs")
        assert [r["item_id"] for r in runs] == ["item-2", "item-1", "item-0"]

        assert [r["item_id"] for r in store.list_runs("jobs", limit=2)] == [
            "item-2",
            "item-1",
        ]
        assert store.list_runs("jobs", limit=0)[0]["item_id"] == "item-2"

        filtered = store.list_runs("jobs", status="success")
        assert [r["item_id"] for r in filtered] == ["item-2", "item-1"]
        assert store.list_runs("jobs", status="cancelled") == []
        assert store.list_runs("jobs", status="  ")[0]["item_id"] == "item-2"

    def test_get_run_unknown_returns_none(self) -> None:
        store = _pg_store(_FakeConnection())
        assert store.get_run("missing") is None


class TestPostgresCancelSurface:
    """Queued cancel vs cooperative running cancel (sqlite parity)."""

    def test_cancel_queued_item(self) -> None:
        store = _pg_store(_FakeConnection())
        item = store.add_item("jobs", {"diagram_path": "job.process"})

        cancelled = store.cancel_item(item.id, reason="control plane")
        assert cancelled.status.value == "Cancelled"
        assert cancelled.error_message == "control plane"
        # A cancelled item is no longer fetchable by the daemon.
        assert store.get_next_item("jobs", timeout_seconds=0.0) is None

    def test_cancel_finished_item_raises(self) -> None:
        store = _pg_store(_FakeConnection())
        item = store.add_item("jobs", {"diagram_path": "job.process"})
        store.set_item_status(item.id, status="Successful")
        with pytest.raises(ValueError, match="cannot be cancelled"):
            store.cancel_item(item.id)

    def test_cancel_unknown_item_raises(self) -> None:
        store = _pg_store(_FakeConnection())
        with pytest.raises(ValueError, match="not found"):
            store.cancel_item("missing")

    def test_request_cancel_running_item_sets_flag(self) -> None:
        store = _pg_store(_FakeConnection())
        item = store.add_item("jobs", {"diagram_path": "job.process"})
        picked = store.get_next_item("jobs", timeout_seconds=0.0)
        assert picked is not None

        updated = store.request_cancel(item.id, reason="cancel via control plane")
        assert updated.status.value == "InProgress"
        assert store.get_cancel_requests("jobs") == [item.id]

    def test_request_cancel_queued_item_raises(self) -> None:
        store = _pg_store(_FakeConnection())
        item = store.add_item("jobs", {"diagram_path": "job.process"})
        with pytest.raises(ValueError, match="not running"):
            store.request_cancel(item.id)

    def test_get_item(self) -> None:
        store = _pg_store(_FakeConnection())
        item = store.add_item("jobs", {"diagram_path": "job.process"}, reference="r1")
        fetched = store.get_item(item.id)
        assert fetched.id == item.id
        assert fetched.reference == "r1"
        assert fetched.payload == {"diagram_path": "job.process"}
        with pytest.raises(ValueError, match="not found"):
            store.get_item("missing")


class TestPostgresSharedDbVisibility:
    """Two stores on one database see each other's runs (unit level)."""

    def test_two_stores_share_runs_and_cancel_flags(self) -> None:
        conn = _FakeConnection()
        store_a = _pg_store(conn)
        store_b = _pg_store(conn)

        item = store_a.add_item("jobs", {"diagram_path": "job.process"})
        picked_b = store_b.get_next_item("jobs", timeout_seconds=0.0)
        assert picked_b is not None
        store_b.record_run_started(item.id, "jobs")
        store_b.request_cancel(item.id, reason="cancelled from studio A")

        # Studio A observes the run and the pending cooperative cancel.
        assert store_a.get_cancel_requests("jobs") == [item.id]
        run = store_a.get_run(item.id)
        assert run is not None
        assert run["status"] == "running"
        runs = store_a.list_runs("jobs", status="running")
        assert [r["item_id"] for r in runs] == [item.id]


class TestServeRunsAPIOverPostgres:
    """``GET /runs`` family served from a Postgres-backed store (no 501)."""

    @pytest.fixture()
    def app(self) -> ServeApp:
        store = _pg_store(_FakeConnection())
        return ServeApp(
            ServeConfig(
                queue_name="jobs", token="tok", logs_dir=Path(os.devnull).parent
            ),
            store=store,
        )

    def _seed_finished_run(self, store: PostgreSQLQueueStore, status: str) -> str:
        item = store.add_item("jobs", {"diagram_path": "job.process"})
        store.record_run_started(item.id, "jobs")
        store.record_run_finished(
            item.id,
            run_id="run-123",
            diagram_path="job.process",
            status=status,
            exit_code=0 if status == "success" else 1,
            audit_path=None,
            error_message=None if status == "success" else "boom",
        )
        store.set_item_status(
            item.id,
            status="Successful" if status == "success" else "Failed",
            retry=False,
        )
        return item.id

    def test_runs_payload_served_from_postgres(self, app: ServeApp) -> None:
        store = app.store
        self._seed_finished_run(store, "success")
        self._seed_finished_run(store, "failed")

        status, payload = app.runs_payload(None, None, "Bearer tok")
        assert status == 200
        assert len(payload["runs"]) == 2
        first = payload["runs"][0]
        for key in (
            "item_id",
            "run_id",
            "diagram_path",
            "status",
            "started_at",
            "finished_at",
            "exit_code",
        ):
            assert key in first
        assert {r["status"] for r in payload["runs"]} == {"success", "failed"}

    def test_runs_filter_and_validation_match_sqlite(self, app: ServeApp) -> None:
        store = app.store
        self._seed_finished_run(store, "success")
        assert app.runs_payload("10", "failed", "Bearer tok") == (
            200,
            {"queue": "jobs", "runs": []},
        )
        assert app.runs_payload("abc", None, "Bearer tok")[0] == 400
        assert app.runs_payload("0", None, "Bearer tok")[0] == 400
        assert app.runs_payload(None, "bogus", "Bearer tok")[0] == 400

    def test_run_detail_includes_steps(self, app: ServeApp, tmp_path: Path) -> None:
        store = app.store
        item_id = self._seed_finished_run(store, "success")
        audit_file = tmp_path / "audit.json"
        audit_file.write_text(
            '{"steps": [{"node_id": "n1", "activity": "Log"}]}', encoding="utf-8"
        )
        store.record_run_finished(
            item_id,
            run_id="run-123",
            diagram_path="job.process",
            status="success",
            exit_code=0,
            audit_path=str(audit_file),
        )

        status, payload = app.run_detail(item_id, "Bearer tok")
        assert status == 200
        assert payload["steps"] == [{"node_id": "n1", "activity": "Log"}]
        assert app.run_detail("missing", "Bearer tok")[0] == 404

    def test_logs_payload(self, app: ServeApp, tmp_path: Path) -> None:
        store = app.store
        item_id = self._seed_finished_run(store, "success")

        logs_dir = tmp_path / "logs"
        logs_dir.mkdir()
        app.config.logs_dir = logs_dir

        # No log file yet -> honest 404.
        assert app.run_logs_payload(item_id, None, False, "Bearer tok")[0] == 404
        (logs_dir / f"{item_id}.ndjson").write_text(
            '{"kind":"log"}\n{"kind":"log2"}\n', encoding="utf-8"
        )
        status, payload = app.run_logs_payload(item_id, "1", False, "Bearer tok")
        assert status == 200
        assert payload["lines"] == ['{"kind":"log2"}']
        # Unknown run id still 404s before touching the filesystem.
        assert app.run_logs_payload("missing", None, False, "Bearer tok")[0] == 404

    def test_cancel_lifecycle(self, app: ServeApp) -> None:
        store = app.store
        queued = store.add_item("jobs", {"diagram_path": "job.process"})
        status, payload = app.cancel_run(queued.id, "Bearer tok")
        assert status == 200
        assert payload["stage"] == "before_pickup"

        running = store.add_item("jobs", {"diagram_path": "job.process"})
        store.get_next_item("jobs", timeout_seconds=0.0)
        status, payload = app.cancel_run(running.id, "Bearer tok")
        assert status == 202
        assert payload["stage"] == "cooperative"
        assert payload["status"] == "cancel_requested"

        finished = store.add_item("jobs", {"diagram_path": "job.process"})
        store.record_run_started(finished.id, "jobs")
        store.record_run_finished(finished.id, status="success", exit_code=0)
        store.set_item_status(finished.id, status="Successful", retry=False)
        status, payload = app.cancel_run(finished.id, "Bearer tok")
        assert status == 409

        assert app.cancel_run("missing", "Bearer tok") == (
            404,
            {"error": "unknown run 'missing'"},
        )


class TestPostgresRunsE2E:
    """Two stores on a real Postgres see each other's runs (opt-in)."""

    @pytest.mark.skipif(
        "RPAFORGE_TEST_PG_DSN" not in os.environ,
        reason="requires a real Postgres (set RPAFORGE_TEST_PG_DSN)",
    )
    def test_two_stores_on_shared_dsn(self) -> None:
        dsn = os.environ["RPAFORGE_TEST_PG_DSN"]
        store_a = PostgreSQLQueueStore(dsn)
        store_b = PostgreSQLQueueStore(dsn)

        item = store_a.add_item("jobs", {"diagram_path": "job.process"})
        picked = store_b.get_next_item("jobs", timeout_seconds=0.0)
        assert picked is not None
        store_b.record_run_started(item.id, "jobs")
        store_b.request_cancel(item.id, reason="cross-host cancel")

        assert store_a.get_cancel_requests("jobs") == [item.id]
        run = store_a.get_run(item.id)
        assert run is not None
        assert run["status"] == "running"
        store_b.record_run_finished(item.id, status="success", exit_code=0)
        assert store_a.get_run(item.id)["status"] == "success"


class TestSqliteParityShapes:
    """The runs doc shape is identical across both stores."""

    @staticmethod
    def _sqlite_doc(tmp_path: Path) -> dict[str, Any]:
        store = SQLiteQueueStore(db_path=tmp_path / "q.db")
        item = store.add_item("jobs", {"diagram_path": "job.process"})
        store.record_run_started(item.id, "jobs")
        store.record_run_finished(
            item.id, run_id="run-1", status="success", exit_code=0
        )
        return store.get_run(item.id)  # type: ignore[return-value]

    @staticmethod
    def _pg_doc() -> dict[str, Any]:
        store = _pg_store(_FakeConnection())
        item = store.add_item("jobs", {"diagram_path": "job.process"})
        store.record_run_started(item.id, "jobs")
        store.record_run_finished(
            item.id, run_id="run-1", status="success", exit_code=0
        )
        return store.get_run(item.id)  # type: ignore[return-value]

    def test_same_keys_and_types(self, tmp_path: Path) -> None:
        sqlite_doc = self._sqlite_doc(tmp_path)
        pg_doc = self._pg_doc()
        assert set(sqlite_doc) == set(pg_doc)
        for key, sqlite_value in sqlite_doc.items():
            pg_value = pg_doc[key]
            # Nullability parity for every field.
            assert (pg_value is None) == (sqlite_value is None), key
            if sqlite_value is None:
                continue
            if key in ("started_at", "finished_at"):
                # Timestamps differ in clock value; both are ISO strings.
                assert isinstance(pg_value, str), key
            else:
                assert isinstance(pg_value, type(sqlite_value)), key
        # Fixed-value fields must match exactly across stores.
        for key in ("status", "exit_code", "run_id", "diagram_path"):
            assert pg_doc[key] == sqlite_doc[key], key
