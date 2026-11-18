"""Retry/backoff machinery shared by the LLM adapters (issue #901).

Wraps a single HTTP attempt with exponential backoff and full jitter,
honours ``Retry-After`` on retryable statuses (429/502/503/504), retries
transport-level failures (:class:`LLMConnectionError`), and aborts both
between attempts and mid-backoff when a cooperative-cancellation token
(:mod:`rpaforge.core.cancellation`, issue #863) fires. Every other 4xx
(auth, validation) and unrecognized 5xx surfaces immediately so the
adapters' typed errors fail fast.

Applied to the non-streaming ``chat()`` path of every adapter. The
streaming ``chat_stream()`` path deliberately performs a single attempt:
partial output may already have reached the ``on_delta`` callback, and a
replay would duplicate emitted text.
"""

from __future__ import annotations

import logging
import math
import random
import time
from collections.abc import Callable
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from typing import TYPE_CHECKING

from rpaforge.llm.client import LLMConnectionError, RetryPolicy

if TYPE_CHECKING:
    import httpx

    from rpaforge.core.cancellation import CancellationToken

__all__ = ["RETRYABLE_STATUSES", "parse_retry_after", "run_with_retries"]

logger = logging.getLogger(__name__)

#: HTTP statuses worth retrying: rate limiting plus transient gateway
#: failures. Plain 500s are excluded — they usually signal a
#: non-transient server bug rather than congestion.
RETRYABLE_STATUSES = frozenset({429, 502, 503, 504})

_SLEEP_POLL_S = 0.1


def parse_retry_after(value: str | None, *, now: float | None = None) -> float | None:
    """Parse a ``Retry-After`` header value into seconds.

    Accepts both delta-seconds (``"120"``) and HTTP-date forms; anything
    unparseable yields ``None`` so the caller falls back to backoff. A
    date in the past clamps to ``0.0``.
    """
    if value is None or not value.strip():
        return None
    text = value.strip()
    try:
        seconds = float(text)
    except ValueError:
        seconds = None
    if seconds is not None:
        if not math.isfinite(seconds):
            return None
        return max(seconds, 0.0)
    try:
        when = parsedate_to_datetime(text)
    except (TypeError, ValueError):
        return None
    if when.tzinfo is None:
        when = when.replace(tzinfo=timezone.utc)
    reference = now if now is not None else datetime.now(timezone.utc).timestamp()
    return max(when.timestamp() - reference, 0.0)


def _backoff_delay(
    policy: RetryPolicy, failed_attempts: int, rng: Callable[[], float]
) -> float:
    """Compute a full-jitter exponential backoff delay in seconds."""
    ceiling = min(
        policy.initial_backoff_s * (policy.backoff_factor ** (failed_attempts - 1)),
        policy.max_backoff_s,
    )
    return rng() * ceiling


def _check_cancelled(cancel_token: CancellationToken | None) -> None:
    from rpaforge.core.cancellation import check_cancelled

    check_cancelled()
    if cancel_token is not None:
        cancel_token.check()


def _default_sleep(cancel_token: CancellationToken | None) -> Callable[[float], None]:
    """Build the cancellation-aware sleeper used between attempts."""
    from rpaforge.core.cancellation import cancellable_sleep

    def sleep(seconds: float) -> None:
        if cancel_token is None:
            cancellable_sleep(seconds)
            return
        deadline = time.monotonic() + max(seconds, 0.0)
        while True:
            _check_cancelled(cancel_token)
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                return
            time.sleep(min(_SLEEP_POLL_S, remaining))

    return sleep


def run_with_retries(
    attempt: Callable[[], httpx.Response],
    *,
    policy: RetryPolicy,
    cancel_token: CancellationToken | None = None,
    sleep: Callable[[float], None] | None = None,
    rng: Callable[[], float] = random.random,
) -> tuple[httpx.Response, int]:
    """Run *attempt* until it succeeds, is non-retryable, or budget ends.

    Returns the final response together with the number of attempts
    performed. Transport failures re-raise the last
    :class:`LLMConnectionError` once the attempt cap or the total time
    budget is exhausted; retryable HTTP statuses are returned as-is so
    the adapter maps them through its typed error hierarchy. Raises
    :class:`~rpaforge.core.cancellation.ActivityCancelledError` when a
    cooperative-cancellation token fires before an attempt or during
    backoff.
    """
    if sleep is None:
        sleep = _default_sleep(cancel_token)
    started = time.monotonic()
    attempts = 0
    response: httpx.Response | None = None
    last_error: LLMConnectionError | None = None
    while True:
        _check_cancelled(cancel_token)
        attempts += 1
        try:
            response = attempt()
            last_error = None
        except LLMConnectionError as exc:
            last_error = exc
            response = None
        if response is not None and response.status_code not in RETRYABLE_STATUSES:
            return response, attempts
        if attempts >= policy.max_attempts:
            break
        retry_after = (
            parse_retry_after(response.headers.get("Retry-After"))
            if response is not None
            else None
        )
        delay = _backoff_delay(policy, attempts, rng)
        if retry_after is not None:
            delay = max(delay, retry_after)
        remaining_budget = policy.total_budget_s - (time.monotonic() - started)
        if delay >= remaining_budget:
            logger.debug(
                "LLM retry budget exhausted after %d attempt(s); giving up.",
                attempts,
            )
            break
        logger.debug(
            "LLM attempt %d failed (HTTP %s); retrying in %.3fs.",
            attempts,
            response.status_code if response is not None else "connection error",
            delay,
        )
        sleep(delay)
    if last_error is not None:
        raise last_error
    assert response is not None
    return response, attempts
