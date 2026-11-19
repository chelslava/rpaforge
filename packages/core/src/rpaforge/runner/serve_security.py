"""Security primitives for the ``serve`` control plane (issue #908).

Token registry with optional scopes and mtime hot-reload, plus a
per-source-IP failure-rate limiter for auth endpoints. Built on the
stdlib only, mirroring the runner's dependency posture:

- **Tokens:** ``RPAFORGE_SERVE_TOKEN`` (single admin token) and/or a
  ``--token-file`` with one entry per line, ``TOKEN[:SCOPE]`` where
  scope is ``admin`` | ``trigger`` | ``read``. A bare entry (no scope)
  is admin — backward compatible with the pre-#908 single token.
- **Scopes:** ``read`` covers the observation surface (runs, queues,
  schedules GETs); ``trigger`` covers ``POST /trigger``; ``admin``
  covers everything (cancel, requeue, schedule mutations, and implies
  read/trigger).
- **Rotation:** the token file's ``(mtime_ns, size)`` signature is
  re-checked per authorization, so rotated tokens are picked up
  without a restart (same pattern as the schedules hot-reload).
- **Rate limiting:** token bucket per source IP counting auth
  failures only; exhausted buckets answer 429 + ``Retry-After``
  before the auth check, successful auths reset the bucket. Legit
  clients at normal rates are unaffected.
"""

from __future__ import annotations

import hmac
import logging
import threading
import time
from collections import OrderedDict
from collections.abc import Callable
from pathlib import Path

logger = logging.getLogger("rpaforge.runner.serve_security")

#: Full access: observation + triggers + mutations.
SCOPE_ADMIN = "admin"

#: Observation surface (``GET /runs*``, ``GET /queues/*/items``, ``GET /schedules``).
SCOPE_READ = "read"

#: Run triggering (``POST /trigger``).
SCOPE_TRIGGER = "trigger"

#: Scopes accepted in ``token-file`` entries.
ALLOWED_SCOPES = (SCOPE_ADMIN, SCOPE_TRIGGER, SCOPE_READ)

#: Scope implied by every other scope.
_IMPLIED: dict[str, frozenset[str]] = {
    SCOPE_ADMIN: frozenset({SCOPE_ADMIN, SCOPE_TRIGGER, SCOPE_READ}),
    SCOPE_TRIGGER: frozenset({SCOPE_TRIGGER, SCOPE_READ}),
    SCOPE_READ: frozenset({SCOPE_READ}),
}

#: Maximum tracked client IPs (bounded memory; evicts least-recently seen).
_MAX_TRACKED_IPS = 10_000


class TokenConfigError(ValueError):
    """Raised for malformed token-file contents."""


class TokenRegistry:
    """Scoped bearer tokens with optional ``--token-file`` hot-reload.

    The static token (``RPAFORGE_SERVE_TOKEN``, admin) is always kept;
    ``reload_if_changed`` replaces only the file-derived entries.
    """

    def __init__(
        self,
        token: str | None = None,
        token_file: Path | str | None = None,
    ) -> None:
        self._lock = threading.Lock()
        self._file = Path(str(token_file)) if token_file is not None else None
        self._signature: tuple[int, int] | None = None
        self._static: dict[str, str] = {token: SCOPE_ADMIN} if token else {}
        self._file_entries: dict[str, str] = {}
        if self._file is not None:
            # Constructor: a malformed file fails fast (fail-closed startup).
            self._file_entries = self._parse_file()
            self._signature = self._current_signature()

    @property
    def configured(self) -> bool:
        """Whether at least one token is registered (auth enabled)."""
        with self._lock:
            return bool(self._static or self._file_entries)

    def lookup(self, provided: str) -> str | None:
        """Scope for *provided*, or ``None`` when no entry matches."""
        self.reload_if_changed()
        with self._lock:
            for entries in (self._static, self._file_entries):
                for candidate, scope in entries.items():
                    if hmac.compare_digest(provided, candidate):
                        return scope
        return None

    def allows(self, provided_scope: str, required_scope: str) -> bool:
        """Whether a token with *provided_scope* may call a *required_scope* endpoint."""
        return required_scope in _IMPLIED.get(
            provided_scope, frozenset({provided_scope})
        )

    def reload_if_changed(self) -> None:
        """Re-read the token file when its ``(mtime_ns, size)`` signature changed.

        Runtime parsing errors keep the last-good entries (a rotated-in
        broken file must not brick the control plane); the signature is
        still advanced so the bad file is parsed once per change.
        """
        if self._file is None:
            return
        signature = self._current_signature()
        if signature is None:
            return
        with self._lock:
            if signature == self._signature:
                return
            self._signature = signature
            try:
                self._file_entries = self._parse_file()
            except TokenConfigError as exc:
                logger.warning(
                    "token-file reload failed; keeping previous entries: %s",
                    exc,
                )

    def _current_signature(self) -> tuple[int, int] | None:
        """The token file's ``(mtime_ns, size)``, or ``None`` if unreadable."""
        if self._file is None:
            return None
        try:
            stat = self._file.stat()
        except OSError:
            return None
        return (stat.st_mtime_ns, stat.st_size)

    def _parse_file(self) -> dict[str, str]:
        """Parse the token file into a fresh ``token -> scope`` mapping."""
        assert self._file is not None
        try:
            text = self._file.read_text(encoding="utf-8")
        except OSError as exc:
            raise TokenConfigError(f"cannot read token file: {exc}") from exc
        entries: dict[str, str] = {}
        for line_number, raw in enumerate(text.splitlines(), start=1):
            entry = raw.strip()
            if not entry or entry.startswith("#"):
                continue
            if ":" in entry:
                value, _, scope = entry.partition(":")
                scope = scope.strip().lower()
                value = value.strip()
                if scope not in ALLOWED_SCOPES:
                    raise TokenConfigError(
                        f"token file line {line_number}: unknown scope "
                        f"{scope!r} (expected one of {list(ALLOWED_SCOPES)})"
                    )
            else:
                value, scope = entry, SCOPE_ADMIN
            if not value:
                raise TokenConfigError(
                    f"token file line {line_number}: empty token value"
                )
            entries[value] = scope
        return entries


class AuthRateLimiter:
    """Token bucket over auth failures, keyed by client IP.

    Every failed authorization consumes one bucket token; a request
    arriving at an empty bucket is answered 429 with a ``Retry-After``
    derived from the refill rate. Successful authorization resets the
    bucket, so a legitimate client that occasionally mistypes its token
    is never throttled.
    """

    def __init__(
        self,
        max_failures: int = 10,
        refill_per_minute: float = 5.0,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        self._capacity = float(max(1, max_failures))
        self._refill_per_second = max(0.01, refill_per_minute) / 60.0
        self._clock = clock
        self._lock = threading.Lock()
        self._buckets: OrderedDict[str, tuple[float, float]] = OrderedDict()

    def consume_failure(self, client_ip: str) -> tuple[bool, float]:
        """Register one auth failure; returns ``(allowed, retry_after_seconds)``.

        ``allowed`` is ``False`` when the bucket is exhausted — the caller
        must answer 429 with the given ``Retry-After`` instead of 401.
        """
        now = self._clock()
        with self._lock:
            tokens, last = self._buckets.get(client_ip, (self._capacity, now))
            tokens = min(
                self._capacity, tokens + (now - last) * self._refill_per_second
            )
            allowed = tokens >= 1.0
            if allowed:
                tokens -= 1.0
            retry_after = 0.0 if allowed else (1.0 - tokens) / self._refill_per_second
            self._buckets[client_ip] = (tokens, now)
            self._buckets.move_to_end(client_ip)
            while len(self._buckets) > _MAX_TRACKED_IPS:
                self._buckets.popitem(last=False)
            return allowed, retry_after

    def reset(self, client_ip: str) -> None:
        """Forget failures for *client_ip* (call after a successful auth)."""
        with self._lock:
            self._buckets.pop(client_ip, None)
