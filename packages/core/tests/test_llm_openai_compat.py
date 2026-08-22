"""Tests for the OpenAI-compatible adapter (httpx.MockTransport, no network)."""

from __future__ import annotations

import json
from typing import Any

import pytest

from rpaforge.llm import (
    DEFAULT_MAX_TOKENS,
    LLMAuthError,
    LLMConnectionError,
    LLMResponseError,
    OpenAICompatClient,
)

httpx = pytest.importorskip("httpx")

BASE_URL = "https://gateway.test/v1"
API_KEY = "sk-openai-test-key"


def _make_client(handler: Any, **kwargs: Any) -> OpenAICompatClient:
    transport = httpx.MockTransport(handler)
    defaults: dict[str, Any] = {
        "base_url": BASE_URL,
        "api_key": API_KEY,
        "timeout": 5.0,
        "transport": transport,
    }
    defaults.update(kwargs)
    return OpenAICompatClient(**defaults)


def _completion_payload(**overrides: Any) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "id": "chatcmpl-1",
        "object": "chat.completion",
        "model": "gpt-test",
        "choices": [
            {
                "index": 0,
                "message": {"role": "assistant", "content": "Hello there"},
                "finish_reason": "stop",
            }
        ],
        "usage": {"prompt_tokens": 5, "completion_tokens": 7, "total_tokens": 12},
    }
    payload.update(overrides)
    return payload


class TestOpenAICompatChat:
    """Tests for the happy-path chat completion flow."""

    def test_chat_completion_happy_path(self) -> None:
        captured: dict[str, Any] = {}

        def handler(request: httpx.Request) -> httpx.Response:
            captured["url"] = str(request.url)
            captured["headers"] = dict(request.headers)
            captured["body"] = json.loads(request.read().decode("utf-8"))
            return httpx.Response(200, json=_completion_payload())

        result = _make_client(handler).chat(
            [{"role": "user", "content": "hi"}], model="gpt-test"
        )

        assert result.text == "Hello there"
        assert result.model == "gpt-test"
        assert result.usage is not None
        assert result.usage.prompt_tokens == 5
        assert result.usage.completion_tokens == 7
        assert result.usage.total_tokens == 12
        assert result.truncated is False
        assert captured["url"].startswith(BASE_URL)
        assert captured["url"].endswith("/chat/completions")
        assert captured["body"]["model"] == "gpt-test"
        assert captured["body"]["max_tokens"] == DEFAULT_MAX_TOKENS
        assert captured["body"]["messages"] == [{"role": "user", "content": "hi"}]
        assert "response_format" not in captured["body"]
        assert captured["headers"]["authorization"] == f"Bearer {API_KEY}"

    def test_json_mode_sends_response_format(self) -> None:
        captured: dict[str, Any] = {}

        def handler(request: httpx.Request) -> httpx.Response:
            captured["body"] = json.loads(request.read().decode("utf-8"))
            return httpx.Response(200, json=_completion_payload())

        _make_client(handler).chat(
            [{"role": "user", "content": "hi"}], model="gpt-test", json_mode=True
        )

        assert captured["body"]["response_format"] == {"type": "json_object"}

    def test_max_tokens_passthrough(self) -> None:
        captured: dict[str, Any] = {}

        def handler(request: httpx.Request) -> httpx.Response:
            captured["body"] = json.loads(request.read().decode("utf-8"))
            return httpx.Response(200, json=_completion_payload())

        _make_client(handler).chat(
            [{"role": "user", "content": "hi"}], model="gpt-test", max_tokens=77
        )

        assert captured["body"]["max_tokens"] == 77

    def test_truncated_on_length_finish_reason(self) -> None:
        def handler(request: httpx.Request) -> httpx.Response:
            return httpx.Response(
                200,
                json=_completion_payload(
                    choices=[
                        {
                            "index": 0,
                            "message": {"role": "assistant", "content": "partial"},
                            "finish_reason": "length",
                        }
                    ]
                ),
            )

        result = _make_client(handler).chat(
            [{"role": "user", "content": "hi"}], model="gpt-test"
        )
        assert result.truncated is True

    def test_no_auth_header_without_api_key(self) -> None:
        captured: dict[str, Any] = {}

        def handler(request: httpx.Request) -> httpx.Response:
            captured["headers"] = dict(request.headers)
            return httpx.Response(200, json=_completion_payload())

        _make_client(handler, api_key="").chat(
            [{"role": "user", "content": "hi"}], model="gpt-test"
        )
        assert "authorization" not in captured["headers"]

    def test_error_snippet_is_redacted(self) -> None:
        leaked_body = f"bad key {API_KEY} rejected"

        def handler(request: httpx.Request) -> httpx.Response:
            return httpx.Response(400, text=leaked_body)

        with pytest.raises(LLMResponseError) as excinfo:
            _make_client(handler).chat(
                [{"role": "user", "content": "hi"}], model="gpt-test"
            )
        assert API_KEY not in str(excinfo.value)


class TestOpenAICompatErrors:
    """Tests for HTTP status and transport error mapping."""

    @staticmethod
    def _status_handler(status_code: int) -> Any:
        def handler(request: httpx.Request) -> httpx.Response:
            return httpx.Response(status_code, text=f"error {status_code}")

        return handler

    def test_http_401_maps_to_auth_error(self) -> None:
        client = _make_client(self._status_handler(401))
        with pytest.raises(LLMAuthError):
            client.chat([{"role": "user", "content": "hi"}], model="gpt-test")

    def test_http_4xx_maps_to_response_error(self) -> None:
        client = _make_client(self._status_handler(400))
        with pytest.raises(LLMResponseError, match="400"):
            client.chat([{"role": "user", "content": "hi"}], model="gpt-test")

    def test_http_5xx_maps_to_response_error(self) -> None:
        client = _make_client(self._status_handler(500))
        with pytest.raises(LLMResponseError, match="500"):
            client.chat([{"role": "user", "content": "hi"}], model="gpt-test")

    def test_upstream_error_field_in_200_maps_to_response_error(self) -> None:
        def handler(request: httpx.Request) -> httpx.Response:
            return httpx.Response(
                200,
                json={"error": {"code": "server_error", "message": "overloaded"}},
            )

        client = _make_client(handler)
        with pytest.raises(LLMResponseError, match="overloaded"):
            client.chat([{"role": "user", "content": "hi"}], model="gpt-test")

    def test_empty_choices_maps_to_response_error(self) -> None:
        def handler(request: httpx.Request) -> httpx.Response:
            return httpx.Response(200, json={"choices": []})

        client = _make_client(handler)
        with pytest.raises(LLMResponseError, match="no message content"):
            client.chat([{"role": "user", "content": "hi"}], model="gpt-test")

    def test_non_json_body_maps_to_response_error(self) -> None:
        def handler(request: httpx.Request) -> httpx.Response:
            return httpx.Response(200, text="<html>not json</html>")

        client = _make_client(handler)
        with pytest.raises(LLMResponseError, match="non-JSON"):
            client.chat([{"role": "user", "content": "hi"}], model="gpt-test")

    def test_connect_error_maps_to_connection_error(self) -> None:
        def handler(request: httpx.Request) -> httpx.Response:
            raise httpx.ConnectError("connection refused")

        client = _make_client(handler)
        with pytest.raises(LLMConnectionError, match="Could not reach"):
            client.chat([{"role": "user", "content": "hi"}], model="gpt-test")

    def test_timeout_maps_to_connection_error(self) -> None:
        def handler(request: httpx.Request) -> httpx.Response:
            raise httpx.ReadTimeout("timed out")

        client = _make_client(handler)
        with pytest.raises(LLMConnectionError, match="timed out"):
            client.chat([{"role": "user", "content": "hi"}], model="gpt-test")
