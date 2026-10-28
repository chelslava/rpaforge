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
        assert _request(server, "GET", "/nope")[0] == 404
        assert _request(server, "POST", "/nope", {"a": 1})[0] == 404

    def test_wrong_method_405(self, server: int) -> None:
        assert _request(server, "PUT", "/trigger", {"a": 1})[0] == 405
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
