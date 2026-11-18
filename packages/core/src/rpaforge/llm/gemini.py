"""Google Gemini adapter riding the OpenAI-compatible surface (issue #901).

Gemini exposes an OpenAI-compatible endpoint at
``https://generativelanguage.googleapis.com/v1beta/openai``, so this
adapter subclasses :class:`OpenAICompatClient` instead of speaking the
native Gemini protocol (the route Studio's ``GeminiProvider`` uses).
Provider quirks worth knowing:

- The default base URL ends with ``/v1beta/openai`` — not ``/v1`` and
  not the bare API root. Point ``RPAFORGE_LLM_BASE_URL`` at a URL with
  the same shape when proxying.
- Authentication uses a plain ``Authorization: Bearer <API key>``
  header on this surface; the native ``x-goog-api-key`` header and
  ``?key=`` query parameter are not accepted here.
- Structured output maps to ``response_format: {"type": "json_object"}``
  like every other compatible gateway; strict JSON-schema enforcement is
  not available.
- Streaming follows the OpenAI SSE protocol including the ``[DONE]``
  sentinel, so ``chat_stream`` works unchanged.

Retries, per-attempt timeouts, ``Retry-After`` handling and cooperative
cancellation behave exactly like the other adapters (see
:mod:`rpaforge.llm._retry`).
"""

from __future__ import annotations

from collections.abc import Callable
from typing import TYPE_CHECKING

from rpaforge.llm.client import RetryPolicy
from rpaforge.llm.openai_compat import OpenAICompatClient

if TYPE_CHECKING:
    import httpx

    from rpaforge.core.cancellation import CancellationToken
    from rpaforge.llm.client import UsageEventLogger

__all__ = ["GEMINI_DEFAULT_BASE_URL", "GeminiClient"]

#: Google's OpenAI-compatible endpoint root (issue #901).
GEMINI_DEFAULT_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/openai"


class GeminiClient(OpenAICompatClient):
    """Synchronous chat client for Gemini's OpenAI-compatible endpoint."""

    _usage_provider = "gemini"

    def __init__(
        self,
        base_url: str = GEMINI_DEFAULT_BASE_URL,
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
        """Configure the endpoint; see :class:`OpenAICompatClient`.

        Only the default *base_url* differs: it points at Gemini's
        OpenAI-compatible surface rather than ``api.openai.com``.
        """
        super().__init__(
            base_url=base_url,
            api_key=api_key,
            timeout=timeout,
            transport=transport,
            event_logger=event_logger,
            max_image_side=max_image_side,
            max_attempts=max_attempts,
            retry_budget_s=retry_budget_s,
            retry_policy=retry_policy,
            retry_sleep=retry_sleep,
            cancel_token=cancel_token,
        )
