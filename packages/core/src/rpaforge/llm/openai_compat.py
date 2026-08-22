"""OpenAI-compatible chat adapter built directly on ``httpx`` (no SDK).

Works against OpenAI, Ollama (``http://localhost:11434/v1``), vLLM, or any
other OpenAI-compatible gateway. Structured output uses
``response_format: {"type": "json_object"}`` rather than strict JSON schema
mode: many compatible servers do not fully support strict enforcement.
"""

from __future__ import annotations

import logging
import time
from collections.abc import Sequence
from typing import TYPE_CHECKING, Any

from rpaforge.llm._redact import SecretRedactionFilter, redact_secrets
from rpaforge.llm.client import (
    DEFAULT_MAX_TOKENS,
    LLMAuthError,
    LLMConnectionError,
    LLMResponseError,
    LLMResult,
    Message,
    TokenUsage,
    load_httpx,
    log_usage,
)

if TYPE_CHECKING:
    import httpx

    from rpaforge.llm.client import UsageEventLogger

__all__ = ["OpenAICompatClient"]

#: HTTP status that maps to :class:`LLMAuthError`; every other non-2xx
#: status maps to :class:`LLMResponseError`.
_AUTH_STATUS = 401


class OpenAICompatClient:
    """Synchronous chat client for OpenAI-compatible endpoints."""

    def __init__(
        self,
        base_url: str = "https://api.openai.com/v1",
        api_key: str = "",
        timeout: float = 120.0,
        transport: httpx.BaseTransport | None = None,
        event_logger: UsageEventLogger | None = None,
    ) -> None:
        """Configure the endpoint.

        ``transport`` accepts an ``httpx.BaseTransport`` (e.g.
        ``httpx.MockTransport``) for testing without any network access.
        Raises an actionable :class:`LLMError` immediately when the optional
        ``httpx`` dependency is missing.
        """
        self._httpx = load_httpx()
        self._base_url = base_url.rstrip("/")
        self._api_key = api_key
        self._timeout = timeout
        self._transport = transport
        self._event_logger = event_logger
        self._redact_filter = SecretRedactionFilter(api_key)
        if api_key:
            self._redact_filter.attach(logging.getLogger(__name__))

    def chat(
        self,
        messages: Sequence[Message],
        *,
        model: str,
        json_mode: bool = False,
        max_tokens: int = DEFAULT_MAX_TOKENS,
    ) -> LLMResult:
        """Run one ``POST {base_url}/chat/completions`` request."""
        payload: dict[str, Any] = {
            "model": model,
            "messages": [dict(message) for message in messages],
            "max_tokens": max_tokens,
        }
        if json_mode:
            payload["response_format"] = {"type": "json_object"}
        started = time.monotonic()
        response = self._send(payload)
        duration_ms = int((time.monotonic() - started) * 1000)
        result = self._parse(model, response)
        log_usage(
            self._event_logger,
            provider="openai-compatible",
            model=model,
            usage=result.usage,
            duration_ms=duration_ms,
        )
        return result

    def _headers(self) -> dict[str, str]:
        headers = {}
        if self._api_key:
            headers["Authorization"] = f"Bearer {self._api_key}"
        return headers

    def _send(self, payload: dict[str, Any]) -> httpx.Response:
        url = f"{self._base_url}/chat/completions"
        try:
            with self._httpx.Client(
                timeout=self._timeout, transport=self._transport
            ) as client:
                response = client.post(url, json=payload, headers=self._headers())
        except self._httpx.TimeoutException as exc:
            raise LLMConnectionError(
                f"LLM request timed out after {self._timeout:g}s."
            ) from exc
        except self._httpx.TransportError as exc:
            raise LLMConnectionError(
                f"Could not reach LLM endpoint '{url}': {self._safe(str(exc))}"
            ) from exc
        if response.status_code == _AUTH_STATUS:
            raise LLMAuthError(
                f"LLM endpoint rejected the API key (HTTP {_AUTH_STATUS})."
            )
        if response.status_code >= 400:
            raise LLMResponseError(
                f"LLM request failed (HTTP {response.status_code}): "
                f"{self._safe(response.text[:500])}"
            )
        return response

    def _parse(self, model: str, response: httpx.Response) -> LLMResult:
        try:
            data = response.json()
        except ValueError as exc:
            raise LLMResponseError("LLM endpoint returned a non-JSON body.") from exc
        if not isinstance(data, dict):
            raise LLMResponseError("LLM endpoint returned an unexpected payload.")
        error = data.get("error")
        if isinstance(error, dict) and error.get("message"):
            code = error.get("code", "unknown")
            raise LLMResponseError(
                f"LLM upstream error (code {code}): {self._safe(str(error['message']))}"
            )

        choices = data.get("choices") or []
        content = choices[0].get("message", {}).get("content") if choices else None
        if not content:
            raise LLMResponseError("LLM response contained no message content.")

        finish_reason = choices[0].get("finish_reason")
        usage_data = data.get("usage") or {}
        usage = TokenUsage.from_parts(
            prompt_tokens=int(usage_data.get("prompt_tokens", 0)),
            completion_tokens=int(usage_data.get("completion_tokens", 0)),
        )
        return LLMResult(
            text=str(content),
            model=str(data.get("model", "") or model),
            usage=usage,
            truncated=finish_reason == "length",
        )

    def _safe(self, text: str) -> str:
        return redact_secrets(text, (self._api_key,))
