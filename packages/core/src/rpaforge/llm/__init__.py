"""Pluggable LLM client layer for RPAForge core.

Synchronous chat abstraction (issue #732) with two adapters —
OpenAI-compatible (:class:`OpenAICompatClient`, covering OpenAI, Ollama,
vLLM and any compatible gateway) and Anthropic Messages API
(:class:`AnthropicClient`). Configuration resolves through the
``RPAFORGE_LLM_*`` environment variables; token usage is reported both on
:class:`LLMResult` and via the runner NDJSON event logger; a standalone
secret-redaction filter keeps API keys out of every log record.

``httpx`` is an optional dependency (extra ``[llm]``). It is imported
lazily, so importing this package never requires it — only instantiating an
adapter does, and then with a clear, actionable error.
"""

from __future__ import annotations

from typing import Any

from rpaforge.llm._redact import (
    REDACTED_PLACEHOLDER,
    SecretRedactionFilter,
    redact_secrets,
)
from rpaforge.llm.anthropic import AnthropicClient
from rpaforge.llm.client import (
    DEFAULT_MAX_TOKENS,
    DEFAULT_PROVIDER_BASE_URLS,
    USAGE_EVENT,
    LLMAuthError,
    LLMClient,
    LLMConfig,
    LLMConnectionError,
    LLMError,
    LLMResponseError,
    LLMResult,
    Message,
    TokenUsage,
    UsageEventLogger,
    load_httpx,
    log_usage,
    resolve_llm_config,
)
from rpaforge.llm.openai_compat import OpenAICompatClient

__all__ = [
    "DEFAULT_MAX_TOKENS",
    "DEFAULT_PROVIDER_BASE_URLS",
    "REDACTED_PLACEHOLDER",
    "USAGE_EVENT",
    "AnthropicClient",
    "LLMAuthError",
    "LLMClient",
    "LLMConfig",
    "LLMConnectionError",
    "LLMError",
    "LLMResponseError",
    "LLMResult",
    "Message",
    "OpenAICompatClient",
    "SecretRedactionFilter",
    "TokenUsage",
    "UsageEventLogger",
    "create_client",
    "load_httpx",
    "log_usage",
    "redact_secrets",
    "resolve_llm_config",
]


def create_client(config: LLMConfig | None = None, **kwargs: Any) -> LLMClient:
    """Build the adapter matching *config*.

    When *config* is omitted it is resolved from the ``RPAFORGE_LLM_*``
    environment variables via :func:`resolve_llm_config`. Extra keyword
    arguments (e.g. ``transport``, ``event_logger``) are forwarded to the
    adapter constructor.
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
    if resolved.provider == "anthropic":
        return AnthropicClient(base_url=base_url, api_key=resolved.api_key, **kwargs)
    return OpenAICompatClient(base_url=base_url, api_key=resolved.api_key, **kwargs)
