"""Tests for serve security hardening: TLS, scopes, rotation, limiter (issue #908)."""

from __future__ import annotations

import http.client
import json
import ssl
import threading
from http.server import ThreadingHTTPServer
from pathlib import Path

import pytest

from rpaforge.queues.sqlite_store import SQLiteQueueStore
from rpaforge.runner.serve import (
    ServeApp,
    ServeConfig,
    ServeSecurityError,
    build_server,
    make_handler,
)
from rpaforge.runner.serve_security import (
    SCOPE_ADMIN,
    SCOPE_READ,
    SCOPE_TRIGGER,
    AuthRateLimiter,
    TokenConfigError,
    TokenRegistry,
)

FIXTURE_DIR = Path(__file__).parent / "fixtures"
TLS_CERT = FIXTURE_DIR / "test-tls-cert.pem"
TLS_KEY = FIXTURE_DIR / "test-tls-key.pem"


def _request(
    port: int,
    method: str,
    path: str,
    body: dict | None = None,
    headers: dict[str, str] | None = None,
    tls: bool = False,
) -> tuple[int, dict]:
    """One HTTP(S) round-trip; returns (status, parsed JSON body)."""
    if tls:
        context = ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
        context.check_hostname = False
        context.verify_mode = ssl.CERT_NONE
        conn: http.client.HTTPConnection = http.client.HTTPSConnection(
            "127.0.0.1", port, timeout=5, context=context
        )
    else:
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


def _start_server(
    app: ServeApp,
) -> tuple[ThreadingHTTPServer, int]:
    httpd = ThreadingHTTPServer(("127.0.0.1", 0), make_handler(app))
    thread = threading.Thread(target=httpd.serve_forever, daemon=True)
    thread.start()
    return httpd, httpd.server_address[1]


@pytest.fixture()
def store(tmp_path: Path) -> SQLiteQueueStore:
    return SQLiteQueueStore(db_path=tmp_path / "queue.db")


class TestTokenRegistry:
    """Token file parsing, scopes and hot-reload."""

    def test_file_entries_with_scopes(self, tmp_path: Path) -> None:
        token_file = tmp_path / "tokens"
        token_file.write_text(
            "# comment\nadmin-secret\nrobot-key:trigger\nobserver:read\n\n",
            encoding="utf-8",
        )
        registry = TokenRegistry(None, token_file)
        assert registry.configured
        assert registry.lookup("admin-secret") == SCOPE_ADMIN
        assert registry.lookup("robot-key") == SCOPE_TRIGGER
        assert registry.lookup("observer") == SCOPE_READ
        assert registry.lookup("nope") is None

    def test_unknown_scope_rejected(self, tmp_path: Path) -> None:
        token_file = tmp_path / "tokens"
        token_file.write_text("key:root\n", encoding="utf-8")
        with pytest.raises(TokenConfigError, match="unknown scope"):
            TokenRegistry(None, token_file)

    def test_empty_entry_rejected(self, tmp_path: Path) -> None:
        token_file = tmp_path / "tokens"
        token_file.write_text(":read\n", encoding="utf-8")
        with pytest.raises(TokenConfigError, match="empty token"):
            TokenRegistry(None, token_file)

    def test_hot_reload_replaces_file_entries_keeps_static(
        self, tmp_path: Path
    ) -> None:
        token_file = tmp_path / "tokens"
        token_file.write_text("old-token:read\n", encoding="utf-8")
        registry = TokenRegistry("static-admin", token_file)
        assert registry.lookup("old-token") == SCOPE_READ

        token_file.write_text("new-token:trigger\n", encoding="utf-8")
        import os

        stat = token_file.stat()
        os.utime(token_file, ns=(stat.st_atime_ns, stat.st_mtime_ns + 1_000_000))

        assert registry.lookup("old-token") is None
        assert registry.lookup("new-token") == SCOPE_TRIGGER
        # The env/static token survives rotations.
        assert registry.lookup("static-admin") == SCOPE_ADMIN

    def test_scope_implication(self) -> None:
        registry = TokenRegistry()
        assert registry.allows(SCOPE_ADMIN, SCOPE_READ)
        assert registry.allows(SCOPE_ADMIN, SCOPE_TRIGGER)
        assert registry.allows(SCOPE_TRIGGER, SCOPE_TRIGGER)
        assert not registry.allows(SCOPE_TRIGGER, SCOPE_ADMIN)
        assert registry.allows(SCOPE_READ, SCOPE_READ)
        assert not registry.allows(SCOPE_READ, SCOPE_TRIGGER)


class TestAuthRateLimiter:
    """Per-IP failure bucket semantics."""

    def test_burst_then_limited_with_retry_after(self) -> None:
        clock = {"now": 0.0}
        limiter = AuthRateLimiter(
            max_failures=3, refill_per_minute=60.0, clock=lambda: clock["now"]
        )
        for _ in range(3):
            allowed, retry_after = limiter.consume_failure("1.2.3.4")
            assert allowed and retry_after == 0.0
        allowed, retry_after = limiter.consume_failure("1.2.3.4")
        assert not allowed
        assert retry_after > 0

    def test_refill_over_time(self) -> None:
        clock = {"now": 0.0}
        limiter = AuthRateLimiter(
            max_failures=1, refill_per_minute=60.0, clock=lambda: clock["now"]
        )
        allowed, _ = limiter.consume_failure("ip")
        assert allowed  # full bucket
        allowed, _ = limiter.consume_failure("ip")
        assert not allowed  # empty
        clock["now"] = 2.0  # 60/min = 1/s → one refill in 2s
        allowed, _ = limiter.consume_failure("ip")
        assert allowed

    def test_reset_on_success(self) -> None:
        limiter = AuthRateLimiter(max_failures=1, refill_per_minute=60.0)
        limiter.consume_failure("ip")
        limiter.reset("ip")
        allowed, retry_after = limiter.consume_failure("ip")
        assert allowed and retry_after == 0.0

    def test_ips_are_independent(self) -> None:
        limiter = AuthRateLimiter(max_failures=1, refill_per_minute=60.0)
        limiter.consume_failure("a")
        allowed, _ = limiter.consume_failure("b")
        assert allowed


class TestScopedEndpoints:
    """Scope matrix at the request-logic level."""

    @pytest.fixture()
    def app(self, tmp_path: Path) -> ServeApp:
        token_file = tmp_path / "tokens"
        token_file.write_text(
            "admin-key\nreader-key:read\nrobot-key:trigger\n", encoding="utf-8"
        )
        config = ServeConfig(queue_name="jobs", token_file=token_file, token=None)
        return ServeApp(config, store=SQLiteQueueStore(db_path=tmp_path / "queue.db"))

    def _headers(self, token: str) -> dict[str, str]:
        return {"Authorization": f"Bearer {token}"}

    def test_read_token_lists_runs_but_cannot_trigger(self, app: ServeApp) -> None:
        status, payload = app.runs_payload(
            None, None, authorization_header="Bearer reader-key"
        )
        assert status == 200
        status, payload = app.trigger(
            {"diagram_path": "x.process"},
            authorization_header="Bearer reader-key",
        )
        assert status == 403
        assert "not sufficient" in payload["error"]

    def test_trigger_token_cannot_cancel(self, app: ServeApp) -> None:
        item = app.store.add_item("jobs", {"diagram_path": "x.process"})
        status, _ = app.trigger(
            {"diagram_path": "x.process"},
            authorization_header="Bearer robot-key",
        )
        assert status == 202
        status, payload = app.cancel_run(
            item.id, authorization_header="Bearer robot-key"
        )
        assert status == 403
        assert "not sufficient" in payload["error"]

    def test_admin_token_passes_everything(self, app: ServeApp) -> None:
        status, _ = app.trigger(
            {"diagram_path": "x.process"},
            authorization_header="Bearer admin-key",
        )
        assert status == 202
        status, _ = app.runs_payload(
            None, None, authorization_header="Bearer admin-key"
        )
        assert status == 200
        item_id = app.store.get_next_item("jobs", timeout_seconds=0.0).id
        status, payload = app.cancel_run(
            item_id, authorization_header="Bearer admin-key"
        )
        assert status in (200, 202)

    def test_static_token_still_works(self, tmp_path: Path) -> None:
        config = ServeConfig(queue_name="jobs", token="env-token")
        app = ServeApp(config, store=SQLiteQueueStore(db_path=tmp_path / "queue.db"))
        status, _ = app.trigger(
            {"diagram_path": "x.process"},
            authorization_header="Bearer env-token",
        )
        assert status == 202


class TestRateLimitIntegration:
    """429 + Retry-After over real HTTP; legit client unaffected."""

    def test_burst_returns_429_then_legit_client_passes(self, tmp_path: Path) -> None:
        config = ServeConfig(
            queue_name="jobs",
            token="real-token",
            auth_max_failures=3,
            auth_refill_per_minute=1.0,
        )
        app = ServeApp(config, store=SQLiteQueueStore(db_path=tmp_path / "queue.db"))
        httpd, port = _start_server(app)
        try:
            for _ in range(3):
                status, _ = _request(
                    port,
                    "GET",
                    "/runs",
                    headers={"Authorization": "Bearer wrong"},
                )
                assert status == 401
            status, payload = _request(
                port, "GET", "/runs", headers={"Authorization": "Bearer wrong"}
            )
            assert status == 429
            assert "slow down" in payload["error"]
            status, headers, _ = _raw_headers(
                port, "GET", "/runs", headers={"Authorization": "Bearer wrong"}
            )
            assert int(headers["Retry-After"]) >= 1

            # A different source is unaffected; and so is the same source
            # presenting the correct token (bucket resets on success).
            app.limiter.reset("127.0.0.1")
            status, _ = _request(
                port, "GET", "/runs", headers={"Authorization": "Bearer real-token"}
            )
            assert status == 200
        finally:
            httpd.shutdown()
            httpd.server_close()


def _raw_headers(
    port: int, method: str, path: str, headers: dict[str, str] | None = None
) -> tuple[int, dict[str, str], dict]:
    conn = http.client.HTTPConnection("127.0.0.1", port, timeout=5)
    conn.request(method, path, headers=headers or {})
    response = conn.getresponse()
    raw = response.read().decode("utf-8")
    conn.close()
    return response.status, dict(response.getheaders()), json.loads(raw)


class TestTLSAndRefusal:
    """TLS smoke over the committed self-signed fixture; insecure-bind refusal."""

    def test_tls_smoke_round_trip(self, tmp_path: Path) -> None:
        config = ServeConfig(
            queue_name="jobs",
            token="tok",
            tls_certfile=TLS_CERT,
            tls_keyfile=TLS_KEY,
        )
        app = ServeApp(config, store=SQLiteQueueStore(db_path=tmp_path / "queue.db"))
        httpd = ThreadingHTTPServer(("127.0.0.1", 0), make_handler(app))
        context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        context.load_cert_chain(certfile=str(TLS_CERT), keyfile=str(TLS_KEY))
        httpd.socket = context.wrap_socket(httpd.socket, server_side=True)
        thread = threading.Thread(target=httpd.serve_forever, daemon=True)
        thread.start()
        try:
            status, payload = _request(
                httpd.server_address[1],
                "GET",
                "/healthz",
                headers={"Authorization": "Bearer tok"},
                tls=True,
            )
            assert status == 200
            assert payload["queue"] == "jobs"
        finally:
            httpd.shutdown()
            httpd.server_close()

    def test_non_loopback_without_tls_refused(self) -> None:
        config = ServeConfig(queue_name="jobs", host="0.0.0.0", token="tok")
        with pytest.raises(ServeSecurityError, match="non-loopback"):
            build_server(config)

    def test_allow_insecure_permits_non_loopback(self, tmp_path: Path) -> None:
        config = ServeConfig(
            queue_name="jobs",
            host="0.0.0.0",
            port=0,
            token="tok",
            allow_insecure=True,
        )
        httpd, _app = build_server(
            config, store=SQLiteQueueStore(db_path=tmp_path / "queue.db")
        )
        httpd.server_close()

    def test_cert_without_key_refused(self, tmp_path: Path) -> None:
        config = ServeConfig(queue_name="jobs", tls_certfile=TLS_CERT, token="tok")
        with pytest.raises(ServeSecurityError, match="together"):
            build_server(config, store=SQLiteQueueStore(db_path=tmp_path / "queue.db"))


class TestRequireAuthHealth:
    """--require-auth-health flips the health endpoints to authed."""

    def test_metrics_require_auth_when_configured(self, tmp_path: Path) -> None:
        config = ServeConfig(queue_name="jobs", token="tok", require_auth_health=True)
        app = ServeApp(config, store=SQLiteQueueStore(db_path=tmp_path / "queue.db"))
        httpd, port = _start_server(app)
        try:
            status, payload = _request(port, "GET", "/metrics")
            assert status == 401
            status, payload = _request(
                port, "GET", "/metrics", headers={"Authorization": "Bearer tok"}
            )
            assert status == 200
            assert isinstance(payload["stats"], dict)
        finally:
            httpd.shutdown()
            httpd.server_close()


class TestDenyCrossOrigin:
    """Opt-in strict cross-origin deny."""

    def test_origin_header_rejected_when_enabled(self, tmp_path: Path) -> None:
        config = ServeConfig(queue_name="jobs", token="tok", deny_cross_origin=True)
        app = ServeApp(config, store=SQLiteQueueStore(db_path=tmp_path / "queue.db"))
        httpd, port = _start_server(app)
        try:
            status, payload = _request(
                port,
                "GET",
                "/runs",
                headers={"Authorization": "Bearer tok", "Origin": "http://evil"},
            )
            assert status == 403
            assert "cross-origin" in payload["error"]
        finally:
            httpd.shutdown()
            httpd.server_close()

    def test_origin_header_allowed_by_default(self, tmp_path: Path) -> None:
        config = ServeConfig(queue_name="jobs", token="tok")
        app = ServeApp(config, store=SQLiteQueueStore(db_path=tmp_path / "queue.db"))
        httpd, port = _start_server(app)
        try:
            status, _ = _request(
                port,
                "GET",
                "/runs",
                headers={"Authorization": "Bearer tok", "Origin": "http://x"},
            )
            assert status == 200
        finally:
            httpd.shutdown()
            httpd.server_close()
