"""Cooperative cancellation for in-process activities (issue #863).

Subprocess dispatch enforces timeouts with hard kills, but the threading
fallback cannot stop a running thread.  This module provides the two
halves of the cooperative story:

- :class:`CancellationToken` — an asyncio-free, ``threading.Event`` based
  signal the executor publishes around every in-process/threaded activity
  invocation.  Child tokens chain to the run-scoped token so a run-level
  cancel cascades into the current activity, while a timeout-driven abort
  cancels only the activity token.
- :func:`check_cancelled` / :func:`current_cancel_token` — the opt-in seam
  for libraries.  Long-running activities call ``check_cancelled()`` in
  their polling loops; no signatures change, and libraries that never
  import the seam behave exactly as before.

The token travels to threaded fallback workers via ``contextvars``
propagation (the handler already copies the dispatch context for sandbox
policy enforcement), so cooperative checks work in both the direct
in-process path and the threaded timeout path.  Subprocess dispatch runs
in a fresh interpreter where the token is absent — hard-kill semantics
apply there and no cooperation is needed.
"""

from __future__ import annotations

import threading
import time
from contextvars import ContextVar
from contextvars import Token as ContextVarToken


class ActivityCancelledError(RuntimeError):
    """Raised inside an activity when its cancellation token fires.

    The executor translates this into :class:`StopExecution` so the run
    unwinds the same way a subprocess-level cancel does.
    """


class CooperativeTimeoutError(Exception):
    """A threaded activity timed out but exited promptly after token cancel.

    Deliberately NOT a subclass of :class:`rpaforge.core.executor.TimeoutError`
    (that module shadows the builtin): the executor catches this inside
    ``_execute_builtin_activity``, emits ``activity_cancelled``, and converts
    it to the executor's own ``TimeoutError``.  It never escapes dispatch.
    """

    def __init__(self, timeout_ms: int) -> None:
        super().__init__(f"Activity timed out after {timeout_ms}ms")
        self.timeout_ms = timeout_ms


class CancellationToken:
    """Thread-safe cancellation signal with optional parent chaining."""

    def __init__(self, parent: CancellationToken | None = None) -> None:
        self._event = threading.Event()
        self._parent = parent

    def cancel(self) -> None:
        """Signal cancellation of exactly this token (parents untouched)."""
        self._event.set()

    def cancelled(self) -> bool:
        if self._event.is_set():
            return True
        return self._parent is not None and self._parent.cancelled()

    def check(self) -> None:
        """Raise :class:`ActivityCancelledError` when cancelled."""
        if self.cancelled():
            raise ActivityCancelledError("activity cancelled")

    def wait(self, timeout: float) -> bool:
        """Block up to *timeout* seconds; ``True`` when cancelled."""
        if self._event.wait(timeout):
            return True
        return self.cancelled()

    @property
    def parent(self) -> CancellationToken | None:
        return self._parent


_cancel_token: ContextVar[CancellationToken | None] = ContextVar(
    "rpaforge_activity_cancel_token", default=None
)


def current_cancel_token() -> CancellationToken | None:
    """Return the token published for the current activity, if any."""
    return _cancel_token.get()


def check_cancelled() -> None:
    """Raise :class:`ActivityCancelledError` if the current token fired."""
    token = _cancel_token.get()
    if token is not None:
        token.check()


def cancellable_sleep(seconds: float, poll_interval: float = 0.1) -> None:
    """Sleep *seconds* in poll slices, aborting early on cancellation.

    Preserves the caller's intended sleep duration while guaranteeing a
    cancellation check at least every *poll_interval* seconds (issue #863:
    the executor grants a 1s abandon grace, so the default poll is well
    inside it).
    """
    deadline = time.monotonic() + max(seconds, 0.0)
    while True:
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            return
        check_cancelled()
        time.sleep(min(poll_interval, remaining))


def publish_cancel_token(token: CancellationToken | None) -> ContextVarToken:
    """Publish *token* for the current activity; keep the returned token.

    Pass the value to :func:`unpublish_cancel_token` in a ``finally`` to
    restore the previous state.
    """
    return _cancel_token.set(token)


def unpublish_cancel_token(var_token: ContextVarToken) -> None:
    """Restore the previous activity token (must run in the same context)."""
    _cancel_token.reset(var_token)
