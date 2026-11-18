"""Retry, backoff, ``Retry-After`` and cancellation tests (issue #901).

All HTTP interactions run through ``httpx.MockTransport`` — no network.
Backoff sleeps are intercepted by a recording sleeper so tests are both
instant and deterministic about the delays the retry layer computes.
"""

from __future__ import annotations

import json
import threading
import time
from email.utils import formatdate
from io import StringIO
from typing import Any

import pytest

from rpaforge.core.cancellation import (
    ActivityCancelledError,
    CancellationToken,
    publish_cancel_token,
    unpublish_cancel_token,
)
from rpaforge.llm import (
    DEFAULT_LLM_MAX_ATTEMPTS,
    DEFAULT_LLM_RETRY_BUDGET_S,
    DEFAULT_LLM_TIMEOUT_S,
    AnthropicClient,
    LLMAuthError,
    LLMConfig,
    LLMConnectionError,
    LLMResponseError,
    OpenAICompatClient,
    RetryPolicy,
    create_client,
)
from rpaforge.llm._retry import parse_retry_after
from rpaforge.runner.logging import EventLogger

httpx = pytest.importorskip("httpx")

BASE_URL = "https://gateway.test/v1"
API_KEY = "sk-retry-test-key"

RETRY_ENV_VARS = (
    "RPAFORGE_LLM_MAX_ATTEMPTS",
    "RPAFORGE_LLM_TIMEOUT_S",
    "RPAFORGE_LLM_RETRY_BUDGET_S",
)


@pytest.fixture(autouse=True)
def _clear_retry_env(monkeypatch: pytest.MonkeyPatch) -> None:
    for name in RETRY_ENV_VARS:
        monkeypatch.delenv(name, raising=False)


def _completion_payload() -> dict[str, Any]:
    return {
        "model": "gpt-test",
        "choices": [
            {
                "message": {"role": "assistant", "content": "Hello there"},
                "finish_reason": "stop",
            }
        ],
        "usage": {"prompt_tokens": 5, "completion_tokens": 7, "total_tokens": 12},
    }


def _anthropic_payload() -> dict[str, Any]:
    return {
        "model": "claude-test",
        "content": [{"type": "text", "text": "Hi"}],
        "stop_reason": "end_turn",
        "usage": {"input_tokens": 4, "output_tokens": 6},
    }


class _ScriptedTransport:
    """MockTransport handler serving a scripted response sequence.

    Each script entry is either an ``httpx.Response`` or an exception
    instance raised as a transport failure. When the script runs dry the
    last entry repeats, so one-entry scripts model "always this".
    """

    def __init__(self, *responses: httpx.Response | Exception) -> None:
        self._responses = list(responses)
        self.requests: list[httpx.Request] = []

    def __call__(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(request)
        index = min(len(self.requests) - 1, len(self._responses) - 1)
        item = self._responses[index]
        if isinstance(item, Exception):
            raise item
        return item

    @property
    def call_count(self) -> int:
        return len(self.requests)


def _make_client(
    transport: _ScriptedTransport,
    sleeps: list[float] | None = None,
    **kwargs: Any,
) -> OpenAICompatClient:
    defaults: dict[str, Any] = {
        "base_url": BASE_URL,
        "api_key": API_KEY,
        "timeout": 5.0,
        "retry_sleep": sleeps.append if sleeps is not None else (lambda _s: None),
    }
    defaults.update(kwargs)
    return OpenAICompatClient(transport=httpx.MockTransport(transport), **defaults)


class TestParseRetryAfter:
    """Unit tests for ``Retry-After`` header parsing."""

    def test_delta_seconds(self) -> None:
        assert parse_retry_after("120") == 120.0
        assert parse_retry_after(" 2.5 ") == 2.5

    def test_http_date(self) -> None:
        stamp = formatdate(time.time() + 30, usegmt=True)
        assert parse_retry_after(stamp) == pytest.approx(30.0, abs=1.0)

    def test_date_in_past_clamps_to_zero(self) -> None:
        stamp = formatdate(time.time() - 60, usegmt=True)
        assert parse_retry_after(stamp) == 0.0

    def test_garbage_and_empty_yield_none(self) -> None:
        assert parse_retry_after("soon") is None
        assert parse_retry_after("") is None
        assert parse_retry_after(None) is None

    def test_non_finite_values_yield_none(self) -> None:
        assert parse_retry_after("nan") is None
        assert parse_retry_after("inf") is None
        assert parse_retry_after("-inf") is None


class TestRetryAfterHonored:
    """``Retry-After`` on 429/503 upgrades the computed backoff delay."""

    def test_retry_after_seconds_on_429_then_success(self) -> None:
        transport = _ScriptedTransport(
            httpx.Response(429, headers={"Retry-After": "2"}, text="slow down"),
            httpx.Response(200, json=_completion_payload()),
        )
        sleeps: list[float] = []
        result = _make_client(transport, sleeps, max_attempts=3).chat(
            [{"role": "user", "content": "hi"}], model="gpt-test"
        )
        assert result.text == "Hello there"
        assert transport.call_count == 2
        assert sleeps == [2.0]

    def test_retry_after_http_date_on_503_then_success(self) -> None:
        stamp = formatdate(time.time() + 3, usegmt=True)
        transport = _ScriptedTransport(
            httpx.Response(503, headers={"Retry-After": stamp}, text="overloaded"),
            httpx.Response(200, json=_completion_payload()),
        )
        sleeps: list[float] = []
        _make_client(transport, sleeps, max_attempts=3).chat(
            [{"role": "user", "content": "hi"}], model="gpt-test"
        )
        assert transport.call_count == 2
        assert len(sleeps) == 1
        assert 2.0 <= sleeps[0] <= 3.0

    def test_anthropic_honors_retry_after(self) -> None:
        transport = _ScriptedTransport(
            httpx.Response(429, headers={"Retry-After": "1"}, text="rate limited"),
            httpx.Response(200, json=_anthropic_payload()),
        )
        sleeps: list[float] = []
        client = AnthropicClient(
            base_url="https://anthropic.test",
            api_key=API_KEY,
            timeout=5.0,
            transport=httpx.MockTransport(transport),
            max_attempts=3,
            retry_sleep=sleeps.append,
        )
        result = client.chat([{"role": "user", "content": "hi"}], model="claude-test")
        assert result.text == "Hi"
        assert transport.call_count == 2
        assert sleeps == [1.0]


class TestRetryBehavior:
    """Backoff shape, attempt caps, budgets and connection-error retries."""

    @pytest.mark.parametrize("status", [429, 502, 503, 504])
    def test_transient_status_retried_then_succeeds(self, status: int) -> None:
        transport = _ScriptedTransport(
            httpx.Response(status, text=f"error {status}"),
            httpx.Response(200, json=_completion_payload()),
        )
        sleeps: list[float] = []
        result = _make_client(transport, sleeps, max_attempts=3).chat(
            [{"role": "user", "content": "hi"}], model="gpt-test"
        )
        assert result.text == "Hello there"
        assert transport.call_count == 2
        assert len(sleeps) == 1
        assert 0.0 <= sleeps[0] <= 0.5

    def test_exhausted_429_raises_typed_response_error(self) -> None:
        transport = _ScriptedTransport(httpx.Response(429, text="rate limited"))
        with pytest.raises(LLMResponseError, match="429"):
            _make_client(transport, max_attempts=2).chat(
                [{"role": "user", "content": "hi"}], model="gpt-test"
            )
        assert transport.call_count == 2

    def test_max_attempts_one_disables_retries(self) -> None:
        transport = _ScriptedTransport(httpx.Response(429, text="rate limited"))
        sleeps: list[float] = []
        with pytest.raises(LLMResponseError, match="429"):
            _make_client(transport, sleeps, max_attempts=1).chat(
                [{"role": "user", "content": "hi"}], model="gpt-test"
            )
        assert transport.call_count == 1
        assert sleeps == []

    def test_total_budget_stops_retrying(self) -> None:
        transport = _ScriptedTransport(
            httpx.Response(429, headers={"Retry-After": "30"}, text="rate limited")
        )
        sleeps: list[float] = []
        with pytest.raises(LLMResponseError, match="429"):
            _make_client(
                transport,
                sleeps,
                retry_policy=RetryPolicy(max_attempts=10, total_budget_s=0.05),
            ).chat([{"role": "user", "content": "hi"}], model="gpt-test")
        assert transport.call_count == 1
        assert sleeps == []

    def test_connection_error_retried_then_succeeds(self) -> None:
        transport = _ScriptedTransport(
            httpx.ConnectError("connection refused"),
            httpx.ConnectError("connection refused"),
            httpx.Response(200, json=_completion_payload()),
        )
        result = _make_client(transport, max_attempts=3).chat(
            [{"role": "user", "content": "hi"}], model="gpt-test"
        )
        assert result.text == "Hello there"
        assert transport.call_count == 3

    def test_connection_error_exhaustion_raises_connection_error(self) -> None:
        transport = _ScriptedTransport(httpx.ConnectError("connection refused"))
        with pytest.raises(LLMConnectionError, match="Could not reach"):
            _make_client(transport, max_attempts=2).chat(
                [{"role": "user", "content": "hi"}], model="gpt-test"
            )
        assert transport.call_count == 2

    def test_timeout_retried_then_raises_connection_error(self) -> None:
        transport = _ScriptedTransport(httpx.ReadTimeout("timed out"))
        with pytest.raises(LLMConnectionError, match="timed out"):
            _make_client(transport, max_attempts=2).chat(
                [{"role": "user", "content": "hi"}], model="gpt-test"
            )
        assert transport.call_count == 2


class TestNoRetryFailFast:
    """Auth/validation 4xx and plain 500 fail fast — one attempt only."""

    def test_auth_401_not_retried(self) -> None:
        transport = _ScriptedTransport(httpx.Response(401, text="bad key"))
        with pytest.raises(LLMAuthError):
            _make_client(transport, max_attempts=5).chat(
                [{"role": "user", "content": "hi"}], model="gpt-test"
            )
        assert transport.call_count == 1

    @pytest.mark.parametrize("status", [400, 404, 422])
    def test_validation_4xx_not_retried(self, status: int) -> None:
        transport = _ScriptedTransport(httpx.Response(status, text=f"error {status}"))
        with pytest.raises(LLMResponseError, match=str(status)):
            _make_client(transport, max_attempts=5).chat(
                [{"role": "user", "content": "hi"}], model="gpt-test"
            )
        assert transport.call_count == 1

    def test_plain_500_not_retried(self) -> None:
        transport = _ScriptedTransport(httpx.Response(500, text="bug"))
        with pytest.raises(LLMResponseError, match="500"):
            _make_client(transport, max_attempts=5).chat(
                [{"role": "user", "content": "hi"}], model="gpt-test"
            )
        assert transport.call_count == 1


class TestUsageEventRetryFields:
    """``llm_usage`` events expose attempts/retry_count (issue #901)."""

    def test_event_reports_attempts_and_retry_count(self) -> None:
        transport = _ScriptedTransport(
            httpx.Response(429, headers={"Retry-After": "1"}, text="rate limited"),
            httpx.Response(200, json=_completion_payload()),
        )
        stream = StringIO()
        _make_client(
            transport,
            event_logger=EventLogger(stream, ndjson=True),
            max_attempts=3,
        ).chat([{"role": "user", "content": "hi"}], model="gpt-test")

        event = json.loads(stream.getvalue().strip())
        assert event["attempts"] == 2
        assert event["retry_count"] == 1

    def test_event_happy_path_keeps_legacy_fields(self) -> None:
        transport = _ScriptedTransport(httpx.Response(200, json=_completion_payload()))
        stream = StringIO()
        _make_client(transport, event_logger=EventLogger(stream, ndjson=True)).chat(
            [{"role": "user", "content": "hi"}], model="gpt-test"
        )

        event = json.loads(stream.getvalue().strip())
        assert event["attempts"] == 1
        assert event["retry_count"] == 0
        assert event["provider"] == "openai-compatible"
        assert event["prompt_tokens"] == 5
        assert event["total_tokens"] == 12
        assert isinstance(event["duration_ms"], int)


class TestCancellation:
    """Cooperative cancellation aborts in-flight calls (issues #863/#901)."""

    def test_cancelled_token_aborts_before_first_attempt(self) -> None:
        transport = _ScriptedTransport(httpx.Response(200, json=_completion_payload()))
        token = CancellationToken()
        token.cancel()
        with pytest.raises(ActivityCancelledError):
            _make_client(transport, cancel_token=token).chat(
                [{"role": "user", "content": "hi"}], model="gpt-test"
            )
        assert transport.call_count == 0

    def test_cancel_during_backoff_aborts_without_orphaned_threads(self) -> None:
        transport = _ScriptedTransport(httpx.Response(429, text="rate limited"))
        token = CancellationToken()
        threads_before = threading.active_count()

        def canceller() -> None:
            time.sleep(0.2)
            token.cancel()

        thread = threading.Thread(target=canceller)
        thread.start()
        started = time.monotonic()
        try:
            with pytest.raises(ActivityCancelledError):
                _make_client(
                    transport,
                    retry_policy=RetryPolicy(max_attempts=10, initial_backoff_s=3.0),
                    cancel_token=token,
                    retry_sleep=None,
                ).chat([{"role": "user", "content": "hi"}], model="gpt-test")
        finally:
            thread.join()
        elapsed = time.monotonic() - started
        assert elapsed < 2.0
        assert threading.active_count() == threads_before

    def test_ambient_contextvar_token_cancels_during_backoff(self) -> None:
        transport = _ScriptedTransport(httpx.Response(429, text="rate limited"))
        token = CancellationToken()

        def canceller() -> None:
            time.sleep(0.2)
            token.cancel()

        thread = threading.Thread(target=canceller)
        thread.start()
        started = time.monotonic()
        var_token = publish_cancel_token(token)
        try:
            with pytest.raises(ActivityCancelledError):
                _make_client(
                    transport,
                    retry_policy=RetryPolicy(max_attempts=10, initial_backoff_s=3.0),
                    retry_sleep=None,
                ).chat([{"role": "user", "content": "hi"}], model="gpt-test")
        finally:
            unpublish_cancel_token(var_token)
            thread.join()
        assert time.monotonic() - started < 2.0


class TestRetryConfiguration:
    """Env-driven timeout/attempt/budget resolution and policy wiring."""

    def test_env_vars_flow_through_create_client(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.delenv("RPAFORGE_LLM_BASE_URL", raising=False)
        monkeypatch.setenv("RPAFORGE_LLM_PROVIDER", "openai")
        monkeypatch.setenv("RPAFORGE_LLM_TIMEOUT_S", "7.5")
        monkeypatch.setenv("RPAFORGE_LLM_MAX_ATTEMPTS", "5")
        monkeypatch.setenv("RPAFORGE_LLM_RETRY_BUDGET_S", "42")
        client = create_client()
        assert isinstance(client, OpenAICompatClient)
        assert client._timeout == 7.5
        assert client._retry_policy.max_attempts == 5
        assert client._retry_policy.total_budget_s == 42

    def test_explicit_config_fields_forwarded_to_adapter(self) -> None:
        client = create_client(
            LLMConfig(
                provider="openai",
                base_url=BASE_URL,
                timeout_s=9.0,
                max_attempts=6,
                retry_budget_s=33.0,
            )
        )
        assert isinstance(client, OpenAICompatClient)
        assert client._timeout == 9.0
        assert client._retry_policy.max_attempts == 6
        assert client._retry_policy.total_budget_s == 33.0

    def test_invalid_env_falls_back_to_defaults(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.setenv("RPAFORGE_LLM_TIMEOUT_S", "not-a-number")
        monkeypatch.setenv("RPAFORGE_LLM_MAX_ATTEMPTS", "zero")
        monkeypatch.setenv("RPAFORGE_LLM_RETRY_BUDGET_S", "")
        client = OpenAICompatClient(
            base_url=BASE_URL,
            transport=httpx.MockTransport(
                lambda _r: httpx.Response(200, json=_completion_payload())
            ),
        )
        assert client._timeout == DEFAULT_LLM_TIMEOUT_S
        assert client._retry_policy.max_attempts == DEFAULT_LLM_MAX_ATTEMPTS
        assert client._retry_policy.total_budget_s == DEFAULT_LLM_RETRY_BUDGET_S

    def test_explicit_constructor_args_beat_env(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.setenv("RPAFORGE_LLM_MAX_ATTEMPTS", "9")
        client = OpenAICompatClient(
            base_url=BASE_URL,
            max_attempts=2,
            transport=httpx.MockTransport(
                lambda _r: httpx.Response(200, json=_completion_payload())
            ),
        )
        assert client._retry_policy.max_attempts == 2

    def test_explicit_policy_wins_over_env(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.setenv("RPAFORGE_LLM_MAX_ATTEMPTS", "9")
        policy = RetryPolicy(max_attempts=4, total_budget_s=17.0)
        client = OpenAICompatClient(
            base_url=BASE_URL,
            retry_policy=policy,
            transport=httpx.MockTransport(
                lambda _r: httpx.Response(200, json=_completion_payload())
            ),
        )
        assert client._retry_policy is policy

    def test_invalid_explicit_values_raise(self) -> None:
        with pytest.raises(ValueError):
            RetryPolicy(max_attempts=0)
        with pytest.raises(ValueError):
            RetryPolicy(total_budget_s=0.0)
        with pytest.raises(ValueError):
            OpenAICompatClient(base_url=BASE_URL, max_attempts=0)

    def test_streaming_performs_single_attempt_on_429(self) -> None:
        transport = _ScriptedTransport(httpx.Response(429, text="rate limited"))
        with pytest.raises(LLMResponseError, match="429"):
            _make_client(transport, max_attempts=5).chat_stream(
                [{"role": "user", "content": "hi"}],
                model="gpt-test",
                on_delta=lambda _piece: None,
            )
        assert transport.call_count == 1
