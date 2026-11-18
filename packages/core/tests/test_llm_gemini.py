"""Tests for the Gemini OpenAI-compat adapter (issue #901).

Mirrors the canned-transport suites of the other adapters
(httpx.MockTransport, no network): happy path, json mode, error mapping,
retry behaviour and streaming.
"""

from __future__ import annotations

import json
from io import StringIO
from typing import Any

import pytest

from rpaforge.llm import (
    DEFAULT_PROVIDER_BASE_URLS,
    GEMINI_DEFAULT_BASE_URL,
    GeminiClient,
    LLMAuthError,
    LLMConfig,
    LLMConnectionError,
    LLMResponseError,
    create_client,
)
from rpaforge.runner.logging import EventLogger

httpx = pytest.importorskip("httpx")

API_KEY = "gemini-test-key"


def _completion_payload(**overrides: Any) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "id": "chatcmpl-gemini-1",
        "object": "chat.completion",
        "model": "gemini-2.0-flash",
        "choices": [
            {
                "index": 0,
                "message": {"role": "assistant", "content": "Hello from Gemini"},
                "finish_reason": "stop",
            }
        ],
        "usage": {
            "prompt_tokens": 9,
            "completion_tokens": 4,
            "total_tokens": 13,
        },
    }
    payload.update(overrides)
    return payload


def _make_client(handler: Any, **kwargs: Any) -> GeminiClient:
    defaults: dict[str, Any] = {
        "api_key": API_KEY,
        "timeout": 5.0,
        "transport": httpx.MockTransport(handler),
        "retry_sleep": lambda _s: None,
    }
    defaults.update(kwargs)
    return GeminiClient(**defaults)


class TestGeminiDefaultsAndFactory:
    """Default endpoint wiring and factory routing."""

    def test_default_base_url_points_at_openai_compat_surface(self) -> None:
        client = _make_client(lambda _r: httpx.Response(200, json={}))
        assert client._base_url == GEMINI_DEFAULT_BASE_URL
        assert client._base_url.endswith("/v1beta/openai")

    def test_provider_table_contains_gemini(self) -> None:
        assert DEFAULT_PROVIDER_BASE_URLS["gemini"] == GEMINI_DEFAULT_BASE_URL

    def test_create_client_builds_gemini_adapter(self) -> None:
        client = create_client(
            LLMConfig(
                provider="gemini",
                base_url=GEMINI_DEFAULT_BASE_URL,
                api_key=API_KEY,
            )
        )
        assert isinstance(client, GeminiClient)

    def test_resolve_llm_config_defaults_for_gemini(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        from rpaforge.llm import resolve_llm_config

        for name in (
            "RPAFORGE_LLM_BASE_URL",
            "RPAFORGE_LLM_MAX_ATTEMPTS",
            "RPAFORGE_LLM_TIMEOUT_S",
            "RPAFORGE_LLM_RETRY_BUDGET_S",
        ):
            monkeypatch.delenv(name, raising=False)
        config = resolve_llm_config(provider="gemini")
        assert config.base_url == GEMINI_DEFAULT_BASE_URL


class TestGeminiChat:
    """The canned-transport chat suite against the Gemini surface."""

    def test_chat_happy_path_hits_compat_endpoint(self) -> None:
        captured: dict[str, Any] = {}

        def handler(request: httpx.Request) -> httpx.Response:
            captured["url"] = str(request.url)
            captured["headers"] = dict(request.headers)
            captured["body"] = json.loads(request.read().decode("utf-8"))
            return httpx.Response(200, json=_completion_payload())

        result = _make_client(handler).chat(
            [{"role": "user", "content": "hi"}], model="gemini-2.0-flash"
        )

        assert result.text == "Hello from Gemini"
        assert result.model == "gemini-2.0-flash"
        assert result.usage is not None
        assert result.usage.total_tokens == 13
        assert result.truncated is False
        assert captured["url"] == f"{GEMINI_DEFAULT_BASE_URL}/chat/completions"
        assert captured["headers"]["authorization"] == f"Bearer {API_KEY}"
        assert captured["body"]["model"] == "gemini-2.0-flash"
        assert captured["body"]["messages"] == [{"role": "user", "content": "hi"}]

    def test_json_mode_sends_response_format(self) -> None:
        captured: dict[str, Any] = {}

        def handler(request: httpx.Request) -> httpx.Response:
            captured["body"] = json.loads(request.read().decode("utf-8"))
            return httpx.Response(200, json=_completion_payload())

        _make_client(handler).chat(
            [{"role": "user", "content": "hi"}],
            model="gemini-2.0-flash",
            json_mode=True,
        )
        assert captured["body"]["response_format"] == {"type": "json_object"}

    def test_truncated_on_length_finish_reason(self) -> None:
        def handler(request: httpx.Request) -> httpx.Response:
            return httpx.Response(
                200,
                json=_completion_payload(
                    choices=[
                        {
                            "index": 0,
                            "message": {
                                "role": "assistant",
                                "content": "partial",
                            },
                            "finish_reason": "length",
                        }
                    ]
                ),
            )

        result = _make_client(handler).chat(
            [{"role": "user", "content": "hi"}], model="gemini-2.0-flash"
        )
        assert result.truncated is True

    def test_usage_event_reports_gemini_provider(self) -> None:
        stream = StringIO()
        _make_client(
            lambda _r: httpx.Response(200, json=_completion_payload()),
            event_logger=EventLogger(stream, ndjson=True),
        ).chat([{"role": "user", "content": "hi"}], model="gemini-2.0-flash")

        event = json.loads(stream.getvalue().strip())
        assert event["event"] == "llm_usage"
        assert event["provider"] == "gemini"
        assert event["prompt_tokens"] == 9
        assert event["attempts"] == 1
        assert event["retry_count"] == 0


class TestGeminiErrors:
    """Typed error mapping matches the shared adapter contract."""

    def test_http_401_maps_to_auth_error(self) -> None:
        client = _make_client(lambda _r: httpx.Response(401, text="bad key"))
        with pytest.raises(LLMAuthError):
            client.chat([{"role": "user", "content": "hi"}], model="gemini-2.0-flash")

    def test_http_400_maps_to_response_error(self) -> None:
        client = _make_client(lambda _r: httpx.Response(400, text="bad request"))
        with pytest.raises(LLMResponseError, match="400"):
            client.chat([{"role": "user", "content": "hi"}], model="gemini-2.0-flash")

    def test_connect_error_maps_to_connection_error(self) -> None:
        def handler(request: httpx.Request) -> httpx.Response:
            raise httpx.ConnectError("connection refused")

        client = _make_client(handler, max_attempts=1)
        with pytest.raises(LLMConnectionError, match="Could not reach"):
            client.chat([{"role": "user", "content": "hi"}], model="gemini-2.0-flash")


class TestGeminiRetries:
    """Retry behaviour is identical to the other adapters."""

    def test_429_with_retry_after_then_success(self) -> None:
        calls: list[int] = []
        sleeps: list[float] = []

        def handler(request: httpx.Request) -> httpx.Response:
            calls.append(1)
            if len(calls) == 1:
                return httpx.Response(
                    429, headers={"Retry-After": "2"}, text="rate limited"
                )
            return httpx.Response(200, json=_completion_payload())

        stream = StringIO()
        result = _make_client(
            handler,
            max_attempts=3,
            retry_sleep=sleeps.append,
            event_logger=EventLogger(stream, ndjson=True),
        ).chat([{"role": "user", "content": "hi"}], model="gemini-2.0-flash")

        assert result.text == "Hello from Gemini"
        assert len(calls) == 2
        assert sleeps == [2.0]
        event = json.loads(stream.getvalue().strip())
        assert event["attempts"] == 2
        assert event["retry_count"] == 1


class TestGeminiStreaming:
    """Streaming rides the OpenAI SSE protocol unchanged."""

    def test_chat_stream_consumes_sse(self) -> None:
        body = (
            f"data: {json.dumps({'model': 'gemini-2.0-flash', 'choices': [{'delta': {'content': 'Hel'}}]})}\n\n"
            f"data: {json.dumps({'choices': [{'delta': {'content': 'lo'}}]})}\n\n"
            f"data: {json.dumps({'choices': [{'finish_reason': 'stop'}], 'usage': {'prompt_tokens': 3, 'completion_tokens': 2, 'total_tokens': 5}})}\n\n"
            "data: [DONE]\n\n"
        ).encode()
        pieces: list[str] = []
        result = _make_client(lambda _r: httpx.Response(200, content=body)).chat_stream(
            [{"role": "user", "content": "hi"}],
            model="gemini-2.0-flash",
            on_delta=pieces.append,
        )
        assert result.text == "Hello"
        assert pieces == ["Hel", "lo"]
        assert result.usage is not None
        assert result.usage.total_tokens == 5
