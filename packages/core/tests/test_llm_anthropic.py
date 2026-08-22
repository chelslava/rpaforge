"""Tests for the Anthropic adapter (httpx.MockTransport, no network)."""

from __future__ import annotations

import json
from typing import Any

import pytest

from rpaforge.llm import (
    AnthropicClient,
    LLMAuthError,
    LLMConnectionError,
    LLMResponseError,
)

httpx = pytest.importorskip("httpx")

BASE_URL = "https://anthropic.test"
API_KEY = "sk-ant-test-key"

TOOL_USE_INPUT = {"answer": 42, "items": ["a", "b"]}


def _make_client(handler: Any, **kwargs: Any) -> AnthropicClient:
    transport = httpx.MockTransport(handler)
    defaults: dict[str, Any] = {
        "base_url": BASE_URL,
        "api_key": API_KEY,
        "timeout": 5.0,
        "transport": transport,
    }
    defaults.update(kwargs)
    return AnthropicClient(**defaults)


def _message_payload(**overrides: Any) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "id": "msg_1",
        "type": "message",
        "role": "assistant",
        "model": "claude-test",
        "content": [{"type": "text", "text": "Hi there"}],
        "stop_reason": "end_turn",
        "usage": {"input_tokens": 10, "output_tokens": 20},
    }
    payload.update(overrides)
    return payload


class TestAnthropicChat:
    """Tests for the happy-path Messages API flow."""

    def test_chat_happy_path(self) -> None:
        captured: dict[str, Any] = {}

        def handler(request: httpx.Request) -> httpx.Response:
            captured["url"] = str(request.url)
            captured["headers"] = dict(request.headers)
            captured["body"] = json.loads(request.read().decode("utf-8"))
            return httpx.Response(200, json=_message_payload())

        result = _make_client(handler).chat(
            [{"role": "user", "content": "hi"}], model="claude-test"
        )

        assert result.text == "Hi there"
        assert result.model == "claude-test"
        assert result.usage is not None
        assert result.usage.prompt_tokens == 10
        assert result.usage.completion_tokens == 20
        assert result.usage.total_tokens == 30
        assert result.truncated is False
        assert captured["url"].startswith(BASE_URL)
        assert captured["url"].endswith("/v1/messages")
        assert captured["headers"]["x-api-key"] == API_KEY
        assert captured["headers"]["anthropic-version"] == "2023-06-01"
        assert captured["body"]["model"] == "claude-test"
        assert captured["body"]["max_tokens"] == 1024
        assert "tools" not in captured["body"]

    def test_system_message_extracted_to_top_level(self) -> None:
        captured: dict[str, Any] = {}

        def handler(request: httpx.Request) -> httpx.Response:
            captured["body"] = json.loads(request.read().decode("utf-8"))
            return httpx.Response(200, json=_message_payload())

        _make_client(handler).chat(
            [
                {"role": "system", "content": "Be terse"},
                {"role": "user", "content": "hi"},
            ],
            model="claude-test",
        )

        assert captured["body"]["system"] == "Be terse"
        assert captured["body"]["messages"] == [{"role": "user", "content": "hi"}]

    def test_truncated_on_max_tokens_stop_reason(self) -> None:
        def handler(request: httpx.Request) -> httpx.Response:
            return httpx.Response(
                200,
                json=_message_payload(stop_reason="max_tokens"),
            )

        result = _make_client(handler).chat(
            [{"role": "user", "content": "hi"}], model="claude-test"
        )
        assert result.truncated is True


class TestAnthropicStructuredOutput:
    """Tests for the input_schema tool-use roundtrip."""

    def test_json_mode_forces_tool_with_input_schema(self) -> None:
        captured: dict[str, Any] = {}

        def handler(request: httpx.Request) -> httpx.Response:
            captured["body"] = json.loads(request.read().decode("utf-8"))
            return httpx.Response(
                200,
                json=_message_payload(
                    content=[
                        {
                            "type": "tool_use",
                            "id": "toolu_1",
                            "name": "emit_structured_output",
                            "input": TOOL_USE_INPUT,
                        }
                    ],
                    stop_reason="tool_use",
                ),
            )

        schema = {
            "type": "object",
            "properties": {"answer": {"type": "integer"}},
            "required": ["answer"],
        }
        result = _make_client(handler, tool_schema=schema).chat(
            [{"role": "user", "content": "give me json"}],
            model="claude-test",
            json_mode=True,
        )

        tool = captured["body"]["tools"][0]
        assert tool["name"] == "emit_structured_output"
        assert tool["input_schema"] == schema
        assert captured["body"]["tool_choice"] == {
            "type": "tool",
            "name": "emit_structured_output",
        }
        assert json.loads(result.text) == TOOL_USE_INPUT

    def test_default_tool_schema_is_generic_object(self) -> None:
        captured: dict[str, Any] = {}

        def handler(request: httpx.Request) -> httpx.Response:
            captured["body"] = json.loads(request.read().decode("utf-8"))
            return httpx.Response(
                200,
                json=_message_payload(
                    content=[
                        {
                            "type": "tool_use",
                            "id": "toolu_1",
                            "name": "emit_structured_output",
                            "input": {},
                        }
                    ]
                ),
            )

        _make_client(handler).chat(
            [{"role": "user", "content": "json please"}],
            model="claude-test",
            json_mode=True,
        )
        assert captured["body"]["tools"][0]["input_schema"] == {"type": "object"}

    def test_json_mode_without_tool_use_raises_response_error(self) -> None:
        def handler(request: httpx.Request) -> httpx.Response:
            return httpx.Response(200, json=_message_payload())

        client = _make_client(handler)
        with pytest.raises(LLMResponseError, match="no tool_use block"):
            client.chat(
                [{"role": "user", "content": "json please"}],
                model="claude-test",
                json_mode=True,
            )


class TestAnthropicErrors:
    """Tests for HTTP status and transport error mapping."""

    def test_http_401_maps_to_auth_error(self) -> None:
        def handler(request: httpx.Request) -> httpx.Response:
            return httpx.Response(401, text="invalid api key")

        client = _make_client(handler)
        with pytest.raises(LLMAuthError):
            client.chat([{"role": "user", "content": "hi"}], model="claude-test")

    def test_http_5xx_maps_to_response_error(self) -> None:
        def handler(request: httpx.Request) -> httpx.Response:
            return httpx.Response(500, text="server error")

        client = _make_client(handler)
        with pytest.raises(LLMResponseError, match="500"):
            client.chat([{"role": "user", "content": "hi"}], model="claude-test")

    def test_upstream_error_field_maps_to_response_error(self) -> None:
        def handler(request: httpx.Request) -> httpx.Response:
            return httpx.Response(
                200,
                json={"error": {"type": "invalid_request_error", "message": "bad"}},
            )

        client = _make_client(handler)
        with pytest.raises(LLMResponseError, match="bad"):
            client.chat([{"role": "user", "content": "hi"}], model="claude-test")

    def test_connect_error_maps_to_connection_error(self) -> None:
        def handler(request: httpx.Request) -> httpx.Response:
            raise httpx.ConnectError("connection refused")

        client = _make_client(handler)
        with pytest.raises(LLMConnectionError):
            client.chat([{"role": "user", "content": "hi"}], model="claude-test")

    def test_error_body_is_redacted(self) -> None:
        leaked = f"key {API_KEY} invalid"

        def handler(request: httpx.Request) -> httpx.Response:
            return httpx.Response(500, text=leaked)

        client = _make_client(handler)
        with pytest.raises(LLMResponseError) as excinfo:
            client.chat([{"role": "user", "content": "hi"}], model="claude-test")
        assert API_KEY not in str(excinfo.value)
