"""Anthropic Messages API adapter built directly on ``httpx`` (no SDK).

Structured output mirrors the Studio Electron adapter
(``packages/studio/electron/ai/providers.ts``): when ``json_mode`` is
requested the chat is forced through a single tool whose ``input_schema``
carries the JSON schema — Anthropic's tool-use path has no all-required
constraint, unlike OpenAI strict JSON mode.
"""

from __future__ import annotations

import json
import logging
import time
from collections.abc import Mapping, Sequence
from typing import TYPE_CHECKING, Any

from rpaforge.llm._redact import SecretRedactionFilter, redact_secrets
from rpaforge.llm._vision import (
    PreparedImage,
    last_user_message_index,
    prepare_images,
    render_anthropic_blocks,
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
    TokenUsage,
    load_httpx,
    log_usage,
    resolve_max_image_side,
)

if TYPE_CHECKING:
    import httpx

    from rpaforge.llm.client import UsageEventLogger

__all__ = ["AnthropicClient"]

#: HTTP status that maps to :class:`LLMAuthError`; every other non-2xx
#: status maps to :class:`LLMResponseError`.
_AUTH_STATUS = 401

_API_VERSION = "2023-06-01"

_TOOL_NAME = "emit_structured_output"

_DEFAULT_TOOL_SCHEMA: Mapping[str, Any] = {"type": "object"}


class AnthropicClient:
    """Synchronous chat client for the Anthropic Messages API."""

    def __init__(
        self,
        base_url: str = "https://api.anthropic.com",
        api_key: str = "",
        timeout: float = 120.0,
        transport: httpx.BaseTransport | None = None,
        event_logger: UsageEventLogger | None = None,
        tool_schema: Mapping[str, Any] | None = None,
        max_image_side: int | None = None,
    ) -> None:
        """Configure the endpoint and the structured-output JSON schema.

        ``transport`` accepts an ``httpx.BaseTransport`` (e.g.
        ``httpx.MockTransport``) for testing without any network access.
        ``max_image_side`` caps the longest image side (pixels) for
        multimodal requests; it defaults to the
        ``RPAFORGE_LLM_VISION_MAX_SIDE`` environment override, then to 1568.
        Raises an actionable :class:`LLMError` immediately when the optional
        ``httpx`` dependency is missing.
        """
        self._httpx = load_httpx()
        self._base_url = base_url.rstrip("/")
        self._api_key = api_key
        self._timeout = timeout
        self._transport = transport
        self._event_logger = event_logger
        self._tool_schema = dict(tool_schema or _DEFAULT_TOOL_SCHEMA)
        self._max_image_side = resolve_max_image_side(max_image_side)
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
        images: Sequence[ImageInput] | None = None,
    ) -> LLMResult:
        """Run one ``POST {base_url}/v1/messages`` request.

        When *images* is provided, they are attached as content blocks to
        the last non-system user message; text-only requests are unchanged.
        """
        prepared_images = prepare_images(images, max_side=self._max_image_side)
        payload = self._payload(
            messages,
            model=model,
            json_mode=json_mode,
            max_tokens=max_tokens,
            images=prepared_images,
        )
        started = time.monotonic()
        response = self._send(payload)
        duration_ms = int((time.monotonic() - started) * 1000)
        result = self._parse(model, response, json_mode=json_mode)
        log_usage(
            self._event_logger,
            provider="anthropic",
            model=model,
            usage=result.usage,
            duration_ms=duration_ms,
        )
        return result

    def _payload(
        self,
        messages: Sequence[Message],
        *,
        model: str,
        json_mode: bool,
        max_tokens: int,
        images: list[PreparedImage] | None = None,
    ) -> dict[str, Any]:
        system_parts = [
            message["content"]
            for message in messages
            if message.get("role") == "system"
        ]
        conversation = [
            message for message in messages if message.get("role") != "system"
        ]
        target = last_user_message_index(conversation)
        if images and target < 0:
            raise LLMError("images require at least one message with role 'user'.")
        rendered_messages: list[dict[str, Any]] = []
        for index, message in enumerate(conversation):
            entry_images = images if index == target else []
            rendered_messages.append(
                {
                    "role": message["role"],
                    "content": render_anthropic_blocks(
                        message["content"], entry_images
                    ),
                }
            )
        payload: dict[str, Any] = {
            "model": model,
            "max_tokens": max_tokens,
            "messages": rendered_messages,
        }
        if system_parts:
            payload["system"] = "\n\n".join(system_parts)
        if json_mode:
            payload["tools"] = [
                {
                    "name": _TOOL_NAME,
                    "description": "Return the final answer as a JSON object.",
                    "input_schema": self._tool_schema,
                }
            ]
            payload["tool_choice"] = {"type": "tool", "name": _TOOL_NAME}
        return payload

    def _headers(self) -> dict[str, str]:
        headers = {"anthropic-version": _API_VERSION}
        if self._api_key:
            headers["x-api-key"] = self._api_key
        return headers

    def _send(self, payload: dict[str, Any]) -> httpx.Response:
        url = f"{self._base_url}/v1/messages"
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

    def _parse(
        self, model: str, response: httpx.Response, *, json_mode: bool
    ) -> LLMResult:
        try:
            data = response.json()
        except ValueError as exc:
            raise LLMResponseError("LLM endpoint returned a non-JSON body.") from exc
        if not isinstance(data, dict):
            raise LLMResponseError("LLM endpoint returned an unexpected payload.")
        error = data.get("error")
        if isinstance(error, dict) and error.get("message"):
            raise LLMResponseError(
                f"LLM upstream error ({error.get('type', 'unknown')}): "
                f"{self._safe(str(error['message']))}"
            )

        blocks = data.get("content") or []
        text = self._extract_text(blocks, json_mode=json_mode)
        usage_data = data.get("usage") or {}
        usage = TokenUsage.from_parts(
            prompt_tokens=int(usage_data.get("input_tokens", 0)),
            completion_tokens=int(usage_data.get("output_tokens", 0)),
        )
        return LLMResult(
            text=text,
            model=str(data.get("model", "") or model),
            usage=usage,
            truncated=data.get("stop_reason") == "max_tokens",
        )

    def _extract_text(self, blocks: Any, *, json_mode: bool) -> str:
        if not isinstance(blocks, list):
            raise LLMResponseError("LLM response contained no content blocks.")
        tool_use = next(
            (
                block
                for block in blocks
                if isinstance(block, dict)
                and block.get("type") == "tool_use"
                and isinstance(block.get("input"), dict)
            ),
            None,
        )
        if tool_use is not None:
            return json.dumps(tool_use["input"], ensure_ascii=False)
        text = "".join(
            str(block.get("text", ""))
            for block in blocks
            if isinstance(block, dict) and block.get("type") == "text"
        ).strip()
        if json_mode:
            raise LLMResponseError("Anthropic response contained no tool_use block.")
        if not text:
            raise LLMResponseError("LLM response contained no text content.")
        return text

    def _safe(self, text: str) -> str:
        return redact_secrets(text, (self._api_key,))
