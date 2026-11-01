"""Tests for SSE streaming in the LLM adapters (httpx.MockTransport, no network).

Streaming results must be indistinguishable from the non-streaming path:
same text, same token accounting, same error hierarchy (issue #820).
"""

from __future__ import annotations

import json
from typing import Any

import pytest

from rpaforge.llm import (
    AnthropicClient,
    LLMAuthError,
    LLMConnectionError,
    LLMResponseError,
    OpenAICompatClient,
)

httpx = pytest.importorskip("httpx")

OPENAI_BASE_URL = "https://gateway.test/v1"
ANTHROPIC_BASE_URL = "https://anthropic.test"
API_KEY = "sk-stream-test-key"


class DeltaRecorder:
    """Delta handler collecting every incremental text piece."""

    def __init__(self) -> None:
        self.pieces: list[str] = []

    def __call__(self, piece: str) -> None:
        self.pieces.append(piece)


def _sse(*events: str) -> bytes:
    """Join complete SSE events (already line-formatted) into a body."""
    return "".join(f"{event}\n\n" for event in events).encode("utf-8")


def _openai_data(chunk: dict[str, Any]) -> str:
    return f"data: {json.dumps(chunk)}"


def _anthropic_event(name: str, chunk: dict[str, Any]) -> str:
    return f"event: {name}\ndata: {json.dumps(chunk)}"


def _make_openai(handler: Any, **kwargs: Any) -> OpenAICompatClient:
    defaults: dict[str, Any] = {
        "base_url": OPENAI_BASE_URL,
        "api_key": API_KEY,
        "timeout": 5.0,
        "transport": httpx.MockTransport(handler),
    }
    defaults.update(kwargs)
    return OpenAICompatClient(**defaults)


def _make_anthropic(handler: Any, **kwargs: Any) -> AnthropicClient:
    defaults: dict[str, Any] = {
        "base_url": ANTHROPIC_BASE_URL,
        "api_key": API_KEY,
        "timeout": 5.0,
        "transport": httpx.MockTransport(handler),
    }
    defaults.update(kwargs)
    return AnthropicClient(**defaults)


class TestOpenAIStreaming:
    """Streaming path of the OpenAI-compatible adapter."""

    def test_stream_happy_path_matches_non_streaming(self) -> None:
        captured: dict[str, Any] = {}

        def handler(request: httpx.Request) -> httpx.Response:
            captured["body"] = json.loads(request.read().decode("utf-8"))
            captured["url"] = str(request.url)
            body = _sse(
                _openai_data(
                    {
                        "id": "c1",
                        "model": "gpt-test",
                        "choices": [{"index": 0, "delta": {"role": "assistant"}}],
                    }
                ),
                _openai_data(
                    {
                        "id": "c1",
                        "model": "gpt-test",
                        "choices": [{"index": 0, "delta": {"content": "Hel"}}],
                    }
                ),
                _openai_data(
                    {
                        "id": "c1",
                        "model": "gpt-test",
                        "choices": [
                            {
                                "index": 0,
                                "delta": {"content": "lo"},
                                "finish_reason": "stop",
                            }
                        ],
                    }
                ),
                _openai_data(
                    {
                        "id": "c1",
                        "model": "gpt-test",
                        "choices": [],
                        "usage": {
                            "prompt_tokens": 5,
                            "completion_tokens": 7,
                            "total_tokens": 12,
                        },
                    }
                ),
                "data: [DONE]",
            )
            return httpx.Response(200, content=body)

        recorder = DeltaRecorder()
        result = _make_openai(handler).chat_stream(
            [{"role": "user", "content": "hi"}],
            model="gpt-test",
            on_delta=recorder,
        )

        assert result.text == "Hello"
        assert result.model == "gpt-test"
        assert result.truncated is False
        assert result.usage is not None
        assert result.usage.prompt_tokens == 5
        assert result.usage.completion_tokens == 7
        assert result.usage.total_tokens == 12
        assert recorder.pieces == ["Hel", "lo"]
        assert captured["url"].endswith("/chat/completions")
        assert captured["body"]["stream"] is True
        assert captured["body"]["stream_options"] == {"include_usage": True}

    def test_stream_truncated_on_length_finish_reason(self) -> None:
        body = _sse(
            _openai_data(
                {
                    "model": "gpt-test",
                    "choices": [
                        {
                            "index": 0,
                            "delta": {"content": "partial"},
                            "finish_reason": "length",
                        }
                    ],
                }
            ),
            "data: [DONE]",
        )
        result = _make_openai(
            lambda _request: httpx.Response(200, content=body)
        ).chat_stream(
            [{"role": "user", "content": "hi"}],
            model="gpt-test",
            on_delta=DeltaRecorder(),
        )
        assert result.text == "partial"
        assert result.truncated is True

    def test_stream_without_usage_chunk_defaults_to_zero(self) -> None:
        body = _sse(
            _openai_data(
                {
                    "model": "gpt-test",
                    "choices": [
                        {"index": 0, "delta": {"content": "x"}, "finish_reason": "stop"}
                    ],
                }
            ),
            "data: [DONE]",
        )
        result = _make_openai(
            lambda _request: httpx.Response(200, content=body)
        ).chat_stream(
            [{"role": "user", "content": "hi"}],
            model="gpt-test",
            on_delta=DeltaRecorder(),
        )
        assert result.usage is not None
        assert result.usage.total_tokens == 0

    def test_stream_json_mode_sends_response_format(self) -> None:
        captured: dict[str, Any] = {}

        def handler(request: httpx.Request) -> httpx.Response:
            captured["body"] = json.loads(request.read().decode("utf-8"))
            body = _sse(
                _openai_data(
                    {
                        "model": "gpt-test",
                        "choices": [
                            {
                                "index": 0,
                                "delta": {"content": "{}"},
                                "finish_reason": "stop",
                            }
                        ],
                    }
                ),
                "data: [DONE]",
            )
            return httpx.Response(200, content=body)

        result = _make_openai(handler).chat_stream(
            [{"role": "user", "content": "hi"}],
            model="gpt-test",
            json_mode=True,
            on_delta=DeltaRecorder(),
        )
        assert result.text == "{}"
        assert captured["body"]["response_format"] == {"type": "json_object"}

    def test_stream_auth_error(self) -> None:
        with pytest.raises(LLMAuthError):
            _make_openai(lambda _request: httpx.Response(401, json={})).chat_stream(
                [{"role": "user", "content": "hi"}],
                model="gpt-test",
                on_delta=DeltaRecorder(),
            )

    def test_stream_http_error(self) -> None:
        with pytest.raises(LLMResponseError, match="HTTP 500"):
            _make_openai(
                lambda _request: httpx.Response(
                    500, json={"error": {"message": "boom"}}
                )
            ).chat_stream(
                [{"role": "user", "content": "hi"}],
                model="gpt-test",
                on_delta=DeltaRecorder(),
            )

    def test_stream_malformed_chunk(self) -> None:
        body = _sse("data: not-json", "data: [DONE]")
        with pytest.raises(LLMResponseError, match="malformed SSE"):
            _make_openai(
                lambda _request: httpx.Response(200, content=body)
            ).chat_stream(
                [{"role": "user", "content": "hi"}],
                model="gpt-test",
                on_delta=DeltaRecorder(),
            )

    def test_stream_without_content_raises(self) -> None:
        body = _sse(
            _openai_data(
                {
                    "model": "gpt-test",
                    "choices": [{"index": 0, "delta": {}, "finish_reason": "stop"}],
                }
            ),
            "data: [DONE]",
        )
        with pytest.raises(LLMResponseError, match="no message content"):
            _make_openai(
                lambda _request: httpx.Response(200, content=body)
            ).chat_stream(
                [{"role": "user", "content": "hi"}],
                model="gpt-test",
                on_delta=DeltaRecorder(),
            )

    def test_stream_connection_error(self) -> None:
        def handler(request: httpx.Request) -> httpx.Response:
            raise httpx.ConnectError("refused")

        with pytest.raises(LLMConnectionError):
            _make_openai(handler).chat_stream(
                [{"role": "user", "content": "hi"}],
                model="gpt-test",
                on_delta=DeltaRecorder(),
            )

    def test_stream_emits_usage_event(self) -> None:
        class Recorder:
            def __init__(self) -> None:
                self.events: list[tuple[str, dict[str, Any]]] = []

            def emit(self, event_name: str, **kwargs: Any) -> None:
                self.events.append((event_name, kwargs))

        body = _sse(
            _openai_data(
                {
                    "model": "gpt-test",
                    "choices": [
                        {"index": 0, "delta": {"content": "x"}, "finish_reason": "stop"}
                    ],
                }
            ),
            _openai_data(
                {
                    "choices": [],
                    "usage": {
                        "prompt_tokens": 2,
                        "completion_tokens": 3,
                        "total_tokens": 5,
                    },
                }
            ),
            "data: [DONE]",
        )
        logger = Recorder()
        result = _make_openai(
            lambda _request: httpx.Response(200, content=body), event_logger=logger
        ).chat_stream(
            [{"role": "user", "content": "hi"}],
            model="gpt-test",
            on_delta=DeltaRecorder(),
        )
        assert result.usage is not None
        assert logger.events == [
            (
                "llm_usage",
                {
                    "provider": "openai-compatible",
                    "model": "gpt-test",
                    "prompt_tokens": 2,
                    "completion_tokens": 3,
                    "total_tokens": 5,
                    "duration_ms": logger.events[0][1]["duration_ms"],
                },
            )
        ]


class TestAnthropicStreaming:
    """Streaming path of the Anthropic Messages adapter."""

    def test_stream_text_matches_non_streaming(self) -> None:
        captured: dict[str, Any] = {}

        def handler(request: httpx.Request) -> httpx.Response:
            captured["body"] = json.loads(request.read().decode("utf-8"))
            captured["url"] = str(request.url)
            body = _sse(
                _anthropic_event(
                    "message_start",
                    {
                        "type": "message_start",
                        "message": {
                            "type": "message",
                            "role": "assistant",
                            "model": "claude-test",
                            "usage": {"input_tokens": 5},
                        },
                    },
                ),
                _anthropic_event(
                    "content_block_start",
                    {
                        "type": "content_block_start",
                        "index": 0,
                        "content_block": {"type": "text", "text": ""},
                    },
                ),
                _anthropic_event(
                    "content_block_delta",
                    {
                        "type": "content_block_delta",
                        "index": 0,
                        "delta": {"type": "text_delta", "text": "Hel"},
                    },
                ),
                _anthropic_event(
                    "content_block_delta",
                    {
                        "type": "content_block_delta",
                        "index": 0,
                        "delta": {"type": "text_delta", "text": "lo"},
                    },
                ),
                _anthropic_event(
                    "message_delta",
                    {
                        "type": "message_delta",
                        "delta": {"stop_reason": "end_turn", "stop_sequence": None},
                        "usage": {"output_tokens": 7},
                    },
                ),
                _anthropic_event("message_stop", {"type": "message_stop"}),
            )
            return httpx.Response(200, content=body)

        recorder = DeltaRecorder()
        result = _make_anthropic(handler).chat_stream(
            [{"role": "user", "content": "hi"}],
            model="claude-test",
            on_delta=recorder,
        )

        assert result.text == "Hello"
        assert result.model == "claude-test"
        assert result.truncated is False
        assert result.usage is not None
        assert result.usage.prompt_tokens == 5
        assert result.usage.completion_tokens == 7
        assert result.usage.total_tokens == 12
        assert recorder.pieces == ["Hel", "lo"]
        assert captured["url"].endswith("/v1/messages")
        assert captured["body"]["stream"] is True

    def test_stream_json_mode_assembles_tool_input(self) -> None:
        body = _sse(
            _anthropic_event(
                "message_start",
                {
                    "type": "message_start",
                    "message": {"model": "claude-test", "usage": {"input_tokens": 9}},
                },
            ),
            _anthropic_event(
                "content_block_start",
                {
                    "type": "content_block_start",
                    "index": 0,
                    "content_block": {
                        "type": "tool_use",
                        "id": "toolu_1",
                        "name": "emit_structured_output",
                    },
                },
            ),
            _anthropic_event(
                "content_block_delta",
                {
                    "type": "content_block_delta",
                    "index": 0,
                    "delta": {
                        "type": "input_json_delta",
                        "partial_json": '{"answer": ',
                    },
                },
            ),
            _anthropic_event(
                "content_block_delta",
                {
                    "type": "content_block_delta",
                    "index": 0,
                    "delta": {"type": "input_json_delta", "partial_json": "42}"},
                },
            ),
            _anthropic_event(
                "message_delta",
                {
                    "type": "message_delta",
                    "delta": {"stop_reason": "end_turn", "stop_sequence": None},
                    "usage": {"output_tokens": 11},
                },
            ),
            _anthropic_event("message_stop", {"type": "message_stop"}),
        )
        recorder = DeltaRecorder()
        result = _make_anthropic(
            lambda _request: httpx.Response(200, content=body)
        ).chat_stream(
            [{"role": "user", "content": "hi"}],
            model="claude-test",
            json_mode=True,
            on_delta=recorder,
        )
        assert result.text == '{"answer": 42}'
        assert json.loads(result.text) == {"answer": 42}
        assert recorder.pieces == ['{"answer": ', "42}"]
        assert result.usage is not None
        assert result.usage.total_tokens == 20

    def test_stream_json_mode_without_tool_use_raises(self) -> None:
        body = _sse(
            _anthropic_event(
                "message_start",
                {"type": "message_start", "message": {"model": "claude-test"}},
            ),
            _anthropic_event(
                "content_block_delta",
                {
                    "type": "content_block_delta",
                    "index": 0,
                    "delta": {"type": "text_delta", "text": "plain"},
                },
            ),
            _anthropic_event("message_stop", {"type": "message_stop"}),
        )
        with pytest.raises(LLMResponseError, match="no tool_use block"):
            _make_anthropic(
                lambda _request: httpx.Response(200, content=body)
            ).chat_stream(
                [{"role": "user", "content": "hi"}],
                model="claude-test",
                json_mode=True,
                on_delta=DeltaRecorder(),
            )

    def test_stream_truncated_on_max_tokens_stop_reason(self) -> None:
        body = _sse(
            _anthropic_event(
                "content_block_delta",
                {
                    "type": "content_block_delta",
                    "index": 0,
                    "delta": {"type": "text_delta", "text": "cut"},
                },
            ),
            _anthropic_event(
                "message_delta",
                {
                    "type": "message_delta",
                    "delta": {"stop_reason": "max_tokens", "stop_sequence": None},
                    "usage": {"output_tokens": 4},
                },
            ),
            _anthropic_event("message_stop", {"type": "message_stop"}),
        )
        result = _make_anthropic(
            lambda _request: httpx.Response(200, content=body)
        ).chat_stream(
            [{"role": "user", "content": "hi"}],
            model="claude-test",
            on_delta=DeltaRecorder(),
        )
        assert result.text == "cut"
        assert result.truncated is True

    def test_stream_without_text_raises(self) -> None:
        body = _sse(
            _anthropic_event(
                "message_start",
                {"type": "message_start", "message": {"model": "claude-test"}},
            ),
            _anthropic_event("message_stop", {"type": "message_stop"}),
        )
        with pytest.raises(LLMResponseError, match="no text content"):
            _make_anthropic(
                lambda _request: httpx.Response(200, content=body)
            ).chat_stream(
                [{"role": "user", "content": "hi"}],
                model="claude-test",
                on_delta=DeltaRecorder(),
            )

    def test_stream_auth_error(self) -> None:
        with pytest.raises(LLMAuthError):
            _make_anthropic(lambda _request: httpx.Response(401, json={})).chat_stream(
                [{"role": "user", "content": "hi"}],
                model="claude-test",
                on_delta=DeltaRecorder(),
            )

    def test_stream_http_error(self) -> None:
        with pytest.raises(LLMResponseError, match="HTTP 529"):
            _make_anthropic(
                lambda _request: httpx.Response(
                    529, json={"error": {"message": "overloaded"}}
                )
            ).chat_stream(
                [{"role": "user", "content": "hi"}],
                model="claude-test",
                on_delta=DeltaRecorder(),
            )

    def test_stream_malformed_event(self) -> None:
        body = _sse("event: broken\ndata: {{{", "data: [not-json]")
        with pytest.raises(LLMResponseError, match="malformed SSE"):
            _make_anthropic(
                lambda _request: httpx.Response(200, content=body)
            ).chat_stream(
                [{"role": "user", "content": "hi"}],
                model="claude-test",
                on_delta=DeltaRecorder(),
            )

    def test_stream_connection_error(self) -> None:
        def handler(request: httpx.Request) -> httpx.Response:
            raise httpx.ReadError("reset")

        with pytest.raises(LLMConnectionError):
            _make_anthropic(handler).chat_stream(
                [{"role": "user", "content": "hi"}],
                model="claude-test",
                on_delta=DeltaRecorder(),
            )


class TestSSEParser:
    """Wire-format corner cases of the shared SSE parser."""

    def test_crlf_line_endings_and_multiline_data(self) -> None:
        from rpaforge.llm._stream import iter_sse_events

        body = b"event: alpha\r\ndata: line1\r\ndata: line2\r\n\r\ndata: last"
        response = httpx.Response(200, content=body)
        events = list(iter_sse_events(response))
        assert events == [("alpha", "line1\nline2"), (None, "last")]

    def test_comment_lines_are_ignored(self) -> None:
        from rpaforge.llm._stream import iter_sse_events

        body = b": keep-alive\ndata: {\n\n"
        response = httpx.Response(200, content=body)
        assert list(iter_sse_events(response)) == [(None, "{")]
