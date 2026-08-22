"""Tests for token-usage logging and API-key redaction in rpaforge.llm."""

from __future__ import annotations

import json
import logging
from io import StringIO
from typing import Any

import pytest

from rpaforge.llm import (
    REDACTED_PLACEHOLDER,
    USAGE_EVENT,
    AnthropicClient,
    OpenAICompatClient,
    SecretRedactionFilter,
    redact_secrets,
)
from rpaforge.runner.logging import EventLogger

httpx = pytest.importorskip("httpx")

API_KEY = "sk-redact-test-key-9876"

ADAPTER_LOGGER_NAMES = (
    "rpaforge.llm.openai_compat",
    "rpaforge.llm.anthropic",
)


@pytest.fixture(autouse=True)
def _isolate_adapter_loggers() -> Any:
    """Snapshot and restore filters/handlers on the adapter loggers."""
    saved: dict[logging.Logger, tuple[list[Any], list[Any]]] = {}
    for name in ADAPTER_LOGGER_NAMES:
        logger = logging.getLogger(name)
        saved[logger] = (list(logger.filters), list(logger.handlers))
    yield
    for logger, (filters, handlers) in saved.items():
        logger.filters[:] = filters
        logger.handlers[:] = handlers


def _completion_payload() -> dict[str, Any]:
    return {
        "model": "gpt-test",
        "choices": [
            {
                "message": {"role": "assistant", "content": "Hello"},
                "finish_reason": "stop",
            }
        ],
        "usage": {"prompt_tokens": 11, "completion_tokens": 22, "total_tokens": 33},
    }


def _run_openai_chat(event_logger: EventLogger) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json=_completion_payload())

    client = OpenAICompatClient(
        base_url="https://gateway.test/v1",
        api_key=API_KEY,
        transport=httpx.MockTransport(handler),
        event_logger=event_logger,
    )
    client.chat([{"role": "user", "content": "hi"}], model="gpt-test")


class TestTokenUsageEventLogging:
    """Tests for usage events following the runner EventLogger conventions."""

    def test_usage_event_emitted_as_ndjson(self) -> None:
        stream = StringIO()
        _run_openai_chat(EventLogger(stream, ndjson=True))

        lines = [line for line in stream.getvalue().splitlines() if line.strip()]
        assert len(lines) == 1
        event = json.loads(lines[0])
        assert event["event"] == USAGE_EVENT == "llm_usage"
        assert event["provider"] == "openai-compatible"
        assert event["model"] == "gpt-test"
        assert event["prompt_tokens"] == 11
        assert event["completion_tokens"] == 22
        assert event["total_tokens"] == 33
        assert isinstance(event["duration_ms"], int)

    def test_ndjson_output_never_contains_api_key(self) -> None:
        stream = StringIO()
        _run_openai_chat(EventLogger(stream, ndjson=True))
        assert API_KEY not in stream.getvalue()

    def test_human_mode_fallback_includes_token_fields(self) -> None:
        stream = StringIO()
        _run_openai_chat(EventLogger(stream, ndjson=False))
        assert "llm_usage" in stream.getvalue()
        assert "prompt_tokens" in stream.getvalue()

    def test_anthropic_usage_event_fields(self) -> None:
        def handler(request: httpx.Request) -> httpx.Response:
            return httpx.Response(
                200,
                json={
                    "model": "claude-test",
                    "content": [{"type": "text", "text": "Hi"}],
                    "stop_reason": "end_turn",
                    "usage": {"input_tokens": 4, "output_tokens": 6},
                },
            )

        stream = StringIO()
        client = AnthropicClient(
            base_url="https://anthropic.test",
            transport=httpx.MockTransport(handler),
            event_logger=EventLogger(stream, ndjson=True),
        )
        client.chat([{"role": "user", "content": "hi"}], model="claude-test")

        event = json.loads(stream.getvalue().strip())
        assert event["event"] == "llm_usage"
        assert event["provider"] == "anthropic"
        assert event["total_tokens"] == 10


class TestSecretRedactionFilter:
    """Tests for the standalone redaction mechanism."""

    def test_redact_secrets_helper(self) -> None:
        assert (
            redact_secrets("Bearer sk-123 ok", ("sk-123",))
            == f"Bearer {REDACTED_PLACEHOLDER} ok"
        )
        assert redact_secrets("untouched", ()) == "untouched"
        assert redact_secrets("aXb", ("X",)) == f"a{REDACTED_PLACEHOLDER}b"

    def test_filter_scrubs_formatted_message(self) -> None:
        record = logging.LogRecord(
            "test",
            logging.ERROR,
            __file__,
            1,
            "failed with %s",
            ("sk-secret-value",),
            None,
        )
        assert SecretRedactionFilter("sk-secret-value").filter(record) is True
        assert record.getMessage() == f"failed with {REDACTED_PLACEHOLDER}"

    def test_filter_scrubs_cached_exception_text(self) -> None:
        record = logging.LogRecord(
            "test",
            logging.ERROR,
            __file__,
            1,
            "boom",
            None,
            None,
        )
        record.exc_text = "Traceback: key sk-exc-secret leaked"
        SecretRedactionFilter("sk-exc-secret").filter(record)
        assert "sk-exc-secret" not in record.exc_text


class TestApiKeyNeverRenderedInLogs:
    """End-to-end proof that the API key never reaches any log record."""

    def test_adapter_registers_key_and_records_are_scrubbed(self) -> None:
        logger = logging.getLogger("rpaforge.llm.anthropic")
        logger.setLevel(logging.DEBUG)
        stream = StringIO()
        handler = logging.StreamHandler(stream)
        logger.addHandler(handler)
        try:
            _register_anthropic_client()
            logger.info("using key %s inline %s", API_KEY, API_KEY)
            try:
                raise ValueError(f"upstream exploded with {API_KEY}")
            except ValueError as exc:
                logger.exception("request failed: %s", exc)
        finally:
            logger.removeHandler(handler)

        rendered = stream.getvalue()
        assert rendered.count(REDACTED_PLACEHOLDER) >= 3
        assert API_KEY not in rendered
        assert "ValueError" in rendered

    def test_openai_adapter_registers_key_on_module_logger(self) -> None:
        logger = logging.getLogger("rpaforge.llm.openai_compat")
        _register_openai_client()
        registered = [
            filt
            for filt in logger.filters
            if isinstance(filt, SecretRedactionFilter)
            and API_KEY in getattr(filt, "_secrets", [])
        ]
        assert len(registered) == 1

    def test_no_filter_attached_without_api_key(self) -> None:
        logger = logging.getLogger("rpaforge.llm.openai_compat")
        before = len(logger.filters)
        _register_openai_client(api_key="")
        assert len(logger.filters) == before


def _register_openai_client(api_key: str = API_KEY) -> OpenAICompatClient:
    transport = httpx.MockTransport(lambda _request: httpx.Response(200, json={}))
    return OpenAICompatClient(api_key=api_key, transport=transport)


def _register_anthropic_client() -> AnthropicClient:
    return AnthropicClient(api_key=API_KEY)
