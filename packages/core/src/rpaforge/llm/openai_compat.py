"""OpenAI-compatible chat adapter built directly on ``httpx`` (no SDK).

Works against OpenAI, Ollama (``http://localhost:11434/v1``), vLLM, or any
other OpenAI-compatible gateway. Structured output uses
``response_format: {"type": "json_object"}`` rather than strict JSON schema
mode: many compatible servers do not fully support strict enforcement.

Robustness (issue #901): the non-streaming :meth:`chat` retries
transport failures and 429/502/503/504 responses with exponential
backoff and jitter, honouring ``Retry-After``; auth/validation 4xx
errors fail fast. :meth:`chat_stream` deliberately performs a single
attempt — partial deltas may already have been delivered to the
``on_delta`` callback, so replaying a failed stream would duplicate
emitted text.
"""

from __future__ import annotations

import json
import logging
import time
from collections.abc import Callable, Sequence
from typing import TYPE_CHECKING, Any

from rpaforge.llm._redact import SecretRedactionFilter, redact_secrets
from rpaforge.llm._retry import run_with_retries
from rpaforge.llm._stream import DONE_SENTINEL, iter_sse_events
from rpaforge.llm._vision import (
    PreparedImage,
    last_user_message_index,
    prepare_images,
    render_openai_content,
)
from rpaforge.llm.client import (
    DEFAULT_MAX_TOKENS,
    ImageInput,
    LLMAuthError,
    LLMConnectionError,
    LLMError,
    LLMResponseError,
    LLMResult,
    Message,
    RetryPolicy,
    TokenUsage,
    load_httpx,
    log_usage,
    resolve_max_image_side,
    resolve_retry_policy,
    resolve_timeout_s,
)
from rpaforge.llm.tools import ToolCall, ToolSpec

if TYPE_CHECKING:
    import httpx

    from rpaforge.core.cancellation import CancellationToken
    from rpaforge.llm.client import UsageEventLogger

__all__ = ["OpenAICompatClient"]

#: HTTP status that maps to :class:`LLMAuthError`; every other non-2xx
#: status maps to :class:`LLMResponseError`.
_AUTH_STATUS = 401


class OpenAICompatClient:
    """Synchronous chat client for OpenAI-compatible endpoints."""

    #: Provider name reported in ``llm_usage`` events; subclasses riding
    #: the same wire protocol (e.g. Gemini's OpenAI-compat surface)
    #: override it.
    _usage_provider = "openai-compatible"

    def __init__(
        self,
        base_url: str = "https://api.openai.com/v1",
        api_key: str = "",
        timeout: float | None = None,
        transport: httpx.BaseTransport | None = None,
        event_logger: UsageEventLogger | None = None,
        max_image_side: int | None = None,
        max_attempts: int | None = None,
        retry_budget_s: float | None = None,
        retry_policy: RetryPolicy | None = None,
        retry_sleep: Callable[[float], None] | None = None,
        cancel_token: CancellationToken | None = None,
    ) -> None:
        """Configure the endpoint.

        ``transport`` accepts an ``httpx.BaseTransport`` (e.g.
        ``httpx.MockTransport``) for testing without any network access.
        ``max_image_side`` caps the longest image side (pixels) for
        multimodal requests; it defaults to the
        ``RPAFORGE_LLM_VISION_MAX_SIDE`` environment override, then to 1568.
        ``timeout`` bounds each HTTP attempt (env override
        ``RPAFORGE_LLM_TIMEOUT_S``); ``max_attempts``/``retry_budget_s``
        shape the retry behaviour of :meth:`chat` (env overrides
        ``RPAFORGE_LLM_MAX_ATTEMPTS``/``RPAFORGE_LLM_RETRY_BUDGET_S``),
        while a full ``retry_policy`` overrides both at once.
        ``cancel_token`` wires cooperative cancellation (issue #863) so
        serve/daemon cancel requests abort in-flight LLM calls.
        Raises an actionable :class:`LLMError` immediately when the optional
        ``httpx`` dependency is missing.
        """
        self._httpx = load_httpx()
        self._base_url = base_url.rstrip("/")
        self._api_key = api_key
        self._timeout = resolve_timeout_s(timeout)
        self._transport = transport
        self._event_logger = event_logger
        self._max_image_side = resolve_max_image_side(max_image_side)
        self._retry_policy = resolve_retry_policy(
            max_attempts, retry_budget_s, retry_policy
        )
        self._retry_sleep = retry_sleep
        self._cancel_token = cancel_token
        self._redact_filter = SecretRedactionFilter(api_key)
        if api_key:
            self._redact_filter.attach(logging.getLogger(__name__))

    #: Provider-native function calling supported (issue #900).
    supports_tools = True

    def chat(
        self,
        messages: Sequence[Message],
        *,
        model: str,
        json_mode: bool = False,
        max_tokens: int = DEFAULT_MAX_TOKENS,
        images: Sequence[ImageInput] | None = None,
        tools: Sequence[ToolSpec] | None = None,
        tool_choice: str | None = None,
        prompt_id: str | None = None,
        prompt_version: int | None = None,
    ) -> LLMResult:
        """Run one ``POST {base_url}/chat/completions`` request.

        Transient failures (transport errors, HTTP 429/502/503/504) are
        retried with backoff; see the module docstring for the streaming
        counterpart's single-attempt semantics. When *images* is
        provided, they are attached as multipart content to the last
        user message; text-only requests are unchanged. ``tools``
        advertises native function calling; invocations come back as
        ``LLMResult.tool_calls`` (issue #900).
        """
        prepared_images = prepare_images(images, max_side=self._max_image_side)
        payload: dict[str, Any] = {
            "model": model,
            "messages": self._render_messages(messages, prepared_images),
            "max_tokens": max_tokens,
        }
        if json_mode:
            payload["response_format"] = {"type": "json_object"}
        if tools:
            payload["tools"] = [
                {
                    "type": "function",
                    "function": {
                        "name": spec.name,
                        "description": spec.description,
                        "parameters": spec.parameters,
                    },
                }
                for spec in tools
            ]
            payload["tool_choice"] = tool_choice or "auto"
        started = time.monotonic()
        response, attempts = self._send(payload)
        duration_ms = int((time.monotonic() - started) * 1000)
        result = self._parse(model, response)
        log_usage(
            self._event_logger,
            provider=self._usage_provider,
            model=model,
            usage=result.usage,
            duration_ms=duration_ms,
            attempts=attempts,
            prompt_id=prompt_id,
            prompt_version=prompt_version,
        )
        return result

    def chat_stream(
        self,
        messages: Sequence[Message],
        *,
        model: str,
        json_mode: bool = False,
        max_tokens: int = DEFAULT_MAX_TOKENS,
        images: Sequence[ImageInput] | None = None,
        on_delta: Callable[[str], None],
        prompt_id: str | None = None,
        prompt_version: int | None = None,
    ) -> LLMResult:
        """Run one streaming ``POST {base_url}/chat/completions`` request.

        Sends ``"stream": true`` plus ``stream_options.include_usage`` so a
        final Server-Sent Events chunk carries token accounting identical to
        the non-streaming path. *on_delta* is called with each incremental
        text piece as it arrives; the returned :class:`LLMResult` carries the
        full text plus the same ``usage``/``truncated`` fields as
        :meth:`chat`. Unlike :meth:`chat` this performs a single attempt:
        retries are deliberately not applied because partial deltas may
        already have been delivered, and a replay would duplicate them.
        """
        prepared_images = prepare_images(images, max_side=self._max_image_side)
        payload: dict[str, Any] = {
            "model": model,
            "messages": self._render_messages(messages, prepared_images),
            "max_tokens": max_tokens,
            "stream": True,
            "stream_options": {"include_usage": True},
        }
        if json_mode:
            payload["response_format"] = {"type": "json_object"}

        started = time.monotonic()
        text_parts: list[str] = []
        truncated = False
        usage = TokenUsage()
        response_model = ""
        url = f"{self._base_url}/chat/completions"
        try:
            with self._httpx.Client(
                timeout=self._timeout, transport=self._transport
            ) as client:
                with client.stream(
                    "POST", url, json=payload, headers=self._headers()
                ) as response:
                    self._raise_for_status(response)
                    for _event, data in iter_sse_events(response):
                        if data == DONE_SENTINEL:
                            break
                        chunk = self._decode_chunk(data)
                        model_name = chunk.get("model")
                        if isinstance(model_name, str) and model_name:
                            response_model = model_name
                        choices = chunk.get("choices") or []
                        if choices:
                            piece = (choices[0].get("delta") or {}).get("content")
                            if piece:
                                text_parts.append(str(piece))
                                on_delta(str(piece))
                            if choices[0].get("finish_reason") == "length":
                                truncated = True
                        usage = self._chunk_usage(chunk, usage)
        except self._httpx.TimeoutException as exc:
            raise LLMConnectionError(
                f"LLM request timed out after {self._timeout:g}s."
            ) from exc
        except self._httpx.TransportError as exc:
            raise LLMConnectionError(
                f"Could not reach LLM endpoint '{url}': {self._safe(str(exc))}"
            ) from exc

        if not text_parts:
            raise LLMResponseError("LLM response contained no message content.")
        result = LLMResult(
            text="".join(text_parts),
            model=response_model or model,
            usage=usage,
            truncated=truncated,
        )
        log_usage(
            self._event_logger,
            provider=self._usage_provider,
            model=model,
            usage=result.usage,
            duration_ms=int((time.monotonic() - started) * 1000),
            prompt_id=prompt_id,
            prompt_version=prompt_version,
        )
        return result

    def _render_messages(
        self,
        messages: Sequence[Message],
        images: list[PreparedImage],
    ) -> list[dict[str, Any]]:
        """Render wire messages, attaching *images* to the last user turn."""
        target = last_user_message_index(messages)
        if images and target < 0:
            raise LLMError("images require at least one message with role 'user'.")
        rendered: list[dict[str, Any]] = []
        for index, message in enumerate(messages):
            entry_images = images if index == target else []
            rendered.append(
                {
                    "role": message["role"],
                    "content": render_openai_content(message["content"], entry_images),
                }
            )
        return rendered

    def _headers(self) -> dict[str, str]:
        headers = {}
        if self._api_key:
            headers["Authorization"] = f"Bearer {self._api_key}"
        return headers

    def _send(self, payload: dict[str, Any]) -> tuple[httpx.Response, int]:
        """POST the payload with retries; return the response and attempts.

        Each attempt is bounded by the configured timeout; transient
        failures are retried per :mod:`rpaforge.llm._retry` and the
        final response is mapped through the typed error hierarchy.
        """
        url = f"{self._base_url}/chat/completions"

        def attempt() -> httpx.Response:
            try:
                with self._httpx.Client(
                    timeout=self._timeout, transport=self._transport
                ) as client:
                    return client.post(url, json=payload, headers=self._headers())  # type: ignore[no-any-return]
            except self._httpx.TimeoutException as exc:
                raise LLMConnectionError(
                    f"LLM request timed out after {self._timeout:g}s."
                ) from exc
            except self._httpx.TransportError as exc:
                raise LLMConnectionError(
                    f"Could not reach LLM endpoint '{url}': {self._safe(str(exc))}"
                ) from exc

        response, attempts = run_with_retries(
            attempt,
            policy=self._retry_policy,
            cancel_token=self._cancel_token,
            sleep=self._retry_sleep,
        )
        self._raise_for_status(response)
        return response, attempts

    def _raise_for_status(self, response: httpx.Response) -> None:
        """Map non-2xx statuses to the shared error hierarchy."""
        if response.status_code == _AUTH_STATUS:
            raise LLMAuthError(
                f"LLM endpoint rejected the API key (HTTP {_AUTH_STATUS})."
            )
        if response.status_code >= 400:
            body = response.read().decode(errors="replace")
            raise LLMResponseError(
                f"LLM request failed (HTTP {response.status_code}): "
                f"{self._safe(body[:500])}"
            )

    def _decode_chunk(self, data: str) -> dict[str, Any]:
        """Parse one SSE JSON chunk, raising on malformed payloads."""
        try:
            chunk = json.loads(data)
        except ValueError as exc:
            raise LLMResponseError(
                "LLM endpoint returned a malformed SSE chunk."
            ) from exc
        if not isinstance(chunk, dict):
            raise LLMResponseError("LLM endpoint returned a malformed SSE chunk.")
        return chunk

    @staticmethod
    def _chunk_usage(chunk: dict[str, Any], default: TokenUsage) -> TokenUsage:
        """Return the chunk's usage mapping, or *default* when absent."""
        usage_data = chunk.get("usage")
        if not isinstance(usage_data, dict):
            return default
        return TokenUsage.from_parts(
            prompt_tokens=int(usage_data.get("prompt_tokens", 0)),
            completion_tokens=int(usage_data.get("completion_tokens", 0)),
        )

    def _parse(self, model: str, response: httpx.Response) -> LLMResult:
        """Parse the completion payload, incl. native tool calls."""
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
        message = choices[0].get("message", {}) if choices else {}
        content = message.get("content")
        tool_calls = self._parse_tool_calls(message)
        if not content and not tool_calls:
            raise LLMResponseError(
                "LLM response contained no message content or tool calls."
            )

        finish_reason = choices[0].get("finish_reason")
        usage_data = data.get("usage") or {}
        usage = TokenUsage.from_parts(
            prompt_tokens=int(usage_data.get("prompt_tokens", 0)),
            completion_tokens=int(usage_data.get("completion_tokens", 0)),
        )
        return LLMResult(
            text=str(content or ""),
            model=str(data.get("model", "") or model),
            usage=usage,
            truncated=finish_reason == "length",
            tool_calls=tool_calls,
        )

    def _parse_tool_calls(self, message: dict[str, Any]) -> tuple[ToolCall, ...]:
        """Parse OpenAI ``message.tool_calls`` into typed ToolCall tuples."""
        parsed: list[ToolCall] = []
        for raw in message.get("tool_calls") or []:
            function = raw.get("function") or {}
            name = str(function.get("name", ""))
            if not name:
                continue
            raw_arguments = function.get("arguments") or "{}"
            try:
                arguments = json.loads(raw_arguments)
            except ValueError as exc:
                raise LLMResponseError(
                    f"tool call '{name}' arguments are not valid JSON: {exc}"
                ) from exc
            if not isinstance(arguments, dict):
                raise LLMResponseError(
                    f"tool call '{name}' arguments must be a JSON object."
                )
            parsed.append(
                ToolCall(
                    name=name,
                    arguments=arguments,
                    call_id=str(raw.get("id", "")),
                )
            )
        return tuple(parsed)

    def _safe(self, text: str) -> str:
        return redact_secrets(text, (self._api_key,))
