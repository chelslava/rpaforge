"""Pluggable LLM client layer for RPAForge core.

Synchronous chat abstraction (issue #732) with three adapters —
OpenAI-compatible (:class:`OpenAICompatClient`, covering OpenAI, Ollama,
vLLM and any compatible gateway), Anthropic Messages API
(:class:`AnthropicClient`) and Gemini via its OpenAI-compatible surface
(:class:`GeminiClient`, issue #901). Configuration resolves through the
``RPAFORGE_LLM_*`` environment variables; token usage is reported both on
:class:`LLMResult` and via the runner NDJSON event logger; a standalone
secret-redaction filter keeps API keys out of every log record.

``httpx`` is an optional dependency (extra ``[llm]``). It is imported
lazily, so importing this package never requires it — only instantiating
an adapter does, and then with a clear, actionable error.

Multimodal image input (issue #733): ``chat(..., images=...)`` accepts raw
bytes or file paths (PNG/JPEG/GIF/WebP), auto-downscales oversized images
through Pillow (also optional, same extra) and renders provider-native
content parts on the last user message. Text-only calls are unaffected.

Streaming (issue #820): ``chat_stream(...)`` on the adapters consumes the
provider's Server-Sent Events protocol, calls an ``on_delta`` callback with
incremental text, and returns the same :class:`LLMResult` shape (full text,
token usage from the final accounting event) as the default non-streaming
``chat``.

Robustness (issue #901): non-streaming ``chat()`` calls retry transport
failures and 429/502/503/504 responses with exponential backoff and full
jitter, honour ``Retry-After``, respect a per-attempt timeout
(``RPAFORGE_LLM_TIMEOUT_S``) and a total retry budget
(``RPAFORGE_LLM_RETRY_BUDGET_S``), cap attempts
(``RPAFORGE_LLM_MAX_ATTEMPTS``), and abort promptly when a cooperative
cancellation token fires — while auth/validation 4xx errors fail fast.
Streaming calls perform a single attempt by design (see
:mod:`rpaforge.llm._retry`).
"""

from __future__ import annotations

from typing import Any

from rpaforge.llm._redact import (
    REDACTED_PLACEHOLDER,
    SecretRedactionFilter,
    redact_secrets,
)
from rpaforge.llm._vision import PreparedImage
from rpaforge.llm.anthropic import AnthropicClient
from rpaforge.llm.client import (
    DEFAULT_LLM_MAX_ATTEMPTS,
    DEFAULT_LLM_RETRY_BUDGET_S,
    DEFAULT_LLM_TIMEOUT_S,
    DEFAULT_MAX_IMAGE_SIDE,
    DEFAULT_MAX_TOKENS,
    DEFAULT_PROVIDER_BASE_URLS,
    ENV_LLM_MAX_ATTEMPTS,
    ENV_LLM_RETRY_BUDGET_S,
    ENV_LLM_TIMEOUT_S,
    ENV_LLM_VISION_MAX_SIDE,
    USAGE_EVENT,
    DeltaHandler,
    ImageInput,
    LLMAuthError,
    LLMClient,
    LLMConfig,
    LLMConnectionError,
    LLMError,
    LLMResponseError,
    LLMResult,
    Message,
    RetryPolicy,
    TokenUsage,
    UsageEventLogger,
    load_httpx,
    log_usage,
    resolve_llm_config,
    resolve_max_attempts,
    resolve_max_image_side,
    resolve_retry_budget_s,
    resolve_retry_policy,
    resolve_timeout_s,
    resolve_vision_model,
)
from rpaforge.llm.gemini import GEMINI_DEFAULT_BASE_URL, GeminiClient
from rpaforge.llm.openai_compat import OpenAICompatClient
from rpaforge.llm.tools import ToolCall, ToolSpec, ToolValidationError

__all__ = [
    "DEFAULT_LLM_MAX_ATTEMPTS",
    "DEFAULT_LLM_RETRY_BUDGET_S",
    "DEFAULT_LLM_TIMEOUT_S",
    "DEFAULT_MAX_IMAGE_SIDE",
    "DEFAULT_MAX_TOKENS",
    "DEFAULT_PROVIDER_BASE_URLS",
    "DeltaHandler",
    "ENV_LLM_MAX_ATTEMPTS",
    "ENV_LLM_RETRY_BUDGET_S",
    "ENV_LLM_TIMEOUT_S",
    "ENV_LLM_VISION_MAX_SIDE",
    "GEMINI_DEFAULT_BASE_URL",
    "REDACTED_PLACEHOLDER",
    "USAGE_EVENT",
    "AnthropicClient",
    "GeminiClient",
    "ToolCall",
    "ToolSpec",
    "ToolValidationError",
    "ImageInput",
    "LLMAuthError",
    "LLMClient",
    "LLMConfig",
    "LLMConnectionError",
    "LLMError",
    "LLMResponseError",
    "LLMResult",
    "Message",
    "OpenAICompatClient",
    "PreparedImage",
    "RetryPolicy",
    "SecretRedactionFilter",
    "TokenUsage",
    "UsageEventLogger",
    "create_client",
    "load_httpx",
    "log_usage",
    "redact_secrets",
    "resolve_llm_config",
    "resolve_max_attempts",
    "resolve_max_image_side",
    "resolve_retry_budget_s",
    "resolve_retry_policy",
    "resolve_timeout_s",
    "resolve_vision_model",
]


def create_client(config: LLMConfig | None = None, **kwargs: Any) -> LLMClient:
    """Build the adapter matching *config*.

    When *config* is omitted it is resolved from the ``RPAFORGE_LLM_*``
    environment variables via :func:`resolve_llm_config`. Extra keyword
    arguments (e.g. ``transport``, ``event_logger``, ``cancel_token``)
    are forwarded to the adapter constructor; the resolved timeout and
    retry settings are forwarded as defaults and lose to any explicit
    keyword of the same name.
    """
    resolved = config if config is not None else resolve_llm_config()
    base_url = resolved.base_url or DEFAULT_PROVIDER_BASE_URLS.get(
        resolved.provider, ""
    )
    if not base_url:
        raise LLMError(
            f"No base URL configured for provider '{resolved.provider}'. "
            "Set RPAFORGE_LLM_BASE_URL or pass config with base_url."
        )
    kwargs.setdefault("timeout", resolved.timeout_s)
    kwargs.setdefault("max_attempts", resolved.max_attempts)
    kwargs.setdefault("retry_budget_s", resolved.retry_budget_s)
    if resolved.provider == "anthropic":
        return AnthropicClient(base_url=base_url, api_key=resolved.api_key, **kwargs)
    if resolved.provider == "gemini":
        return GeminiClient(base_url=base_url, api_key=resolved.api_key, **kwargs)
    return OpenAICompatClient(base_url=base_url, api_key=resolved.api_key, **kwargs)
