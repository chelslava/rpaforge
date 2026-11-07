"""Tests for the daemon/serve queue backend selection (issue #864)."""

from __future__ import annotations

import argparse
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest

from rpaforge.cli.run import RunExitCode
from rpaforge.queues.models import QueueItem, QueueItemStatus, QueuePriority
from rpaforge.runner.cli import _build_queue_backend, _serve_command
from rpaforge.runner.daemon import PostgresEmbeddedQueue, SQLiteEmbeddedQueue
from rpaforge.runner.serve import ServeApp, ServeConfig


def _args(**overrides: object) -> argparse.Namespace:
    defaults: dict[str, object] = {
        "backend": "sqlite",
        "pg_dsn": None,
        "db_path": None,
    }
    defaults.update(overrides)
    return argparse.Namespace(**defaults)


def _fake_item(item_id: str = "i-1") -> QueueItem:
    return QueueItem(
        id=item_id,
        queue_name="q",
        payload={"diagram_path": "p.json"},
        priority=QueuePriority.NORMAL,
        status=QueueItemStatus.NEW,
    )


class TestBuildQueueBackend:
    """CLI backend selection and fail-closed validation (issue #864)."""

    def test_default_backend_is_sqlite(self):
        backend, warnings, error = _build_queue_backend(_args())
        assert isinstance(backend, SQLiteEmbeddedQueue)
        assert warnings == []
        assert error is None

    def test_sqlite_with_pg_dsn_warns_about_footgun(self):
        backend, warnings, error = _build_queue_backend(
            _args(pg_dsn="postgresql://example/db")
        )
        assert isinstance(backend, SQLiteEmbeddedQueue)
        assert error is None
        assert len(warnings) == 1
        assert "LISTEN/NOTIFY" in warnings[0]
        assert "--backend postgres" in warnings[0]

    def test_postgres_without_dsn_rejected(self, monkeypatch):
        monkeypatch.delenv("RPAFORGE_PG_DSN", raising=False)
        backend, warnings, error = _build_queue_backend(_args(backend="postgres"))
        assert backend is None
        assert error is not None
        assert "--pg-dsn" in error
        assert "RPAFORGE_PG_DSN" in error

    def test_postgres_dsn_validated_eagerly_fail_closed(self, monkeypatch):
        """An unreachable DSN fails construction (typed error, no daemon)."""
        from rpaforge.queues import postgres_store as pg_module

        monkeypatch.setenv("RPAFORGE_PG_DSN", "postgresql://127.0.0.1:1/nodb")
        monkeypatch.setattr(
            pg_module,
            "PostgreSQLQueueStore",
            MagicMock(side_effect=Exception("connection refused")),
        )
        backend, _warnings, error = _build_queue_backend(_args(backend="postgres"))
        assert backend is None
        assert error is not None
        assert "validation failed" in error
        assert "connection refused" in error

    def test_postgres_selection_with_fake_store(self, monkeypatch):
        from rpaforge.queues import postgres_store as pg_module

        fake_store = MagicMock()
        fake_store.get_next_item.return_value = _fake_item()
        monkeypatch.setattr(
            pg_module, "PostgreSQLQueueStore", MagicMock(return_value=fake_store)
        )
        backend, warnings, error = _build_queue_backend(
            _args(backend="postgres", pg_dsn="postgresql://ok/db")
        )
        assert error is None
        assert warnings == []
        assert isinstance(backend, PostgresEmbeddedQueue)
        assert backend.store is fake_store

        item = backend.fetch_next_item("q")
        assert item is not None
        assert item.item_id == "i-1"
        assert item.diagram_path == "p.json"
        backend.mark_completed("i-1")
        backend.mark_failed("i-2", "boom")
        fake_store.set_item_status.assert_any_call(
            "i-1", status=QueueItemStatus.SUCCESSFUL
        )
        fake_store.set_item_status.assert_any_call(
            "i-2",
            status=QueueItemStatus.FAILED,
            error_message="boom",
            retry=True,
        )

    def test_cli_parser_rejects_unknown_backend(self):
        from rpaforge.runner.cli import main

        with pytest.raises(SystemExit):
            main(["daemon", "--queue", "q", "--backend", "oracle"])


class TestServeBackendReporting:
    """/healthz reports the active queue backend (issue #864)."""

    def test_health_reports_sqlite_by_default(self):
        config = ServeConfig(queue_name="q")
        app = ServeApp(config)
        assert app.health_payload()["queue_backend"] == "sqlite"

    def test_health_and_metrics_report_postgres(self):
        store = MagicMock()
        store.get_queue_stats.return_value = {"depth": 0}
        config = ServeConfig(queue_name="q", backend_name="postgres")
        app = ServeApp(config, store=store)
        assert app.health_payload()["queue_backend"] == "postgres"
        assert app.metrics_payload()["queue"] == "q"

    def test_serve_postgres_without_dsn_exits_configuration_error(self, monkeypatch):
        monkeypatch.delenv("RPAFORGE_PG_DSN", raising=False)

        def unexpected(*_a: object, **_k: object) -> int:  # pragma: no cover
            raise AssertionError("serve() must not run with an invalid backend")

        monkeypatch.setattr("rpaforge.runner.cli.serve", unexpected)
        args = SimpleNamespace(
            queue="q",
            db_path=None,
            backend="postgres",
            pg_dsn=None,
            host="127.0.0.1",
            port=8765,
            token=None,
            quiet=True,
            ndjson=False,
        )
        exit_code = _serve_command(args)
        assert exit_code == int(RunExitCode.CONFIGURATION_ERROR)


@pytest.mark.skipif(
    "RPAFORGE_TEST_PG_DSN" not in __import__("os").environ,
    reason="requires a real Postgres (set RPAFORGE_TEST_PG_DSN)",
)
def test_postgres_backend_end_to_end():
    """Two backends on the same DSN see each other's items (CI: service container)."""
    import os

    dsn = os.environ["RPAFORGE_TEST_PG_DSN"]
    from rpaforge.queues.postgres_store import PostgreSQLQueueStore

    store_a = PostgreSQLQueueStore(dsn)
    store_b = PostgreSQLQueueStore(dsn)
    store_a.add_item("q", payload={"diagram_path": "p.json"})
    seen = store_b.get_next_item("q", timeout_seconds=0.0)
    assert seen is not None
