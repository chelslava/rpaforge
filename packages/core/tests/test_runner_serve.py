"""Tests for the ``rpaforge-runner serve`` HTTP control plane (issue #817)."""

from __future__ import annotations

import http.client
import json
import threading
from http.server import ThreadingHTTPServer
from pathlib import Path

import pytest

from rpaforge.queues.models import QueueItemStatus
from rpaforge.queues.sqlite_store import SQLiteQueueStore
from rpaforge.runner.serve import ServeApp, ServeConfig, make_handler


@pytest.fixture()
def store(tmp_path: Path) -> SQLiteQueueStore:
    """Fresh SQLite queue store in a temp directory."""
    return SQLiteQueueStore(db_path=tmp_path / "queue.db")


def _start_server(app: ServeApp) -> tuple[ThreadingHTTPServer, int]:
    """Start the control-plane server on an ephemeral port; returns (server, port)."""
    httpd = ThreadingHTTPServer(("127.0.0.1", 0), make_handler(app))
    thread = threading.Thread(target=httpd.serve_forever, daemon=True)
    thread.start()
    return httpd, httpd.server_address[1]


def _request(
    port: int,
    method: str,
    path: str,
    body: dict | None = None,
    headers: dict[str, str] | None = None,
) -> tuple[int, dict]:
    """One HTTP round-trip; returns (status, parsed JSON body)."""
    conn = http.client.HTTPConnection("127.0.0.1", port, timeout=5)
    payload = json.dumps(body).encode("utf-8") if body is not None else None
    request_headers = {"Content-Type": "application/json"}
    if payload is not None:
        request_headers["Content-Length"] = str(len(payload))
    request_headers.update(headers or {})
    conn.request(method, path, body=payload, headers=request_headers)
    response = conn.getresponse()
    data = json.loads(response.read().decode("utf-8"))
    conn.close()
    return response.status, data


class TestServeAppLogic:
    """HTTP-agnostic request logic."""

    def test_trigger_requires_token(self, store: SQLiteQueueStore) -> None:
        app = ServeApp(ServeConfig(queue_name="q", token=None), store=store)
        status, payload = app.trigger({"diagram_path": "a.process"})
        assert status == 403
        assert "RPAFORGE_SERVE_TOKEN" in payload["error"]

    def test_trigger_rejects_wrong_token(self, store: SQLiteQueueStore) -> None:
        app = ServeApp(ServeConfig(queue_name="q", token="secret"), store=store)
        status, _ = app.trigger({"diagram_path": "a.process"}, "Bearer wrong")
        assert status == 401
        status, _ = app.trigger({"diagram_path": "a.process"}, token_header="wrong")
        assert status == 401

    def test_trigger_accepts_bearer_and_header_token(
        self, store: SQLiteQueueStore
    ) -> None:
        app = ServeApp(ServeConfig(queue_name="q", token="secret"), store=store)
        for auth_kwargs in (
            {"authorization_header": "Bearer secret"},
            {"token_header": "secret"},
        ):
            status, payload = app.trigger({"diagram_path": "a.process"}, **auth_kwargs)
            assert status == 202
            assert payload["status"] == "queued"
        assert store.get_queue_stats("q")[QueueItemStatus.NEW.value] == 2

    def test_trigger_enqueues_daemon_payload_convention(
        self, store: SQLiteQueueStore
    ) -> None:
        app = ServeApp(ServeConfig(queue_name="q", token="t"), store=store)
        status, payload = app.trigger(
            {
                "diagram_path": "invoice.process",
                "variables": {"env": "prod"},
                "reference": "INV-1",
                "priority": "High",
            },
            "Bearer t",
        )
        assert status == 202
        item = store.get_next_item("q", timeout_seconds=0.0)
        assert item is not None
        assert item.id == payload["item_id"]
        assert item.payload == {
            "diagram_path": "invoice.process",
            "variables": {"env": "prod"},
        }
        assert item.reference == "INV-1"

    def test_trigger_validates_body(self, store: SQLiteQueueStore) -> None:
        app = ServeApp(ServeConfig(queue_name="q", token="t"), store=store)
        assert app.trigger({}, "Bearer t")[0] == 400
        assert app.trigger({"diagram_path": "  "}, "Bearer t")[0] == 400
        assert (
            app.trigger({"diagram_path": "a", "variables": [1]}, "Bearer t")[0] == 400
        )
        assert (
            app.trigger({"diagram_path": "a", "priority": "Urgent"}, "Bearer t")[0]
            == 400
        )
        assert app.trigger({"diagram_path": "a", "reference": 5}, "Bearer t")[0] == 400

    def test_metrics_reports_queue_stats(self, store: SQLiteQueueStore) -> None:
        store.add_item("q", {"diagram_path": "a.process"})
        app = ServeApp(ServeConfig(queue_name="q"), store=store)
        payload = app.metrics_payload()
        assert payload["queue"] == "q"
        assert payload["stats"][QueueItemStatus.NEW.value] == 1


class TestServeHTTP:
    """End-to-end HTTP behaviour over a real loopback socket."""

    @pytest.fixture()
    def server(self, store: SQLiteQueueStore):
        app = ServeApp(
            ServeConfig(queue_name="jobs", token="tok", ndjson=False), store=store
        )
        httpd, port = _start_server(app)
        yield port
        httpd.shutdown()
        httpd.server_close()

    def test_healthz(self, server: int) -> None:
        status, payload = _request(server, "GET", "/healthz")
        assert status == 200
        assert payload["status"] == "ok"
        assert payload["queue"] == "jobs"
        assert isinstance(payload["uptime_sec"], (int, float))

    def test_metrics(self, server: int) -> None:
        status, payload = _request(server, "GET", "/metrics")
        assert status == 200
        assert QueueItemStatus.NEW.value in payload["stats"]

    def test_trigger_round_trip(self, server: int) -> None:
        status, payload = _request(
            server,
            "POST",
            "/trigger",
            {"diagram_path": "x.process"},
            headers={"Authorization": "Bearer tok"},
        )
        assert status == 202
        assert payload["queue"] == "jobs"

    def test_unknown_path_404(self, server: int) -> None:
        # Fail-closed (issue #857): unknown paths are gated by auth first —
        # without a token they answer 401 instead of revealing existence.
        assert _request(server, "GET", "/nope")[0] == 401
        assert _request(server, "POST", "/nope", {"a": 1})[0] == 401
        auth = {"Authorization": "Bearer tok"}
        assert _request(server, "GET", "/nope", headers=auth)[0] == 404
        assert _request(server, "POST", "/nope", {"a": 1}, headers=auth)[0] == 404

    def test_wrong_method_405(self, server: int) -> None:
        auth = {"Authorization": "Bearer tok"}
        assert _request(server, "PUT", "/trigger", {"a": 1})[0] == 401
        assert _request(server, "PUT", "/trigger", {"a": 1}, headers=auth)[0] == 404
        assert _request(server, "DELETE", "/healthz")[0] == 405

    def test_invalid_json_400(self, server: int) -> None:
        conn = http.client.HTTPConnection("127.0.0.1", server, timeout=5)
        body = b"{not json"
        conn.request(
            "POST",
            "/trigger",
            body=body,
            headers={"Content-Length": str(len(body))},
        )
        response = conn.getresponse()
        assert response.status == 400
        conn.close()

    def test_oversized_body_413(self, server: int) -> None:
        conn = http.client.HTTPConnection("127.0.0.1", server, timeout=5)
        conn.request(
            "POST",
            "/trigger",
            headers={
                "Content-Length": str(2_000_000),
                "Authorization": "Bearer tok",
            },
        )
        response = conn.getresponse()
        assert response.status == 413
        conn.close()

    def test_trigger_without_token_configured_403(
        self, store: SQLiteQueueStore
    ) -> None:
        app = ServeApp(ServeConfig(queue_name="q", token=None), store=store)
        httpd, port = _start_server(app)
        try:
            status, payload = _request(port, "POST", "/trigger", {"diagram_path": "a"})
            assert status == 403
            assert "RPAFORGE_SERVE_TOKEN" in payload["error"]
        finally:
            httpd.shutdown()
            httpd.server_close()


class TestServeCLI:
    """CLI wiring smoke checks."""

    def test_serve_subcommand_is_registered(self) -> None:
        """The serve subcommand parses and dispatches (help exits cleanly)."""
        from rpaforge.runner import cli

        with pytest.raises(SystemExit) as excinfo:
            cli.main(["serve", "--help"])
        assert excinfo.value.code == 0

    def test_build_server_binds_and_reports_disabled_trigger(
        self, capsys: pytest.CaptureFixture[str]
    ) -> None:
        from rpaforge.runner.serve import build_server

        config = ServeConfig(queue_name="q", port=0, token=None, quiet=False)
        httpd, app = build_server(config)
        try:
            assert app.health_payload()["status"] == "ok"
            banner = capsys.readouterr().out
            assert "trigger DISABLED" in banner
            assert httpd.server_address[1] > 0
        finally:
            httpd.server_close()


class TestRunsAPI:
    """``GET /runs`` family and cooperative cancel (issue #857)."""

    @pytest.fixture()
    def app(self, store: SQLiteQueueStore, tmp_path: Path) -> ServeApp:
        return ServeApp(
            ServeConfig(queue_name="jobs", token="tok", logs_dir=tmp_path / "logs"),
            store=store,
        )

    def _seed_run(
        self,
        store: SQLiteQueueStore,
        *,
        status: str = "success",
        item_id: str | None = None,
    ) -> str:
        """One finished run in the store; returns the item id."""
        item = store.add_item("jobs", {"diagram_path": "job.process"})
        target_id = item_id or item.id
        store.record_run_started(target_id, "jobs")
        store.record_run_finished(
            target_id,
            run_id="run-123",
            diagram_path="job.process",
            status=status,
            exit_code=0 if status == "success" else 1,
            audit_path=None,
            error_message=None if status == "success" else "boom",
        )
        # Mirror the real daemon lifecycle: a finished run means the queue
        # item left New/InProgress.
        store.set_item_status(
            target_id,
            status=(
                QueueItemStatus.SUCCESSFUL
                if status == "success"
                else QueueItemStatus.FAILED
            ),
            retry=False,
        )
        return target_id

    def test_all_runs_endpoints_require_token(self, app: ServeApp) -> None:
        assert app.runs_payload(None, None)[0] == 401
        assert app.run_detail("x")[0] == 401
        assert app.run_logs_payload("x", None, False)[0] == 401
        assert app.cancel_run("x")[0] == 401
        assert app.schedules_payload()[0] == 401
        assert app.put_schedule("n", {"cron": "* * * * *"})[0] == 401

    def test_trigger_disabled_means_runs_disabled(self, tmp_path: Path) -> None:
        app = ServeApp(
            ServeConfig(queue_name="q", token=None, logs_dir=tmp_path),
            store=SQLiteQueueStore(db_path=tmp_path / "q.db"),
        )
        assert app.runs_payload(None, None)[0] == 403

    def test_list_runs(self, app: ServeApp, store: SQLiteQueueStore) -> None:
        self._seed_run(store)
        self._seed_run(store, status="failed")
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

    def test_list_runs_filters_status_and_validates_query(
        self, app: ServeApp, store: SQLiteQueueStore
    ) -> None:
        self._seed_run(store)
        status, payload = app.runs_payload("10", "failed", "Bearer tok")
        assert status == 200
        assert payload["runs"] == []
        assert app.runs_payload("abc", None, "Bearer tok")[0] == 400
        assert app.runs_payload("0", None, "Bearer tok")[0] == 400
        assert app.runs_payload(None, "bogus", "Bearer tok")[0] == 400

    def test_run_detail_404_unknown(self, app: ServeApp) -> None:
        assert app.run_detail("missing", "Bearer tok")[0] == 404

    def test_run_detail_includes_steps_from_audit(
        self, app: ServeApp, store: SQLiteQueueStore, tmp_path: Path
    ) -> None:
        audit_path = tmp_path / "audit.json"
        audit_path.write_text(
            json.dumps(
                {
                    "run_id": "run-123",
                    "steps": [
                        {
                            "activity": "Log",
                            "duration_ms": 12,
                            "status": "success",
                        }
                    ],
                }
            ),
            encoding="utf-8",
        )
        item_id = self._seed_run(store)
        store.record_run_finished(
            item_id,
            run_id="run-123",
            diagram_path="job.process",
            status="success",
            exit_code=0,
            audit_path=str(audit_path),
        )
        status, payload = app.run_detail(item_id, "Bearer tok")
        assert status == 200
        assert payload["steps"][0]["activity"] == "Log"

    def test_logs_tail(self, app: ServeApp, store: SQLiteQueueStore) -> None:
        item_id = self._seed_run(store)
        log_dir = app.config.resolved_logs_dir()
        log_dir.mkdir(parents=True, exist_ok=True)
        log_file = log_dir / f"{item_id}.ndjson"
        log_file.write_text(
            "\n".join(f'{{"event": "e{i}"}}' for i in range(5)) + "\n",
            encoding="utf-8",
        )
        status, payload = app.run_logs_payload(item_id, "3", False, "Bearer tok")
        assert status == 200
        assert len(payload["lines"]) == 3
        assert json.loads(payload["lines"][-1])["event"] == "e4"
        assert app.run_logs_payload(item_id, "bad", False, "Bearer tok")[0] == 400
        assert app.run_logs_payload(item_id, "99999", False, "Bearer tok")[0] == 400
        assert app.run_logs_payload("missing", None, False, "Bearer tok")[0] == 404
        (log_dir / "no-log.ndjson").touch()
        assert app.run_logs_payload("no-log", None, False, "Bearer tok")[0] == 404

    def test_cancel_queued_item(self, app: ServeApp, store: SQLiteQueueStore) -> None:
        item = store.add_item("jobs", {"diagram_path": "a.process"})
        status, payload = app.cancel_run(item.id, "Bearer tok")
        assert status == 200
        assert payload["stage"] == "before_pickup"
        assert store.get_item(item.id).status == QueueItemStatus.CANCELLED

    def test_cancel_running_item_requests_cooperative_cancel(
        self, app: ServeApp, store: SQLiteQueueStore
    ) -> None:
        item = store.add_item("jobs", {"diagram_path": "a.process"})
        store.get_next_item("jobs", timeout_seconds=0.0)  # -> InProgress
        status, payload = app.cancel_run(item.id, "Bearer tok")
        assert status == 202
        assert payload["stage"] == "cooperative"
        assert store.get_cancel_requests("jobs") == [item.id]
        assert store.get_item(item.id).status == QueueItemStatus.IN_PROGRESS

    def test_cancel_finished_item_conflicts(
        self, app: ServeApp, store: SQLiteQueueStore
    ) -> None:
        item_id = self._seed_run(store)
        assert app.cancel_run(item_id, "Bearer tok")[0] == 409
        assert app.cancel_run("missing", "Bearer tok")[0] == 404


class TestSchedulesAPI:
    """``GET /schedules`` and ``PUT /schedules/{name}`` (issue #857)."""

    def test_schedules_require_flag(self, store: SQLiteQueueStore) -> None:
        app = ServeApp(ServeConfig(queue_name="q", token="t"), store=store)
        assert app.schedules_payload("Bearer t")[0] == 501
        assert app.put_schedule("n", {"cron": "* * * * *"}, "Bearer t")[0] == 501

    @pytest.fixture()
    def app(self, store: SQLiteQueueStore, tmp_path: Path) -> ServeApp:
        return ServeApp(
            ServeConfig(
                queue_name="q",
                token="tok",
                schedules_path=tmp_path / "schedules.json",
            ),
            store=store,
        )

    def test_empty_list_before_any_upsert(self, app: ServeApp) -> None:
        status, payload = app.schedules_payload("Bearer tok")
        assert status == 200
        assert payload["schedules"] == []

    def test_upsert_creates_and_replaces(self, app: ServeApp) -> None:
        status, payload = app.put_schedule(
            "invoices",
            {
                "cron": "30 9 * * 1-5",
                "diagram_path": "p.process",
                "priority": "High",
            },
            "Bearer tok",
        )
        assert status == 200
        assert payload["schedule"]["name"] == "invoices"
        assert payload["schedule"]["cron"] == "30 9 * * 1-5"

        status, payload = app.put_schedule(
            "invoices",
            {"cron": "0 10 * * *", "diagram_path": "p2.process"},
            "Bearer tok",
        )
        assert status == 200
        status, payload = app.schedules_payload("Bearer tok")
        names = [s["name"] for s in payload["schedules"]]
        assert names == ["invoices"]
        assert payload["schedules"][0]["cron"] == "0 10 * * *"

    def test_upsert_keeps_other_schedules(self, app: ServeApp) -> None:
        app.put_schedule(
            "a", {"cron": "* * * * *", "diagram_path": "a.process"}, "Bearer tok"
        )
        app.put_schedule(
            "b", {"cron": "0 0 * * *", "diagram_path": "b.process"}, "Bearer tok"
        )
        status, payload = app.schedules_payload("Bearer tok")
        assert sorted(s["name"] for s in payload["schedules"]) == ["a", "b"]

    def test_upsert_validates_payload(self, app: ServeApp) -> None:
        assert (
            app.put_schedule("bad", {"diagram_path": "a.process"}, "Bearer tok")[0]
            == 400
        )
        assert (
            app.put_schedule(
                "bad", {"cron": "nonsense", "diagram_path": "a"}, "Bearer tok"
            )[0]
            == 400
        )
        assert app.put_schedule("bad", "not-a-dict", "Bearer tok")[0] == 400

    def test_put_name_mismatch_rejected(self, app: ServeApp) -> None:
        status, payload = app.put_schedule(
            "path-name",
            {
                "name": "body-name",
                "cron": "* * * * *",
                "diagram_path": "a.process",
            },
            "Bearer tok",
        )
        assert status == 400
        assert "does not match" in payload["error"]


class TestRunsAPIHTTP:
    """End-to-end v2 endpoints over a real loopback socket."""

    @pytest.fixture()
    def server(self, store: SQLiteQueueStore, tmp_path: Path):
        app = ServeApp(
            ServeConfig(
                queue_name="jobs",
                token="tok",
                logs_dir=tmp_path / "logs",
                schedules_path=tmp_path / "schedules.json",
            ),
            store=store,
        )
        httpd, port = _start_server(app)
        yield port
        httpd.shutdown()
        httpd.server_close()

    def test_runs_unauthorized_then_authorized(self, server: int) -> None:
        assert _request(server, "GET", "/runs")[0] == 401
        status, payload = _request(
            server, "GET", "/runs", headers={"Authorization": "Bearer tok"}
        )
        assert status == 200
        assert payload["runs"] == []

    def test_cancel_flow_over_http(self, server: int, store: SQLiteQueueStore) -> None:
        item = store.add_item("jobs", {"diagram_path": "a.process"})
        status, payload = _request(
            server,
            "POST",
            f"/runs/{item.id}/cancel",
            {},
            headers={"Authorization": "Bearer tok"},
        )
        assert status == 200
        assert payload["stage"] == "before_pickup"

    def test_schedules_round_trip_over_http(self, server: int) -> None:
        status, payload = _request(
            server,
            "PUT",
            "/schedules/nightly",
            {"cron": "0 2 * * *", "diagram_path": "n.process"},
            headers={"Authorization": "Bearer tok"},
        )
        assert status == 200
        assert payload["schedule"]["cron"] == "0 2 * * *"
        status, payload = _request(
            server,
            "GET",
            "/schedules",
            headers={"Authorization": "Bearer tok"},
        )
        assert status == 200
        assert [s["name"] for s in payload["schedules"]] == ["nightly"]

    def test_unknown_run_path_404(self, server: int) -> None:
        status, _ = _request(
            server,
            "GET",
            "/runs/x/bogus",
            headers={"Authorization": "Bearer tok"},
        )
        assert status == 404
