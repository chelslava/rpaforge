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

import json
import logging
import math
import ssl
import time
from dataclasses import dataclass, field
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any

from rpaforge.config import get_runs_dir
from rpaforge.core.policy import PolicyConfigError, load_policy_file
from rpaforge.diagnosis.bundle import build_diagnosis_bundle
from rpaforge.diagnosis.engine import (
    DiagnosisError,
    diagnose_run,
    load_diagnosis_artifact,
    save_diagnosis_artifact,
)
from rpaforge.observability import otel
from rpaforge.queues.sqlite_store import SQLiteQueueStore
from rpaforge.runner.logging import EventLogger
from rpaforge.runner.serve_security import (
    SCOPE_ADMIN,
    SCOPE_READ,
    SCOPE_TRIGGER,
    AuthRateLimiter,
    TokenRegistry,
)

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

#: Hosts treated as loopback for the TLS refusal check (issue #908).
_LOOPBACK_HOSTS = frozenset({"127.0.0.1", "::1", "localhost"})


class ServeSecurityError(RuntimeError):
    """Raised for insecure serve configurations that must fail closed."""


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
    #: Token file with ``TOKEN[:SCOPE]`` entries, hot-reloaded on mtime
    #: change (issue #908); entries are unioned with the static token.
    token_file: Path | str | None = None
    #: TLS material; both must be set to serve ``https://`` (issue #908).
    tls_certfile: Path | str | None = None
    tls_keyfile: Path | str | None = None
    #: Explicit escape to bind non-loopback without TLS (logged loudly).
    allow_insecure: bool = False
    #: Require auth for ``/healthz`` and ``/metrics``; default open for LB
    #: probes, with the payload shrunk while unauthenticated (issue #908).
    require_auth_health: bool = False
    #: Reject requests carrying an ``Origin`` header (strict cross-origin
    #: deny; off by default so browser-context clients are unaffected).
    deny_cross_origin: bool = False
    #: Auth-failure rate limit: failures before 429 and refill cadence.
    auth_max_failures: int = 10
    auth_refill_per_minute: float = 5.0
    quiet: bool = False
    ndjson: bool = False
    event_logger: EventLogger | None = field(default=None, repr=False)
    #: Schedules JSON file managed by ``GET/PUT /schedules`` (issue #857);
    #: ``None`` keeps the schedules endpoints disabled.
    schedules_path: Path | str | None = None
    #: Directory holding per-run NDJSON log files written by the daemon
    #: (issue #857); defaults to ``~/.rpaforge/runs/logs``.
    logs_dir: Path | str | None = None
    #: LLM client factory for the batch diagnose op (issue #906); ``None``
    #: resolves the client lazily from ``RPAFORGE_LLM_*`` env on first use.
    #: Tests inject a factory returning a scripted fake client.
    diagnosis_client_factory: Any | None = field(default=None, repr=False)

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

    def __init__(self, config: ServeConfig, store: Any | None = None) -> None:
        # ``store`` is duck-typed: SQLite and PostgreSQL queue stores expose
        # the same method surface (issue #887), serve detects the runs/cancel
        # capability via :attr:`runs_supported`.
        self.config = config
        self.store = (
            store if store is not None else SQLiteQueueStore(db_path=config.db_path)
        )
        self.tokens = TokenRegistry(config.token, config.token_file)
        self.limiter = AuthRateLimiter(
            config.auth_max_failures, config.auth_refill_per_minute
        )
        self._started_monotonic = time.monotonic()

    # -- GET ---------------------------------------------------------------

    def health_payload(self, authenticated: bool = True) -> dict[str, Any]:
        """Liveness document for ``GET /healthz``.

        Unauthenticated LB probes get a minimal body; queue metadata is
        disclosure that only authenticated clients receive (issue #908).
        """
        if not authenticated:
            return {"status": "ok"}
        return {
            "status": "ok",
            "queue": self.config.queue_name,
            "queue_backend": self.config.backend_name,
            "uptime_sec": round(time.monotonic() - self._started_monotonic, 3),
        }

    def metrics_payload(self, authenticated: bool = True) -> dict[str, Any]:
        """Queue counters for ``GET /metrics`` (shrunk while anonymous)."""
        if not authenticated:
            return {
                "queue": self.config.queue_name,
                "stats": "auth required for queue statistics",
            }
        return {
            "queue": self.config.queue_name,
            "stats": self.store.get_queue_stats(self.config.queue_name),
        }

    # -- POST /trigger -----------------------------------------------------

    def _authorize(
        self,
        required_scope: str,
        authorization_header: str | None,
        token_header: str | None,
    ) -> tuple[int, dict[str, Any]] | None:
        """Scoped auth gate; returns an error tuple, or ``None`` when allowed.

        Token-file rotation is picked up lazily inside
        :meth:`TokenRegistry.lookup` (issue #908).
        """
        if not self.tokens.configured:
            return 403, {
                "error": "auth disabled: RPAFORGE_SERVE_TOKEN is not configured"
            }
        provided: str | None = None
        if authorization_header:
            scheme, _, credential = authorization_header.partition(" ")
            provided = credential.strip() if scheme.lower() == "bearer" else None
        if provided is None:
            provided = token_header
        if not provided:
            return 401, {"error": "invalid or missing auth token"}
        scope = self.tokens.lookup(provided)
        if scope is None:
            return 401, {"error": "invalid or missing auth token"}
        if not self.tokens.allows(scope, required_scope):
            return 403, {
                "error": (
                    f"token scope {scope!r} is not sufficient for this "
                    f"endpoint (requires {required_scope!r})"
                )
            }
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
        denied = self._authorize(SCOPE_TRIGGER, authorization_header, token_header)
        if denied is not None:
            otel.record_serve_trigger(self.config.queue_name, accepted=False)
            return denied

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
        self,
        required_scope: str,
        authorization_header: str | None,
        token_header: str | None,
    ) -> tuple[int, dict[str, Any]] | None:
        """Scoped auth gate for v2 methods; returns an error tuple or None."""
        return self._authorize(required_scope, authorization_header, token_header)

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
                f"the configured queue store ({self.config.backend_name}) does "
                "not expose the runs/cancel surface"
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
        denied = self._auth_denial(SCOPE_READ, authorization_header, token_header)
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
        denied = self._auth_denial(SCOPE_READ, authorization_header, token_header)
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
        denied = self._auth_denial(SCOPE_READ, authorization_header, token_header)
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
        denied = self._auth_denial(SCOPE_ADMIN, authorization_header, token_header)
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
        denied = self._auth_denial(SCOPE_READ, authorization_header, token_header)
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
        denied = self._auth_denial(SCOPE_ADMIN, authorization_header, token_header)
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

    def delete_schedule(
        self,
        name: str,
        authorization_header: str | None = None,
        token_header: str | None = None,
    ) -> tuple[int, dict[str, Any]]:
        """``DELETE /schedules/{name}`` — remove one schedule (issue #876)."""
        denied = self._auth_denial(SCOPE_ADMIN, authorization_header, token_header)
        if denied is not None:
            return denied
        if not self.schedules_supported:
            return self._schedules_unsupported()
        from rpaforge.runner.schedules import ScheduleConfigError, delete_schedule

        try:
            removed = delete_schedule(Path(str(self.config.schedules_path)), name)
        except ScheduleConfigError as exc:
            return 400, {"error": str(exc)}
        except OSError as exc:
            return 500, {"error": f"cannot write schedules file: {exc}"}
        if not removed:
            return 404, {"error": f"schedule {name!r} not found"}
        return 200, {"status": "deleted", "name": name}

    def queue_items_payload(
        self,
        queue_name: str,
        status: str | None = None,
        limit: str | None = None,
        authorization_header: str | None = None,
        token_header: str | None = None,
    ) -> tuple[int, dict[str, Any]]:
        """``GET /queues/{name}/items`` — recent items, newest first (issue #877)."""
        denied = self._auth_denial(SCOPE_READ, authorization_header, token_header)
        if denied is not None:
            return denied
        if limit is not None:
            try:
                bounded = int(limit)
            except ValueError:
                return 400, {"error": "'limit' must be an integer"}
        else:
            bounded = 25
        items = self.store.list_items(queue_name, limit=bounded, status=status)
        return 200, {
            "queue": queue_name,
            "items": [item.to_dict() for item in items],
        }

    def requeue_item(
        self,
        queue_name: str,
        item_id: str,
        authorization_header: str | None = None,
        token_header: str | None = None,
    ) -> tuple[int, dict[str, Any]]:
        """``POST /queues/{name}/items/{id}/requeue`` — requeue one DeadLetter item."""
        denied = self._auth_denial(SCOPE_ADMIN, authorization_header, token_header)
        if denied is not None:
            return denied
        requeued = self.store.requeue_dead_letter(queue_name, item_id=item_id)
        if requeued == 0:
            return 404, {
                "error": (
                    f"dead-letter item {item_id!r} not found in queue {queue_name!r}"
                )
            }
        return 200, {"status": "requeued", "requeued": requeued}

    def requeue_dead_letter_bulk(
        self,
        queue_name: str,
        authorization_header: str | None = None,
        token_header: str | None = None,
    ) -> tuple[int, dict[str, Any]]:
        """``POST /queues/{name}/requeue`` — requeue all DeadLetter items."""
        denied = self._auth_denial(SCOPE_ADMIN, authorization_header, token_header)
        if denied is not None:
            return denied
        requeued = self.store.requeue_dead_letter(queue_name, item_id=None)
        return 200, {"status": "requeued", "requeued": requeued}

    def diagnose_item(
        self,
        queue_name: str,
        item_id: str,
        authorization_header: str | None = None,
        token_header: str | None = None,
    ) -> tuple[int, dict[str, Any]]:
        """``POST /queues/{name}/items/{id}/diagnose`` — AI failure diagnosis.

        Batch mode of issue #906: builds the redacted context bundle from
        the item's run record + NDJSON log, asks the LLM for a root-cause
        hypothesis and typed fix proposals, and stores the diagnosis JSON
        artifact next to the run logs (propose-only; applying is a
        Studio-side action).
        """
        denied = self._auth_denial(SCOPE_ADMIN, authorization_header, token_header)
        if denied is not None:
            return denied
        if not self.runs_supported:
            return self._runs_unsupported()
        try:
            item = self.store.get_item(item_id)
        except ValueError:
            return 404, {"error": f"item {item_id!r} not found"}
        if item.queue_name != queue_name:
            return 404, {"error": f"item {item_id!r} not in queue {queue_name!r}"}
        if item.status.value != "DeadLetter":
            return 409, {
                "error": (
                    f"item {item_id!r} is {item.status.value}; only "
                    "DeadLetter items can be diagnosed"
                )
            }
        record = self.store.get_run(item_id) or {}
        diagram = self._load_diagram(record.get("diagram_path"))
        bundle = build_diagnosis_bundle(
            audit_path=record.get("audit_path") or None,
            logs_path=self.config.resolved_logs_dir() / f"{item_id}.ndjson",
            diagram=diagram,
            item_id=item_id,
            run_id=record.get("run_id"),
            error=item.error_message,
        )
        factory = self.config.diagnosis_client_factory
        client = factory() if factory is not None else None
        try:
            diagnosis = diagnose_run(bundle, client=client)
        except DiagnosisError as exc:
            return 502, {"error": f"diagnosis failed: {exc}"}
        except Exception as exc:  # provider/config errors (LLMError etc.)
            return 503, {"error": f"diagnosis unavailable: {exc}"}
        artifact = save_diagnosis_artifact(
            diagnosis, self.config.resolved_logs_dir(), item_id=item_id
        )
        return 200, {
            "status": "diagnosed",
            "item_id": item_id,
            "queue": queue_name,
            "diagnosis": diagnosis,
            "artifact": str(artifact),
        }

    def item_diagnosis(
        self,
        queue_name: str,
        item_id: str,
        authorization_header: str | None = None,
        token_header: str | None = None,
    ) -> tuple[int, dict[str, Any]]:
        """``GET /queues/{name}/items/{id}/diagnosis`` — read the artifact."""
        denied = self._auth_denial(SCOPE_READ, authorization_header, token_header)
        if denied is not None:
            return denied
        diagnosis = load_diagnosis_artifact(
            self.config.resolved_logs_dir(), item_id=item_id
        )
        if diagnosis is None:
            return 404, {"error": f"no diagnosis artifact for item {item_id!r}"}
        return 200, {"item_id": item_id, "queue": queue_name, "diagnosis": diagnosis}

    def _load_diagram(self, diagram_path: Any) -> dict[str, Any] | None:
        """Load the recorded diagram document, ``None`` when unavailable."""
        if not diagram_path:
            return None
        try:
            data = json.loads(Path(str(diagram_path)).read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            return None
        return data if isinstance(data, dict) else None

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

        def _send_json(
            self,
            status: int,
            payload: dict[str, Any],
            headers: dict[str, str] | None = None,
        ) -> None:
            body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
            self.send_response(status)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            # Deny-by-default CORS: no Access-Control-Allow-* header is ever
            # emitted; Vary prepares caches for that invariant (issue #908).
            self.send_header("Vary", "Origin")
            for name, value in (headers or {}).items():
                self.send_header(name, value)
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

        def _client_ip(self) -> str:
            """Source IP for the per-IP auth-failure rate limiter."""
            return self.client_address[0] if self.client_address else "unknown"

        def _auth_error(
            self, required_scope: str
        ) -> tuple[int, dict[str, Any], dict[str, str]] | None:
            """Scoped gate + failure-rate limiter.

            Returns (status, payload, extra_headers) to reply with, or
            None when the request may proceed. A 401 consumes one
            failure-bucket token; an exhausted bucket answers 429 with
            Retry-After before any auth verdict leaks (issue #908).
            """
            denied = app._authorize(
                required_scope,
                self.headers.get("Authorization"),
                self.headers.get("X-Auth-Token"),
            )
            if denied is None:
                app.limiter.reset(self._client_ip())
                return None
            status, payload = denied
            if status == 401:
                allowed, retry_after = app.limiter.consume_failure(self._client_ip())
                if not allowed:
                    return (
                        429,
                        {"error": "too many failed auth attempts; slow down"},
                        {"Retry-After": str(max(1, math.ceil(retry_after)))},
                    )
            return status, payload, {}

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
                # Client disconnected or stream errored — stop following.
                return

        def do_GET(self) -> None:  # noqa: N802 (stdlib naming)
            path = self.path.split("?", 1)[0]
            if self._cross_origin_denied():
                self._send_json(403, {"error": "cross-origin requests are denied"})
                return
            if path in ("/healthz", "/metrics"):
                # Default open for LB probes, payload shrunk while
                # anonymous; --require-auth-health flips both to authed
                # (issue #908). The soft detection below never touches
                # the failure limiter, so unauthenticated LB probes are
                # never throttled.
                authenticated = True
                if app.config.require_auth_health:
                    denied = self._auth_error(SCOPE_READ)
                    if denied is not None:
                        self._send_json(*denied)
                        return
                else:
                    provided = None
                    auth_header = self.headers.get("Authorization")
                    if auth_header:
                        scheme, _, credential = auth_header.partition(" ")
                        provided = (
                            credential.strip() if scheme.lower() == "bearer" else None
                        )
                    if provided is None:
                        provided = self.headers.get("X-Auth-Token")
                    authenticated = bool(provided and app.tokens.lookup(provided))
                payload = (
                    app.health_payload(authenticated)
                    if path == "/healthz"
                    else app.metrics_payload(authenticated)
                )
                self._send_json(200, payload)
                return

            denied = self._auth_error(SCOPE_READ)
            if denied is not None:
                self._send_json(*denied)
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
            if path.startswith("/queues/"):
                segments = path[len("/queues/") :].strip("/").split("/")
                if len(segments) == 2 and segments[0] and segments[1] == "items":
                    status, payload = app.queue_items_payload(
                        segments[0],
                        params.get("status"),
                        params.get("limit"),
                        authorization_header=self.headers.get("Authorization"),
                        token_header=self.headers.get("X-Auth-Token"),
                    )
                    self._send_json(status, payload)
                    return
                if (
                    len(segments) == 4
                    and segments[0]
                    and segments[1] == "items"
                    and segments[2]
                    and segments[3] == "diagnosis"
                ):
                    status, payload = app.item_diagnosis(
                        segments[0],
                        segments[2],
                        authorization_header=self.headers.get("Authorization"),
                        token_header=self.headers.get("X-Auth-Token"),
                    )
                    self._send_json(status, payload)
                    return
                self._send_json(404, {"error": f"unknown path {path}"})
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
            if self._cross_origin_denied():
                self._send_json(403, {"error": "cross-origin requests are denied"})
                return
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

            denied = self._auth_error(SCOPE_ADMIN)
            if denied is not None:
                self._send_json(*denied)
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
            if path.startswith("/queues/"):
                segments = path[len("/queues/") :].strip("/").split("/")
                if len(segments) == 2 and segments[0] and segments[1] == "requeue":
                    status, payload = app.requeue_dead_letter_bulk(
                        segments[0],
                        authorization_header=self.headers.get("Authorization"),
                        token_header=self.headers.get("X-Auth-Token"),
                    )
                    self._send_json(status, payload)
                    return
                if (
                    len(segments) == 4
                    and segments[0]
                    and segments[1] == "items"
                    and segments[2]
                    and segments[3] == "requeue"
                ):
                    status, payload = app.requeue_item(
                        segments[0],
                        segments[2],
                        authorization_header=self.headers.get("Authorization"),
                        token_header=self.headers.get("X-Auth-Token"),
                    )
                    self._send_json(status, payload)
                    return
                if (
                    len(segments) == 4
                    and segments[0]
                    and segments[1] == "items"
                    and segments[2]
                    and segments[3] == "diagnose"
                ):
                    status, payload = app.diagnose_item(
                        segments[0],
                        segments[2],
                        authorization_header=self.headers.get("Authorization"),
                        token_header=self.headers.get("X-Auth-Token"),
                    )
                    self._send_json(status, payload)
                    return
                self._send_json(404, {"error": f"unknown path {path}"})
                return
            self._send_json(404, {"error": f"unknown path {path}"})

        def do_PUT(self) -> None:  # noqa: N802 (stdlib naming)
            path = self.path.split("?", 1)[0]
            denied = self._auth_error(SCOPE_ADMIN)
            if denied is not None:
                self._send_json(*denied)
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

        def do_DELETE(self) -> None:  # noqa: N802 (stdlib naming)
            path = self.path.split("?", 1)[0]
            denied = self._auth_error(SCOPE_ADMIN)
            if denied is not None:
                self._send_json(*denied)
                return
            if path.startswith("/schedules/"):
                name = path[len("/schedules/") :].strip("/")
                if not name or "/" in name:
                    self._send_json(404, {"error": f"unknown path {path}"})
                    return
                status, payload = app.delete_schedule(
                    name,
                    authorization_header=self.headers.get("Authorization"),
                    token_header=self.headers.get("X-Auth-Token"),
                )
                self._send_json(status, payload)
                return
            self._send_json(404, {"error": f"unknown path {path}"})

        def _cross_origin_denied(self) -> bool:
            """Strict cross-origin deny (opt-in --deny-cross-origin)."""
            return app.config.deny_cross_origin and bool(self.headers.get("Origin"))

        def _method_not_allowed(self) -> None:  # noqa: N802 (stdlib naming)
            self._send_json(405, {"error": "method not allowed"})

        def do_OPTIONS(self) -> None:  # noqa: N802 (stdlib naming)
            # CORS deny-by-default: preflights are never answered, so a
            # browser cannot even probe cross-origin endpoints (issue #908).
            self._send_json(405, {"error": "method not allowed"})

        do_PATCH = _method_not_allowed

        def log_message(self, format: str, *args: Any) -> None:  # noqa: A002
            logger.debug("%s - %s", self.address_string(), format % args)

    return ServeRequestHandler


def build_server(
    config: ServeConfig, store: Any | None = None
) -> tuple[ThreadingHTTPServer, ServeApp]:
    """Create (but do not start) the control-plane server for ``config``.

    Security posture (issue #908): non-loopback binds without TLS are
    refused unless ``allow_insecure`` is set explicitly; with TLS
    material the socket is wrapped server-side and the server speaks
    ``https``.
    """
    tls_enabled = bool(config.tls_certfile) and bool(config.tls_keyfile)
    if bool(config.tls_certfile) != bool(config.tls_keyfile):
        raise ServeSecurityError(
            "--tls-certfile and --tls-keyfile must be provided together"
        )
    loopback = config.host in _LOOPBACK_HOSTS
    if not tls_enabled and not loopback and not config.allow_insecure:
        raise ServeSecurityError(
            f"refusing to bind non-loopback {config.host!r} without TLS: "
            "provide --tls-certfile/--tls-keyfile or pass --allow-insecure "
            "explicitly (bearer tokens would cross the wire in clear text)"
        )

    app = ServeApp(config, store=store)
    httpd = ThreadingHTTPServer((config.host, config.port), make_handler(app))
    if tls_enabled:
        context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        context.load_cert_chain(
            certfile=str(config.tls_certfile), keyfile=str(config.tls_keyfile)
        )
        httpd.socket = context.wrap_socket(httpd.socket, server_side=True)
    bound_host = str(httpd.server_address[0])
    bound_port = int(httpd.server_address[1])
    scheme = "https" if tls_enabled else "http"
    message = (
        f"serve: listening on {scheme}://{bound_host}:{bound_port} "
        f"queue={config.queue_name}"
    )
    if not app.tokens.configured:
        message += " (trigger DISABLED: RPAFORGE_SERVE_TOKEN not set)"
    if not tls_enabled and not loopback and config.allow_insecure:
        message += " (INSECURE: non-loopback bind without TLS, per --allow-insecure)"
        logger.warning(
            "Non-loopback bind without TLS allowed via --allow-insecure; "
            "bearer tokens are transmitted in clear text"
        )
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
        logger.info("Serve interrupted; shutting down")
    finally:
        httpd.server_close()
    return 0
