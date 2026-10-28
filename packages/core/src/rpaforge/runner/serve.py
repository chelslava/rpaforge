"""HTTP control-plane server for the unattended runner (issue #817).

``rpaforge-runner serve`` exposes a small localhost REST surface:

- ``GET /healthz`` — liveness probe (unauthenticated),
- ``GET /metrics`` — work-queue status counters (unauthenticated),
- ``POST /trigger`` — enqueue a diagram run for the daemon (Bearer-token
  authenticated via ``RPAFORGE_SERVE_TOKEN``).

Triggered items are written into the same SQLite work-queue store the daemon
polls, using the payload convention ``{"diagram_path": ..., "variables": ...}``
so ``rpaforge-runner daemon --queue <name>`` consumes them unchanged.

Built on :mod:`http.server` — no new dependencies, mirroring the runner's
stdlib-only posture. The server binds to ``127.0.0.1`` by default; fail-closed
auth means the trigger endpoint stays disabled until a token is configured.
"""

from __future__ import annotations

import hmac
import json
import logging
import time
from dataclasses import dataclass, field
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any

from rpaforge.queues.sqlite_store import SQLiteQueueStore
from rpaforge.runner.logging import EventLogger

logger = logging.getLogger("rpaforge.runner.serve")

#: Maximum accepted request body size for ``POST /trigger``.
MAX_BODY_BYTES = 1_000_000

#: Priorities accepted by the trigger endpoint (mirrors QueuePriority).
_ALLOWED_PRIORITIES = ("High", "Normal", "Low")


@dataclass
class ServeConfig:
    """Configuration for the ``serve`` HTTP control plane."""

    queue_name: str
    db_path: Path | str | None = None
    host: str = "127.0.0.1"
    port: int = 8765
    #: Bearer token guarding ``POST /trigger``; ``None`` keeps it disabled.
    token: str | None = None
    quiet: bool = False
    ndjson: bool = False
    event_logger: EventLogger | None = field(default=None, repr=False)


class ServeApp:
    """Request logic for the control-plane endpoints, HTTP-agnostic.

    Keeping routing decisions here lets tests assert on plain tuples, while
    the :class:`BaseHTTPRequestHandler` subclass stays a thin adapter.
    """

    def __init__(
        self, config: ServeConfig, store: SQLiteQueueStore | None = None
    ) -> None:
        self.config = config
        self.store = (
            store if store is not None else SQLiteQueueStore(db_path=config.db_path)
        )
        self._started_monotonic = time.monotonic()

    # -- GET ---------------------------------------------------------------

    def health_payload(self) -> dict[str, Any]:
        """Liveness document for ``GET /healthz``."""
        return {
            "status": "ok",
            "queue": self.config.queue_name,
            "uptime_sec": round(time.monotonic() - self._started_monotonic, 3),
        }

    def metrics_payload(self) -> dict[str, Any]:
        """Queue counters for ``GET /metrics``."""
        return {
            "queue": self.config.queue_name,
            "stats": self.store.get_queue_stats(self.config.queue_name),
        }

    # -- POST /trigger -----------------------------------------------------

    def _authorize(
        self, authorization_header: str | None, token_header: str | None
    ) -> int | None:
        """Return an error status, or ``None`` when the request may proceed."""
        if not self.config.token:
            return 403
        provided: str | None = None
        if authorization_header:
            scheme, _, credential = authorization_header.partition(" ")
            provided = credential.strip() if scheme.lower() == "bearer" else None
        if provided is None:
            provided = token_header
        if not provided or not hmac.compare_digest(provided, self.config.token):
            return 401
        return None

    def trigger(
        self,
        body: dict[str, Any],
        authorization_header: str | None = None,
        token_header: str | None = None,
    ) -> tuple[int, dict[str, Any]]:
        """Validate and enqueue one run request; returns ``(status, payload)``."""
        denied = self._authorize(authorization_header, token_header)
        if denied is not None:
            if denied == 403:
                return 403, {
                    "error": "trigger disabled: RPAFORGE_SERVE_TOKEN is not configured"
                }
            return 401, {"error": "invalid or missing auth token"}

        diagram_path = body.get("diagram_path")
        if not isinstance(diagram_path, str) or not diagram_path.strip():
            return 400, {"error": "'diagram_path' (non-empty string) is required"}

        variables = body.get("variables", {})
        if not isinstance(variables, dict):
            return 400, {"error": "'variables' must be an object"}

        priority = body.get("priority", "Normal")
        if priority not in _ALLOWED_PRIORITIES:
            return 400, {
                "error": f"'priority' must be one of {list(_ALLOWED_PRIORITIES)}"
            }

        reference = body.get("reference")
        if reference is not None and not isinstance(reference, str):
            return 400, {"error": "'reference' must be a string"}

        item = self.store.add_item(
            self.config.queue_name,
            payload={"diagram_path": diagram_path, "variables": dict(variables)},
            reference=reference,
            priority=priority,
        )
        if self.config.ndjson and self.config.event_logger is not None:
            self.config.event_logger.emit(
                "trigger_enqueued",
                item_id=item.id,
                queue=self.config.queue_name,
                reference=reference,
            )
        logger.info(
            "Trigger enqueued: item=%s queue=%s", item.id, self.config.queue_name
        )
        return 202, {
            "status": "queued",
            "item_id": item.id,
            "queue": self.config.queue_name,
        }


def make_handler(app: ServeApp) -> type[BaseHTTPRequestHandler]:
    """Build a request-handler class bound to a :class:`ServeApp`."""

    class ServeRequestHandler(BaseHTTPRequestHandler):
        """Thin HTTP adapter over :class:`ServeApp`; one process per request."""

        server_version = "rpaforge-runner-serve/1.0"

        def _send_json(self, status: int, payload: dict[str, Any]) -> None:
            body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
            self.send_response(status)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def _read_json_body(self) -> dict[str, Any] | None:
            """Read and parse the JSON body, or ``None`` after replying 4xx/413."""
            length_header = self.headers.get("Content-Length", "0")
            try:
                length = int(length_header)
            except ValueError:
                self._send_json(400, {"error": "invalid Content-Length"})
                return None
            if length < 0 or length > MAX_BODY_BYTES:
                self._send_json(413, {"error": "request body too large"})
                return None
            raw = self.rfile.read(length) if length else b""
            if not raw:
                self._send_json(400, {"error": "empty request body"})
                return None
            try:
                parsed = json.loads(raw.decode("utf-8"))
            except (UnicodeDecodeError, json.JSONDecodeError) as exc:
                self._send_json(400, {"error": f"invalid JSON body: {exc}"})
                return None
            if not isinstance(parsed, dict):
                self._send_json(400, {"error": "request body must be a JSON object"})
                return None
            return parsed

        def do_GET(self) -> None:  # noqa: N802 (stdlib naming)
            path = self.path.split("?", 1)[0]
            if path == "/healthz":
                self._send_json(200, app.health_payload())
            elif path == "/metrics":
                self._send_json(200, app.metrics_payload())
            else:
                self._send_json(404, {"error": f"unknown path {path}"})

        def do_POST(self) -> None:  # noqa: N802 (stdlib naming)
            path = self.path.split("?", 1)[0]
            if path != "/trigger":
                self._send_json(404, {"error": f"unknown path {path}"})
                return
            body = self._read_json_body()
            if body is None:
                return
            status, payload = app.trigger(
                body,
                authorization_header=self.headers.get("Authorization"),
                token_header=self.headers.get("X-Auth-Token"),
            )
            self._send_json(status, payload)

        def _method_not_allowed(self) -> None:  # noqa: N802 (stdlib naming)
            self._send_json(405, {"error": "method not allowed"})

        do_PUT = _method_not_allowed
        do_DELETE = _method_not_allowed
        do_PATCH = _method_not_allowed

        def log_message(self, format: str, *args: Any) -> None:  # noqa: A002
            logger.debug("%s - %s", self.address_string(), format % args)

    return ServeRequestHandler


def build_server(config: ServeConfig) -> tuple[ThreadingHTTPServer, ServeApp]:
    """Create (but do not start) the control-plane server for ``config``."""
    app = ServeApp(config)
    httpd = ThreadingHTTPServer((config.host, config.port), make_handler(app))
    bound_host = str(httpd.server_address[0])
    bound_port = int(httpd.server_address[1])
    message = f"serve: listening on http://{bound_host}:{bound_port} queue={config.queue_name}"
    if config.token is None:
        message += " (trigger DISABLED: RPAFORGE_SERVE_TOKEN not set)"
    if not config.quiet:
        print(message, flush=True)
    logger.info(message)
    return httpd, app


def serve(config: ServeConfig) -> int:
    """Run the control-plane server until interrupted. Returns exit code."""
    httpd, _app = build_server(config)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        httpd.server_close()
    return 0
