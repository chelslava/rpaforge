"""HTTP control-plane server for the unattended runner (issues #817, #857).

``rpaforge-runner serve`` exposes a small localhost REST surface:

- ``GET /healthz`` — liveness probe (unauthenticated),
- ``GET /metrics`` — work-queue status counters (unauthenticated),
- ``POST /trigger`` — enqueue a diagram run for the daemon (Bearer-token
  authenticated via ``RPAFORGE_SERVE_TOKEN``).

Serve API v2 (issue #857) — run observation and management, all Bearer-token
protected with the same fail-closed mechanism as ``POST /trigger``:

- ``GET /runs`` — recent runs (item id, run id, diagram, status, timing),
- ``GET /runs/{id}`` — run detail incl. per-step timing from the audit file,
- ``GET /runs/{id}/logs`` — per-run NDJSON log tail (``?tail=N``) with
  optional live streaming (``?follow=1``),
- ``POST /runs/{id}/cancel`` — queued items are cancelled outright; running
  items get a cooperative cancel flag picked up by the daemon's watcher,
- ``GET /schedules`` / ``PUT /schedules/{name}`` — list and upsert cron
  schedules when the server was started with ``--schedules``.

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

from rpaforge.config import get_runs_dir
from rpaforge.core.policy import PolicyConfigError, load_policy_file
from rpaforge.observability import otel
from rpaforge.queues.sqlite_store import SQLiteQueueStore
from rpaforge.runner.logging import EventLogger

logger = logging.getLogger("rpaforge.runner.serve")

#: Maximum accepted request body size for ``POST /trigger``.
MAX_BODY_BYTES = 1_000_000

#: Priorities accepted by the trigger endpoint (mirrors QueuePriority).
_ALLOWED_PRIORITIES = ("High", "Normal", "Low")

#: Run statuses accepted by ``GET /runs?status=`` (run_records vocabulary).
_ALLOWED_RUN_STATUSES = ("running", "success", "failed", "cancelled")

#: Default number of NDJSON log lines returned by ``GET /runs/{id}/logs``.
DEFAULT_LOG_TAIL = 200

#: Upper bound for ``?tail=`` (bounds the response size).
MAX_LOG_TAIL = 5000

#: Safety cap for a single ``?follow=1`` log stream, in seconds.
MAX_LOG_FOLLOW_SECONDS = 600.0

#: Poll cadence for the live log stream, in seconds.
LOG_FOLLOW_POLL_SECONDS = 0.5


def _read_last_lines(path: Path, count: int) -> list[str]:
    """Return up to ``count`` last lines of a text file (non-empty trimmed)."""
    try:
        with path.open("r", encoding="utf-8", errors="replace") as fh:
            return [line.rstrip("\n") for line in fh][-count:] if count else []
    except OSError:
        return []


@dataclass
class ServeConfig:
    """Configuration for the ``serve`` HTTP control plane."""

    queue_name: str
    db_path: Path | str | None = None
    #: Human-readable queue backend name reported by /healthz (issue #864).
    backend_name: str = "sqlite"
    host: str = "127.0.0.1"
    port: int = 8765
    #: Bearer token guarding ``POST /trigger``; ``None`` keeps it disabled.
    token: str | None = None
    quiet: bool = False
    ndjson: bool = False
    event_logger: EventLogger | None = field(default=None, repr=False)
    #: Schedules JSON file managed by ``GET/PUT /schedules`` (issue #857);
    #: ``None`` keeps the schedules endpoints disabled.
    schedules_path: Path | str | None = None
    #: Directory holding per-run NDJSON log files written by the daemon
    #: (issue #857); defaults to ``~/.rpaforge/runs/logs``.
    logs_dir: Path | str | None = None

    def resolved_logs_dir(self) -> Path:
        """The per-run log directory, resolved lazily."""
        if self.logs_dir is not None:
            return Path(self.logs_dir)
        return get_runs_dir() / "logs"


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
            "queue_backend": self.config.backend_name,
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
        policy_header: str | None = None,
    ) -> tuple[int, dict[str, Any]]:
        """Validate and enqueue one run request; returns ``(status, payload)``."""
        with otel.span(
            "serve.trigger",
            {"rpaforge.queue": self.config.queue_name},
        ):
            return self._trigger_locked(
                body, authorization_header, token_header, policy_header
            )

    def _trigger_locked(
        self,
        body: dict[str, Any],
        authorization_header: str | None,
        token_header: str | None,
        policy_header: str | None,
    ) -> tuple[int, dict[str, Any]]:
        denied = self._authorize(authorization_header, token_header)
        if denied is not None:
            otel.record_serve_trigger(self.config.queue_name, accepted=False)
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

        # Optional per-run permission policy manifest path (issue #844). The
        # header names a policy file on the runner host — validated eagerly so
        # a broken manifest fails the trigger instead of the queued run.
        payload: dict[str, Any] = {
            "diagram_path": diagram_path,
            "variables": dict(variables),
        }
        if policy_header is not None and policy_header.strip():
            try:
                load_policy_file(policy_header.strip())
            except (OSError, PolicyConfigError, ValueError) as exc:
                return 400, {"error": f"invalid policy manifest: {exc}"}
            payload["policy"] = policy_header.strip()

        item = self.store.add_item(
            self.config.queue_name,
            payload=payload,
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
        otel.record_serve_trigger(self.config.queue_name, accepted=True)
        logger.info(
            "Trigger enqueued: item=%s queue=%s", item.id, self.config.queue_name
        )
        return 202, {
            "status": "queued",
            "item_id": item.id,
            "queue": self.config.queue_name,
        }

    # -- serve API v2 (issue #857) ------------------------------------------

    def _auth_denial(
        self, authorization_header: str | None, token_header: str | None
    ) -> tuple[int, dict[str, Any]] | None:
        """Auth gate for v2 methods; returns an error tuple or None."""
        denied = self._authorize(authorization_header, token_header)
        if denied is None:
            return None
        if denied == 403:
            return 403, {
                "error": "auth disabled: RPAFORGE_SERVE_TOKEN is not configured"
            }
        return 401, {"error": "invalid or missing auth token"}

    @property
    def runs_supported(self) -> bool:
        """Whether the queue store exposes the runs/cancel surface."""
        return hasattr(self.store, "list_runs") and hasattr(self.store, "get_run")

    @property
    def schedules_supported(self) -> bool:
        """Whether the server was started with a schedules file."""
        return self.config.schedules_path is not None

    def _runs_unsupported(self) -> tuple[int, dict[str, Any]]:
        return 501, {
            "error": (
                "runs API requires the sqlite queue backend; the configured "
                f"store ({self.config.backend_name}) does not expose it"
            )
        }

    def runs_payload(
        self,
        limit: Any,
        status: Any,
        authorization_header: str | None = None,
        token_header: str | None = None,
    ) -> tuple[int, dict[str, Any]]:
        """``GET /runs?limit=&status=`` — recent runs, newest first."""
        denied = self._auth_denial(authorization_header, token_header)
        if denied is not None:
            return denied
        if not self.runs_supported:
            return self._runs_unsupported()
        if limit is None or (isinstance(limit, str) and not limit.strip()):
            bounded = 20
        else:
            try:
                bounded = int(limit)
            except (TypeError, ValueError):
                return 400, {"error": "'limit' must be an integer"}
        if not 1 <= bounded <= 100:
            return 400, {"error": "'limit' must be between 1 and 100"}

        status_value: str | None = None
        if status is not None and str(status).strip():
            status_value = str(status).strip().lower()
            if status_value not in _ALLOWED_RUN_STATUSES:
                return 400, {
                    "error": (f"'status' must be one of {list(_ALLOWED_RUN_STATUSES)}")
                }
        runs = self.store.list_runs(
            self.config.queue_name, limit=bounded, status=status_value
        )
        return 200, {"queue": self.config.queue_name, "runs": runs}

    def run_detail(
        self,
        item_id: str,
        authorization_header: str | None = None,
        token_header: str | None = None,
    ) -> tuple[int, dict[str, Any]]:
        """``GET /runs/{id}`` — run record plus per-step audit timing."""
        denied = self._auth_denial(authorization_header, token_header)
        if denied is not None:
            return denied
        if not self.runs_supported:
            return self._runs_unsupported()
        run = self.store.get_run(item_id)
        if run is None:
            return 404, {"error": f"no run record for item '{item_id}'"}
        run = dict(run)
        run["steps"] = self._load_steps(run.get("audit_path"))
        return 200, run

    def _load_steps(self, audit_path: Any) -> list[dict[str, Any]]:
        """Per-step records from the run's audit JSON, when written yet."""
        if not audit_path:
            return []
        try:
            data = json.loads(Path(str(audit_path)).read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            return []
        steps = data.get("steps", []) if isinstance(data, dict) else []
        return [s for s in steps if isinstance(s, dict)]

    def run_logs_payload(
        self,
        item_id: str,
        tail: Any,
        follow: bool,
        authorization_header: str | None = None,
        token_header: str | None = None,
    ) -> tuple[int, dict[str, Any]]:
        """``GET /runs/{id}/logs`` — NDJSON log tail for one run."""
        denied = self._auth_denial(authorization_header, token_header)
        if denied is not None:
            return denied
        if not self.runs_supported:
            return self._runs_unsupported()
        if self.store.get_run(item_id) is None:
            return 404, {"error": f"no run record for item '{item_id}'"}
        log_path = self.config.resolved_logs_dir() / f"{item_id}.ndjson"
        if not log_path.exists():
            return 404, {"error": f"no log file for run '{item_id}'"}
        if tail is None or (isinstance(tail, str) and not tail.strip()):
            bounded_tail = DEFAULT_LOG_TAIL
        else:
            try:
                bounded_tail = int(tail)
            except (TypeError, ValueError):
                return 400, {"error": "'tail' must be an integer"}
        if not 0 <= bounded_tail <= MAX_LOG_TAIL:
            return 400, {"error": f"'tail' must be between 0 and {MAX_LOG_TAIL}"}
        lines = _read_last_lines(log_path, bounded_tail)
        if not follow:
            return 200, {"item_id": item_id, "log_path": str(log_path), "lines": lines}

        # Live tail: the handler streams; this payload seeds the first chunk.
        return 200, {
            "item_id": item_id,
            "log_path": str(log_path),
            "lines": lines,
            "follow": True,
        }

    def cancel_run(
        self,
        item_id: str,
        authorization_header: str | None = None,
        token_header: str | None = None,
    ) -> tuple[int, dict[str, Any]]:
        """``POST /runs/{id}/cancel`` — cancel a queued or running run."""
        denied = self._auth_denial(authorization_header, token_header)
        if denied is not None:
            return denied
        if not self.runs_supported:
            return self._runs_unsupported()
        try:
            item = self.store.get_item(item_id)
        except ValueError:
            return 404, {"error": f"unknown run '{item_id}'"}

        status = (
            item.status.value if hasattr(item.status, "value") else str(item.status)
        )
        if status in ("New", "Retried"):
            try:
                self.store.cancel_item(item_id, reason="cancelled via control plane")
            except ValueError as exc:
                return 409, {"error": str(exc)}
            return 200, {
                "item_id": item_id,
                "status": "cancelled",
                "stage": "before_pickup",
            }
        if status == "InProgress":
            try:
                self.store.request_cancel(item_id, reason="cancel via control plane")
            except ValueError as exc:
                return 409, {"error": str(exc)}
            return 202, {
                "item_id": item_id,
                "status": "cancel_requested",
                "stage": "cooperative",
            }
        return 409, {"error": f"run '{item_id}' already finished ({status})"}

    def schedules_payload(
        self,
        authorization_header: str | None = None,
        token_header: str | None = None,
    ) -> tuple[int, dict[str, Any]]:
        """``GET /schedules`` — validated list of configured schedules."""
        denied = self._auth_denial(authorization_header, token_header)
        if denied is not None:
            return denied
        if not self.schedules_supported:
            return self._schedules_unsupported()
        from rpaforge.runner.schedules import ScheduleConfigError, load_schedules

        path = Path(str(self.config.schedules_path))
        if not path.exists():
            return 200, {"schedules": [], "source": str(path)}
        try:
            specs = load_schedules(path)
        except (ScheduleConfigError, OSError) as exc:
            return 500, {"error": f"schedules file invalid: {exc}"}
        schedules = [
            {
                "name": s.name,
                "cron": s.cron.expression,
                "diagram_path": s.diagram_path,
                "variables": dict(s.variables),
                "reference": s.reference,
                "priority": s.priority,
                "missed_run_policy": s.missed_run_policy,
                "last_enqueued": self._last_enqueued(s.name),
            }
            for s in specs
        ]
        return 200, {"schedules": schedules, "source": str(path)}

    def put_schedule(
        self,
        name: str,
        body: dict[str, Any],
        authorization_header: str | None = None,
        token_header: str | None = None,
    ) -> tuple[int, dict[str, Any]]:
        """``PUT /schedules/{name}`` — validate and upsert one schedule."""
        denied = self._auth_denial(authorization_header, token_header)
        if denied is not None:
            return denied
        if not self.schedules_supported:
            return self._schedules_unsupported()
        from rpaforge.runner.schedules import ScheduleConfigError, upsert_schedule

        if not isinstance(body, dict):
            return 400, {"error": "request body must be a JSON object"}
        body_name = str(body.get("name", "")).strip()
        if not body_name:
            body["name"] = name
        elif body_name != name:
            return 400, {
                "error": f"path name {name!r} does not match body name {body_name!r}"
            }
        try:
            spec = upsert_schedule(Path(str(self.config.schedules_path)), body)
        except ScheduleConfigError as exc:
            return 400, {"error": str(exc)}
        except OSError as exc:
            return 500, {"error": f"cannot write schedules file: {exc}"}
        return 200, {
            "status": "upserted",
            "schedule": {
                "name": spec.name,
                "cron": spec.cron.expression,
                "diagram_path": spec.diagram_path,
                "priority": spec.priority,
                "missed_run_policy": spec.missed_run_policy,
            },
        }

    def _schedules_unsupported(self) -> tuple[int, dict[str, Any]]:
        return 501, {
            "error": "schedules endpoints require starting serve with --schedules"
        }

    def _last_enqueued(self, name: str) -> str | None:
        from rpaforge.runner.schedules import ScheduleState

        state_path = Path(str(self.config.schedules_path)).with_name(
            Path(str(self.config.schedules_path)).name + ".state.json"
        )
        if not state_path.exists():
            return None
        return ScheduleState(state_path).get(name)


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

        def _auth_error(self) -> int | None:
            """Bearer-token gate for v2 endpoints; returns status or None."""
            return app._authorize(
                self.headers.get("Authorization"),
                self.headers.get("X-Auth-Token"),
            )

        def _query_params(self) -> dict[str, str]:
            query = self.path.split("?", 1)[1] if "?" in self.path else ""
            params: dict[str, str] = {}
            for part in query.split("&"):
                if not part:
                    continue
                key, _, value = part.partition("=")
                params[key] = value
            return params

        def _match_run_path(self, path: str) -> tuple[str, str] | None:
            """Split ``/runs/{id}[/{action}]``; None when not a run path."""
            parts = path.split("/")
            if len(parts) >= 3 and parts[1] == "runs" and parts[2]:
                return parts[2], parts[3] if len(parts) > 3 else ""
            return None

        def _stream_log_follow(self, item_id: str) -> None:
            """Stream appended NDJSON log lines until disconnect/finish."""
            log_path = app.config.resolved_logs_dir() / f"{item_id}.ndjson"
            self.send_response(200)
            self.send_header("Content-Type", "application/x-ndjson; charset=utf-8")
            self.end_headers()
            offset = 0
            deadline = time.monotonic() + MAX_LOG_FOLLOW_SECONDS
            try:
                while time.monotonic() < deadline:
                    try:
                        size = log_path.stat().st_size
                    except OSError:
                        size = offset
                    if offset > size:
                        offset = 0
                    if size > offset:
                        with log_path.open(
                            "r", encoding="utf-8", errors="replace"
                        ) as fh:
                            fh.seek(offset)
                            chunk = fh.read()
                        offset = size
                        if chunk:
                            self.wfile.write(chunk.encode("utf-8"))
                            self.wfile.flush()
                    else:
                        run = app.store.get_run(item_id)
                        if run is not None and run.get("status") != "running":
                            break
                    self.wfile.flush()
                    time.sleep(LOG_FOLLOW_POLL_SECONDS)
            except (BrokenPipeError, ConnectionResetError, OSError):
                pass

        def do_GET(self) -> None:  # noqa: N802 (stdlib naming)
            path = self.path.split("?", 1)[0]
            if path == "/healthz":
                self._send_json(200, app.health_payload())
                return
            if path == "/metrics":
                self._send_json(200, app.metrics_payload())
                return

            denied = self._auth_error()
            if denied is not None:
                self._send_json(
                    denied,
                    {
                        "error": "invalid or missing auth token"
                        if denied == 401
                        else "auth disabled: RPAFORGE_SERVE_TOKEN is not configured"
                    },
                )
                return

            params = self._query_params()
            if path == "/runs":
                status, payload = app.runs_payload(
                    params.get("limit"),
                    params.get("status"),
                    authorization_header=self.headers.get("Authorization"),
                    token_header=self.headers.get("X-Auth-Token"),
                )
                self._send_json(status, payload)
                return
            run_match = self._match_run_path(path)
            if run_match is not None:
                item_id, action = run_match
                if action == "":
                    status, payload = app.run_detail(
                        item_id,
                        authorization_header=self.headers.get("Authorization"),
                        token_header=self.headers.get("X-Auth-Token"),
                    )
                    self._send_json(status, payload)
                elif action == "logs":
                    follow = params.get("follow") in ("1", "true")
                    status, payload = app.run_logs_payload(
                        item_id,
                        params.get("tail"),
                        follow,
                        authorization_header=self.headers.get("Authorization"),
                        token_header=self.headers.get("X-Auth-Token"),
                    )
                    if follow and status == 200:
                        self._stream_log_follow(item_id)
                    else:
                        self._send_json(status, payload)
                else:
                    self._send_json(404, {"error": f"unknown path {path}"})
                return
            if path == "/schedules":
                status, payload = app.schedules_payload(
                    authorization_header=self.headers.get("Authorization"),
                    token_header=self.headers.get("X-Auth-Token"),
                )
                self._send_json(status, payload)
                return
            self._send_json(404, {"error": f"unknown path {path}"})

        def do_POST(self) -> None:  # noqa: N802 (stdlib naming)
            path = self.path.split("?", 1)[0]
            if path == "/trigger":
                body = self._read_json_body()
                if body is None:
                    return
                status, payload = app.trigger(
                    body,
                    authorization_header=self.headers.get("Authorization"),
                    token_header=self.headers.get("X-Auth-Token"),
                    policy_header=self.headers.get("X-RPAForge-Policy"),
                )
                self._send_json(status, payload)
                return

            denied = self._auth_error()
            if denied is not None:
                self._send_json(
                    denied,
                    {
                        "error": "invalid or missing auth token"
                        if denied == 401
                        else "auth disabled: RPAFORGE_SERVE_TOKEN is not configured"
                    },
                )
                return

            run_match = self._match_run_path(path)
            if run_match is not None and run_match[1] == "cancel":
                status, payload = app.cancel_run(
                    run_match[0],
                    authorization_header=self.headers.get("Authorization"),
                    token_header=self.headers.get("X-Auth-Token"),
                )
                self._send_json(status, payload)
                return
            self._send_json(404, {"error": f"unknown path {path}"})

        def do_PUT(self) -> None:  # noqa: N802 (stdlib naming)
            path = self.path.split("?", 1)[0]
            denied = self._auth_error()
            if denied is not None:
                self._send_json(
                    denied,
                    {
                        "error": "invalid or missing auth token"
                        if denied == 401
                        else "auth disabled: RPAFORGE_SERVE_TOKEN is not configured"
                    },
                )
                return
            if path.startswith("/schedules/"):
                name = path[len("/schedules/") :].strip("/")
                if not name or "/" in name:
                    self._send_json(404, {"error": f"unknown path {path}"})
                    return
                body = self._read_json_body()
                if body is None:
                    return
                status, payload = app.put_schedule(
                    name,
                    body,
                    authorization_header=self.headers.get("Authorization"),
                    token_header=self.headers.get("X-Auth-Token"),
                )
                self._send_json(status, payload)
                return
            self._send_json(404, {"error": f"unknown path {path}"})

        def _method_not_allowed(self) -> None:  # noqa: N802 (stdlib naming)
            self._send_json(405, {"error": "method not allowed"})

        do_DELETE = _method_not_allowed
        do_PATCH = _method_not_allowed

        def log_message(self, format: str, *args: Any) -> None:  # noqa: A002
            logger.debug("%s - %s", self.address_string(), format % args)

    return ServeRequestHandler


def build_server(
    config: ServeConfig, store: Any | None = None
) -> tuple[ThreadingHTTPServer, ServeApp]:
    """Create (but do not start) the control-plane server for ``config``."""
    app = ServeApp(config, store=store)
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


def serve(config: ServeConfig, store: Any | None = None) -> int:
    """Run the control-plane server until interrupted. Returns exit code."""
    httpd, _app = build_server(config, store=store)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        httpd.server_close()
    return 0
