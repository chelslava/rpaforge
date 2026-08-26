"""Provider-agnostic LLM client contracts, errors, and configuration.

This module defines the synchronous :class:`LLMClient` protocol implemented
by the adapters in :mod:`rpaforge.llm.openai_compat` and
:mod:`rpaforge.llm.anthropic`, the typed exception hierarchy shared by all
adapters, and environment-driven configuration resolution (``RPAFORGE_LLM_*``
variables, see :mod:`rpaforge.config`).

The ``httpx`` HTTP dependency is optional. It is imported lazily via
:func:`load_httpx` so that importing :mod:`rpaforge.llm` never fails on a
plain ``rpaforge-core`` install; only instantiating an adapter raises a
clear, actionable error when ``httpx`` is missing.
"""

from __future__ import annotations

import os
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from pathlib import Path
from types import ModuleType
from typing import (
    TYPE_CHECKING,
    Any,
    Protocol,
    TypedDict,
    runtime_checkable,
)

from rpaforge.config import (
    ENV_LLM_API_KEY,
    ENV_LLM_BASE_URL,
    ENV_LLM_MODEL,
    ENV_LLM_PROVIDER,
    ENV_LLM_VISION_MODEL,
)

if TYPE_CHECKING:
    from rpaforge.runner.logging import EventLogger

__all__ = [
    "DEFAULT_MAX_IMAGE_SIDE",
    "DEFAULT_MAX_TOKENS",
    "DEFAULT_PROVIDER_BASE_URLS",
    "ENV_LLM_VISION_MAX_SIDE",
    "USAGE_EVENT",
    "UsageEventLogger",
    "ImageInput",
    "LLMAuthError",
    "LLMClient",
    "LLMConfig",
    "LLMConnectionError",
    "LLMError",
    "LLMResponseError",
    "LLMResult",
    "Message",
    "TokenUsage",
    "load_httpx",
    "log_usage",
    "resolve_llm_config",
    "resolve_max_image_side",
    "resolve_vision_model",
]

#: Default ``max_tokens`` applied when a caller does not override it.
DEFAULT_MAX_TOKENS = 1024

#: Default cap for the longest image side sent to vision models (pixels).
#: Matches Anthropic's recommended maximum; larger images are downscaled
#: before they reach the wire.
DEFAULT_MAX_IMAGE_SIDE = 1568

#: Environment variable overriding :data:`DEFAULT_MAX_IMAGE_SIDE`.
ENV_LLM_VISION_MAX_SIDE = "RPAFORGE_LLM_VISION_MAX_SIDE"

#: Event name emitted through :class:`EventLogger` after every successful chat.
USAGE_EVENT = "llm_usage"

#: Known provider names mapped to their default OpenAI/Anthropic base URLs.
DEFAULT_PROVIDER_BASE_URLS: Mapping[str, str] = {
    "openai": "https://api.openai.com/v1",
    "openai-compatible": "https://api.openai.com/v1",
    "ollama": "http://localhost:11434/v1",
    "vllm": "http://localhost:8000/v1",
    "anthropic": "https://api.anthropic.com",
}


class Message(TypedDict):
    """A single chat message: ``{"role": ..., "content": ...}``."""

    role: str
    content: str


#: One image accepted by ``chat(..., images=...)``: raw encoded bytes or a
#: path to an image file (PNG, JPEG, GIF, or WebP).
ImageInput = bytes | Path


@dataclass(frozen=True)
class TokenUsage:
    """Token accounting for one chat completion."""

    prompt_tokens: int = 0
    completion_tokens: int = 0
    total_tokens: int = 0

    @classmethod
    def from_parts(cls, prompt_tokens: int, completion_tokens: int) -> TokenUsage:
        """Build usage from prompt/completion counts, computing the total."""
        return cls(
            prompt_tokens=prompt_tokens,
            completion_tokens=completion_tokens,
            total_tokens=prompt_tokens + completion_tokens,
        )


@dataclass(frozen=True)
class LLMResult:
    """Result of one chat completion."""

    text: str
    model: str = ""
    usage: TokenUsage | None = None
    truncated: bool = False


class LLMError(Exception):
    """Base class for all LLM client errors."""


class LLMConnectionError(LLMError):
    """Raised when the endpoint cannot be reached or times out."""


class LLMAuthError(LLMError):
    """Raised on authentication failures (HTTP 401)."""


class LLMResponseError(LLMError):
    """Raised on unexpected HTTP statuses or malformed response payloads."""


class UsageEventLogger(Protocol):
    """Minimal logging interface satisfied by ``runner.EventLogger``."""

    def emit(self, event_name: str, **kwargs: Any) -> None:
        """Emit one structured event."""


@runtime_checkable
class LLMClient(Protocol):
    """Synchronous chat-completion contract implemented by all adapters."""

    def chat(
        self,
        messages: Sequence[Message],
        *,
        model: str,
        json_mode: bool = False,
        max_tokens: int = DEFAULT_MAX_TOKENS,
        images: Sequence[ImageInput] | None = None,
    ) -> LLMResult:
        """Run one chat completion and return text plus token usage.

        ``images`` optionally attaches multimodal image input (raw bytes or
        file paths). Images are rendered into the last user message using
        each provider's native content-part format; omitting the parameter
        keeps the request byte-identical to a text-only call.
        """


@dataclass(frozen=True)
class LLMConfig:
    """Resolved LLM endpoint settings."""

    provider: str
    base_url: str = ""
    model: str = ""
    api_key: str = ""
    vision_model: str = ""


def load_httpx() -> ModuleType:
    """Return the ``httpx`` module with an actionable error when absent.

    Import is performed lazily so that :mod:`rpaforge.llm` stays usable as
    a plain import even without the optional ``[llm]`` extra installed.
    """
    try:
        import httpx
    except ImportError as exc:
        raise LLMError(
            "The 'httpx' package is required for LLM providers. "
            "Install it with: pip install 'rpaforge-core[llm]'"
        ) from exc
    return httpx


def log_usage(
    logger: EventLogger | None,
    *,
    provider: str,
    model: str,
    usage: TokenUsage | None,
    duration_ms: int,
) -> None:
    """Emit a token-usage event through the runner NDJSON event logger.

    Field naming follows :mod:`rpaforge.runner.logging` conventions
    (snake_case, ``*_tokens``, ``duration_ms``).
    """
    if logger is None:
        return
    logger.emit(
        USAGE_EVENT,
        provider=provider,
        model=model,
        prompt_tokens=usage.prompt_tokens if usage else 0,
        completion_tokens=usage.completion_tokens if usage else 0,
        total_tokens=usage.total_tokens if usage else 0,
        duration_ms=duration_ms,
    )


def resolve_llm_config(
    provider: str | None = None,
    base_url: str | None = None,
    model: str | None = None,
    api_key: str | None = None,
) -> LLMConfig:
    """Resolve LLM settings from explicit arguments with env fallbacks.

    Precedence per field: explicit argument > ``RPAFORGE_LLM_*``
    environment variable > provider default base URL. An unknown provider
    name is accepted when an explicit ``base_url`` is available (custom
    gateways); otherwise a descriptive error lists supported providers.
    """
    resolved_provider = (
        (provider if provider is not None else os.environ.get(ENV_LLM_PROVIDER, ""))
        .strip()
        .lower()
    )
    if not resolved_provider:
        raise LLMError(
            "No LLM provider configured. Set RPAFORGE_LLM_PROVIDER "
            f"or pass provider=. Supported providers: "
            f"{', '.join(sorted(DEFAULT_PROVIDER_BASE_URLS))}."
        )

    resolved_base_url = (
        (base_url if base_url is not None else os.environ.get(ENV_LLM_BASE_URL, ""))
        .strip()
        .rstrip("/")
    )
    if not resolved_base_url:
        resolved_base_url = DEFAULT_PROVIDER_BASE_URLS.get(resolved_provider, "")
    if not resolved_base_url:
        raise LLMError(
            f"Unknown LLM provider '{resolved_provider}'. Supported providers: "
            f"{', '.join(sorted(DEFAULT_PROVIDER_BASE_URLS))}, or set "
            "RPAFORGE_LLM_BASE_URL explicitly."
        )

    resolved_model = (
        model if model is not None else os.environ.get(ENV_LLM_MODEL, "")
    ).strip()
    resolved_api_key = (
        api_key if api_key is not None else os.environ.get(ENV_LLM_API_KEY, "")
    )
    return LLMConfig(
        provider=resolved_provider,
        base_url=resolved_base_url,
        model=resolved_model,
        api_key=resolved_api_key,
        vision_model=os.environ.get(ENV_LLM_VISION_MODEL, "").strip(),
    )


def resolve_vision_model(model: str | None = None) -> str:
    """Return the vision-capable model override for multimodal requests.

    Precedence: explicit *model* argument > ``RPAFORGE_LLM_VISION_MODEL``
    environment variable > empty string (callers fall back to the text
    ``model`` when no distinct vision model is configured).
    """
    return (
        model if model is not None else os.environ.get(ENV_LLM_VISION_MODEL, "")
    ).strip()


def resolve_max_image_side(max_image_side: int | None = None) -> int:
    """Return the cap for the longest image side in pixels.

    Precedence: explicit *max_image_side* argument >
    ``RPAFORGE_LLM_VISION_MAX_SIDE`` environment variable >
    :data:`DEFAULT_MAX_IMAGE_SIDE`. An environment value that fails to parse
    as a positive integer falls back to the default; an explicit argument of
    ``< 1`` raises :class:`ValueError`.
    """
    if max_image_side is not None:
        if max_image_side < 1:
            raise ValueError("max_image_side must be a positive integer")
        return max_image_side
    try:
        from_env = int(os.environ.get(ENV_LLM_VISION_MAX_SIDE, ""))
    except ValueError:
        return DEFAULT_MAX_IMAGE_SIDE
    return from_env if from_env >= 1 else DEFAULT_MAX_IMAGE_SIDE
