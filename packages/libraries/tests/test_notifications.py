"""Tests for the Notifications library (webhook + SMTP transports)."""

from __future__ import annotations

import json
import logging
import smtplib
import socket
import threading
from collections.abc import Iterator
from contextlib import contextmanager
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any

import pytest

from rpaforge_libraries.Credentials.providers.base import (
    SecretMasker,
    SecretMaskingFilter,
)
from rpaforge_libraries.Notifications import transports as transports_module
from rpaforge_libraries.Notifications.library import Notifications
from rpaforge_libraries.Notifications.smtp import SmtpTransport
from rpaforge_libraries.Notifications.transports import (
    EmailDeliveryError,
    InlinePasswordRejected,
    NotificationTransport,
    WebhookDeliveryError,
    describe_url,
    resolve_secret_ref,
)
from rpaforge_libraries.Notifications.webhook import (
    BACKOFF_CAP_SECONDS,
    WebhookTransport,
    _backoff_delay,
)

STUB_TOKEN = "super-secret-stub-token"


# ---------------------------------------------------------------------------
# Local HTTP stub (ephemeral port, bounded lifecycle)


@contextmanager
def webhook_stub(responses: list[int]) -> Iterator[tuple[str, list[dict[str, Any]]]]:
    """Run a local JSON webhook stub on an ephemeral 127.0.0.1 port.

    ``responses`` replays one status code per request; a single-element list
    repeats forever. Yields ``(url_with_secret_token, requests_log)``.
    """
    requests_log: list[dict[str, Any]] = []
    status_queue = list(responses)

    class StubHandler(BaseHTTPRequestHandler):
        def do_POST(self) -> None:
            length = int(self.headers.get("Content-Length", "0"))
            raw = self.rfile.read(length) if length else b""
            try:
                body: Any = json.loads(raw.decode("utf-8")) if raw else None
            except json.JSONDecodeError:
                body = {"_undecodable": True}
            code = (
                status_queue.pop(0)
                if len(status_queue) > 1
                else (status_queue[0] if status_queue else 200)
            )
            requests_log.append(
                {
                    "path": self.path,
                    "content_type": self.headers.get("Content-Type", ""),
                    "body": body,
                    "status": code,
                }
            )
            payload = b'{"ok": true}'
            self.send_response(code)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)

        def log_message(self, _format: str, *_args: Any) -> None:
            """Silence per-request stderr noise."""

    server = ThreadingHTTPServer(("127.0.0.1", 0), StubHandler)
    thread_done = threading.Event()
    thread = threading.Thread(target=_serve, args=(server, thread_done), daemon=True)
    try:
        thread.start()
        url = f"http://127.0.0.1:{server.server_address[1]}/hook?token={STUB_TOKEN}"
        yield url, requests_log
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=5)
        assert thread_done.wait(timeout=5), "stub server thread did not stop"


def _serve(server: ThreadingHTTPServer, done: threading.Event) -> None:
    try:
        server.serve_forever(poll_interval=0.05)
    finally:
        done.set()


def _free_port() -> int:
    sock = socket.socket()
    sock.bind(("127.0.0.1", 0))
    port = int(sock.getsockname()[1])
    sock.close()
    return port


# ---------------------------------------------------------------------------
# Shared fixtures


@pytest.fixture(autouse=True)
def masker_guard():
    """Snapshot and restore the global SecretMasker around every test."""
    masker = SecretMasker()
    saved = set(masker._secrets)
    yield masker
    masker.clear()
    masker._secrets = saved


@pytest.fixture
def sleep_calls(monkeypatch):
    """Replace webhook backoff sleeps with recorded no-ops."""
    calls: list[float] = []
    monkeypatch.setattr(
        "rpaforge_libraries.Notifications.webhook.time.sleep",
        lambda seconds: calls.append(seconds),
    )
    return calls


class _ListHandler(logging.Handler):
    def __init__(self) -> None:
        super().__init__()
        self.messages: list[str] = []

    def emit(self, record: logging.LogRecord) -> None:
        self.messages.append(record.getMessage())


@pytest.fixture
def notification_logs():
    """Capture every record emitted by the notifications logger."""
    logger = logging.getLogger("rpaforge.notifications")
    handler = _ListHandler()
    old_level, old_propagate, old_handlers = (
        logger.level,
        logger.propagate,
        logger.handlers[:],
    )
    logger.handlers[:] = [handler]
    logger.setLevel(logging.DEBUG)
    logger.propagate = False
    yield handler.messages
    logger.handlers[:] = old_handlers
    logger.setLevel(old_level)
    logger.propagate = old_propagate


@pytest.fixture
def smtp_state(monkeypatch):
    """Patch smtplib with recording fakes; returns shared behaviour state."""
    state: dict[str, Any] = {
        "plain": [],
        "ssl": [],
        "login_error": None,
        "sendmail_error": None,
        "refused": {},
    }

    def build(name: str, *, ssl_variant: bool):
        class FakeSMTP:
            def __init__(self, host, port, timeout=None, context=None):
                assert ssl_variant or context is None, (
                    "plain smtplib.SMTP must never receive an SSL context"
                )
                self.host = host
                self.port = port
                self.timeout = timeout
                self.ssl_context = context
                self.starttls_calls: list[Any] = []
                self.login_calls: list[tuple[str, str]] = []
                self.sent_messages: list[tuple[str, list[str], str]] = []
                self.quit_called = False
                state["ssl" if ssl_variant else "plain"].append(self)

            def starttls(self, context=None):
                self.starttls_calls.append(context)

            def login(self, username, password):
                self.login_calls.append((username, password))
                if state["login_error"] is not None:
                    raise state["login_error"]

            def sendmail(self, from_addr, to_addrs, msg):
                if state["sendmail_error"] is not None:
                    raise state["sendmail_error"]
                self.sent_messages.append((from_addr, list(to_addrs), msg))
                return dict(state["refused"])

            def __enter__(self):
                return self

            def __exit__(self, *exc_info):
                self.quit_called = True
                return False

        FakeSMTP.__name__ = name
        return FakeSMTP

    monkeypatch.setattr(smtplib, "SMTP", build("_FakeSMTP", ssl_variant=False))
    monkeypatch.setattr(smtplib, "SMTP_SSL", build("_FakeSMTPSSL", ssl_variant=True))
    return state


# ---------------------------------------------------------------------------
# Transport abstraction


class TestNotificationTransportProtocol:
    """Both adapters satisfy the documented transport interface."""

    def test_webhook_and_smtp_satisfy_protocol(self):
        assert isinstance(
            WebhookTransport("https://hooks.example.com/abc"), NotificationTransport
        )
        assert isinstance(SmtpTransport("smtp.example.com"), NotificationTransport)


class TestDescribeUrl:
    """Log-safe endpoint descriptions keep tokens out of messages."""

    def test_strips_path_query_and_fragment(self):
        described = describe_url("https://hooks.slack.com/services/a/b?token=x#f")
        assert described == "https://hooks.slack.com"
        assert "/services" not in described
        assert "token" not in described

    def test_invalid_url_falls_back_to_placeholder(self):
        assert describe_url("not-a-url") == "<redacted-url>"


class TestBackoffDelay:
    """Backoff grows exponentially and is capped."""

    def test_doubles_per_failed_attempt_until_cap(self):
        assert _backoff_delay(0.5, BACKOFF_CAP_SECONDS, 1) == 0.5
        assert _backoff_delay(0.5, BACKOFF_CAP_SECONDS, 2) == 1.0
        assert _backoff_delay(0.5, BACKOFF_CAP_SECONDS, 3) == 2.0
        assert _backoff_delay(10.0, BACKOFF_CAP_SECONDS, 9) == BACKOFF_CAP_SECONDS


# ---------------------------------------------------------------------------
# Webhook adapter


class TestWebhookTransport:
    """Webhook delivery against a real local HTTP stub."""

    def test_success_first_attempt_posts_json_body(self):
        with webhook_stub([200]) as (url, requests_log):
            result = WebhookTransport(url, timeout=5).send(
                "deploy finished", {"channel": "#ops"}
            )
        assert result == {"status": "sent", "attempts": 1, "status_code": 200}
        assert len(requests_log) == 1
        sent = requests_log[0]
        assert sent["content_type"].startswith("application/json")
        assert sent["body"]["text"] == "deploy finished"
        assert sent["body"]["channel"] == "#ops"

    def test_non_2xx_retries_with_growing_backoff_then_succeeds(self, sleep_calls):
        with webhook_stub([500, 503, 200]) as (url, requests_log):
            transport = WebhookTransport(url, max_retries=2, backoff_base=0.25)
            result = transport.send("retry me")
        assert result["attempts"] == 3
        assert result["status_code"] == 200
        assert sleep_calls == [pytest.approx(0.25), pytest.approx(0.5)]
        assert [entry["status"] for entry in requests_log] == [500, 503, 200]

    def test_exhausted_retries_raise_typed_error_without_token(self, sleep_calls):
        with webhook_stub([500]) as (url, requests_log):
            transport = WebhookTransport(url, max_retries=1, backoff_base=0.01)
            with pytest.raises(WebhookDeliveryError) as excinfo:
                transport.send("doomed")
        assert len(requests_log) == 2  # initial attempt + one retry
        assert sleep_calls == [pytest.approx(0.01)]
        message = str(excinfo.value)
        assert "HTTP 500" in message
        assert "127.0.0.1" in message  # masked target remains useful
        assert STUB_TOKEN not in message
        assert "/hook" not in message

    def test_connection_error_retried_then_wrapped_as_typed_error(self, sleep_calls):
        url = f"http://127.0.0.1:{_free_port()}/hook"
        transport = WebhookTransport(url, max_retries=1, backoff_base=0.01)
        with pytest.raises(WebhookDeliveryError) as excinfo:
            transport.send("offline")
        assert "connection error" in str(excinfo.value)
        assert sleep_calls == [pytest.approx(0.01)]
        assert STUB_TOKEN not in str(excinfo.value)

    def test_invalid_urls_rejected_before_any_request(self):
        for bad_url in ("", "   ", "not-a-url", "ftp://example.com/hook"):
            with pytest.raises(ValueError):
                WebhookTransport(bad_url)

    def test_url_registered_as_masking_secret(self):
        with webhook_stub([200]) as (url, _requests_log):
            WebhookTransport(url)
        assert STUB_TOKEN in url  # sanity: token is part of the stub URL
        masked = SecretMasker().mask_text(f"leak {url}")
        assert masked == "leak [REDACTED_SECRET]"


# ---------------------------------------------------------------------------
# SMTP adapter


class TestSmtpTransport:
    """Email delivery against recording smtplib fakes."""

    def test_use_tls_drives_starttls_on_plain_smtp(self, smtp_state):
        transport = SmtpTransport(
            "smtp.example.com",
            port=587,
            username="ops@example.com",
            password="Resolved!Pass42",
            use_tls=True,
        )
        result = transport.send_email(to="dev@example.com", subject="hi", body="hello")
        assert smtp_state["ssl"] == []
        client = smtp_state["plain"][0]
        assert len(client.starttls_calls) == 1
        assert client.starttls_calls[0] is not None  # SSL context provided
        assert client.login_calls == [("ops@example.com", "Resolved!Pass42")]
        assert result["tls"] == "starttls"

    def test_use_ssl_connects_via_smtp_ssl_without_starttls(self, smtp_state):
        transport = SmtpTransport(
            "smtp.example.com",
            port=465,
            username="ops@example.com",
            password="Resolved!Pass42",
            use_tls=False,
            use_ssl=True,
        )
        result = transport.send_email(to="dev@example.com", subject="hi", body="hello")
        assert smtp_state["plain"] == []
        client = smtp_state["ssl"][0]
        assert client.ssl_context is not None
        assert client.starttls_calls == []
        assert result["tls"] == "ssl"

    def test_no_tls_flag_leaves_connection_plain(self, smtp_state):
        transport = SmtpTransport("smtp.example.com", use_tls=False, use_ssl=False)
        result = transport.send_email(to="dev@example.com", subject="hi", body="hello")
        client = smtp_state["plain"][0]
        assert client.starttls_calls == []
        assert result["tls"] == "none"

    def test_mutually_exclusive_tls_flags_rejected(self):
        with pytest.raises(ValueError):
            SmtpTransport("smtp.example.com", use_tls=True, use_ssl=True)

    def test_password_without_username_rejected(self):
        with pytest.raises(ValueError):
            SmtpTransport("smtp.example.com", password="orphan-pass")

    def test_login_skipped_when_credentials_absent(self, smtp_state):
        transport = SmtpTransport("smtp.example.com", username="", password="")
        transport.send_email(to="dev@example.com", subject="hi", body="hello")
        assert smtp_state["plain"][0].login_calls == []

    def test_attachments_embedded_in_mime_message(self, smtp_state, tmp_path):
        attachment = tmp_path / "report.txt"
        attachment.write_bytes(b"hello")
        transport = SmtpTransport("smtp.example.com", use_tls=False)
        transport.send_email(
            to=["dev@example.com"],
            subject="weekly",
            body="see attached",
            attachments=[str(attachment)],
        )
        _from_addr, _recipients, mime_msg = smtp_state["plain"][0].sent_messages[0]
        assert "report.txt" in mime_msg
        assert "aGVsbG8" in mime_msg  # base64('hello')

    def test_comma_separated_recipients_are_normalised(self, smtp_state):
        transport = SmtpTransport("smtp.example.com", use_tls=False)
        transport.send_email(
            to="a@example.com, b@example.com ,c@example.com",
            subject="hi",
            body="hello",
        )
        _from_addr, recipients, _msg = smtp_state["plain"][0].sent_messages[0]
        assert recipients == ["a@example.com", "b@example.com", "c@example.com"]

    def test_partial_refusal_raises_typed_error(self, smtp_state):
        smtp_state["refused"] = {"late@example.com": (450, b"try later")}
        transport = SmtpTransport("smtp.example.com", use_tls=False)
        with pytest.raises(EmailDeliveryError):
            transport.send_email(to="dev@example.com", subject="hi", body="hello")

    def test_all_recipients_refused_raises_typed_error(self, smtp_state):
        refusal = {"dev@example.com": (550, b"user unknown")}
        smtp_state["sendmail_error"] = smtplib.SMTPRecipientsRefused(refusal)
        transport = SmtpTransport("smtp.example.com", use_tls=False)
        with pytest.raises(EmailDeliveryError) as excinfo:
            transport.send_email(to="dev@example.com", subject="hi", body="hello")
        assert "dev@example.com" in str(excinfo.value)

    def test_auth_failure_wrapped_without_password_leak(self, smtp_state):
        smtp_state["login_error"] = smtplib.SMTPAuthenticationError(535, b"denied")
        transport = SmtpTransport(
            "smtp.example.com",
            username="ops@example.com",
            password="SuperSecretPass99",
            use_tls=False,
        )
        with pytest.raises(EmailDeliveryError) as excinfo:
            transport.send_email(to="dev@example.com", subject="hi", body="hello")
        message = str(excinfo.value)
        assert "SMTPAuthenticationError" in message
        assert "SuperSecretPass99" not in message


# ---------------------------------------------------------------------------
# Inline password rejection & secret reference resolution


class TestInlinePasswordRejection:
    """Design guarantee: raw passwords never reach the SMTP layer."""

    def test_resolver_rejects_plain_password(self):
        with pytest.raises(InlinePasswordRejected):
            resolve_secret_ref(
                "Hunter2RawPassword", allow_plain=False, field="password"
            )

    def test_empty_reference_is_rejected_for_password(self):
        with pytest.raises(InlinePasswordRejected):
            resolve_secret_ref("", allow_plain=False, field="password")

    def test_library_activity_rejects_inline_password(self):
        lib = Notifications()
        with pytest.raises(InlinePasswordRejected) as excinfo:
            lib.send_email(
                smtp_host="smtp.example.com",
                username_secret="ops@example.com",
                password_secret_ref="MyLiteralPassword!",
                to="dev@example.com",
                subject="s",
                body="b",
            )
        assert isinstance(excinfo.value, ValueError)  # validation error contract
        assert "rejected by design" in str(excinfo.value)


class TestSecretReferenceResolution:
    """``<provider>://<namespace>/<key>`` refs resolve via Credentials."""

    def test_reference_resolved_through_provider_and_masked(self, monkeypatch):
        class _StubProvider:
            def get_secret(self, key: str, namespace: str = "default") -> str:
                assert key == "SMTP_PASSWORD"
                assert namespace == "prod"
                return "Resolved!Secret42"

        monkeypatch.setattr(
            transports_module, "get_secret_provider", lambda _ptype: _StubProvider()
        )
        value = resolve_secret_ref(
            "vault://prod/SMTP_PASSWORD", allow_plain=False, field="password"
        )
        assert value == "Resolved!Secret42"
        masker = SecretMasker()
        assert masker.mask_text("leak Resolved!Secret42") == "leak [REDACTED_SECRET]"

    def test_username_accepts_plain_value_verbatim(self):
        assert (
            resolve_secret_ref("plain-user", allow_plain=True, field="username")
            == "plain-user"
        )

    def test_library_send_email_resolves_refs_end_to_end(self, smtp_state, monkeypatch):
        class _StubProvider:
            def get_secret(self, key: str, namespace: str = "default") -> str:
                return {
                    ("default", "SMTP_USER"): "bot@example.com",
                    ("default", "SMTP_PASSWORD"): "Resolved!Pass77",
                }[(namespace, key)]

        monkeypatch.setattr(
            transports_module, "get_secret_provider", lambda _ptype: _StubProvider()
        )
        lib = Notifications()
        result = lib.send_email(
            smtp_host="smtp.example.com",
            username_secret="keyring://default/SMTP_USER",
            password_secret_ref="keyring://default/SMTP_PASSWORD",
            to="dev@example.com",
            subject="refs",
            body="resolved",
            use_tls=False,
        )
        assert smtp_state["plain"][0].login_calls == [
            ("bot@example.com", "Resolved!Pass77")
        ]
        assert result["status"] == "sent"


# ---------------------------------------------------------------------------
# Secret masking in logs


class TestSecretMaskingInLogs:
    """No secret ever reaches a log record, success or failure."""

    def test_webhook_success_flow_never_logs_url_or_token(self, notification_logs):
        with webhook_stub([200]) as (url, _requests_log):
            WebhookTransport(url, max_retries=1, backoff_base=0.01).send("masked run")
        joined = "\n".join(notification_logs)
        assert joined  # some records were produced
        assert STUB_TOKEN not in joined
        assert "/hook" not in joined
        assert "127.0.0.1" in joined  # only scheme+host are logged

    def test_webhook_failure_flow_never_logs_url_or_token(
        self, notification_logs, sleep_calls
    ):
        with webhook_stub([500]) as (url, _requests_log):
            transport = WebhookTransport(url, max_retries=1, backoff_base=0.01)
            with pytest.raises(WebhookDeliveryError):
                transport.send("masked failure")
        joined = "\n".join(notification_logs)
        assert sleep_calls == [pytest.approx(0.01)]
        assert "retrying" in joined  # retry warnings were captured
        assert STUB_TOKEN not in joined
        assert "/hook" not in joined

    def test_email_flow_never_logs_resolved_password(
        self, notification_logs, smtp_state, monkeypatch
    ):
        class _StubProvider:
            def get_secret(self, key: str, namespace: str = "default") -> str:
                assert namespace == "default"
                return {
                    "SMTP_USER": "bot@example.com",
                    "SMTP_PASSWORD": "Resolved!Pass77",
                }[key]

        monkeypatch.setattr(
            transports_module, "get_secret_provider", lambda _ptype: _StubProvider()
        )
        lib = Notifications()
        lib.send_email(
            smtp_host="smtp.example.com",
            username_secret="keyring://default/SMTP_USER",
            password_secret_ref="keyring://default/SMTP_PASSWORD",
            to="dev@example.com",
            subject="quiet",
            body="shh",
            use_tls=False,
        )
        joined = "\n".join(notification_logs)
        assert smtp_state["plain"], "SMTP client was constructed"
        assert "Resolved!Pass77" not in joined

    def test_masking_filter_redacts_registered_url_defence_in_depth(self):
        secret_url = f"https://hooks.example.com/services/T000/B000/{STUB_TOKEN}"
        masker = SecretMasker()
        masker.register_secret(secret_url)
        log_filter = SecretMaskingFilter()
        record = logging.LogRecord(
            name="n",
            level=logging.INFO,
            pathname="",
            lineno=0,
            msg=f"calling {secret_url}",
            args=(),
            exc_info=None,
        )
        assert log_filter.filter(record) is True
        assert STUB_TOKEN not in record.msg
        assert "[REDACTED_SECRET]" in record.msg


# ---------------------------------------------------------------------------
# Activity-level contract


class TestActivityResultsAreSubprocessSafe:
    """Activity outputs stay plain JSON-safe dicts across the boundary."""

    def test_notify_result_round_trips_through_json(self):
        with webhook_stub([200]) as (url, _requests_log):
            result = Notifications().notify(webhook_url=url, message="json-safe")
        encoded = json.loads(json.dumps(result))
        assert encoded == {"status": "sent", "attempts": 1, "status_code": 200}

    def test_send_email_result_round_trips_through_json(self, smtp_state):
        result = Notifications().send_email(
            smtp_host="smtp.example.com",
            to=["dev@example.com"],
            subject="json-safe",
            body="payload",
            use_tls=False,
        )
        assert smtp_state["plain"][0].sent_messages
        encoded = json.loads(json.dumps(result))
        assert encoded["status"] == "sent"
        assert encoded["recipients"] == ["dev@example.com"]
        assert encoded["attachments"] == 0
