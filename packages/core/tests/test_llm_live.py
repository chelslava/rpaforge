"""Opt-in live LLM tests. Skipped unless RPAFORGE_LLM_LIVE_TEST=1.

These tests hit real endpoints configured through RPAFORGE_LLM_* and are
never part of default test runs. Set RPAFORGE_LLM_LIVE_TEST=1 plus the
provider variables (e.g. RPAFORGE_LLM_PROVIDER=ollama,
RPAFORGE_LLM_MODEL=llama3) to enable them.
"""

from __future__ import annotations

import os

import pytest

from rpaforge.llm import (
    AnthropicClient,
    OpenAICompatClient,
    resolve_llm_config,
)

pytestmark = pytest.mark.skipif(
    os.environ.get("RPAFORGE_LLM_LIVE_TEST") != "1",
    reason="live LLM tests are opt-in: set RPAFORGE_LLM_LIVE_TEST=1",
)


class TestLiveOpenAICompat:
    """Live smoke test against any OpenAI-compatible endpoint."""

    def test_live_chat_completion(self) -> None:
        pytest.importorskip("httpx")
        config = resolve_llm_config()
        assert config.provider != "anthropic", (
            "set RPAFORGE_LLM_PROVIDER to an OpenAI-compatible provider"
        )
        assert config.model, "RPAFORGE_LLM_MODEL must be set for live tests"
        client = OpenAICompatClient(base_url=config.base_url, api_key=config.api_key)
        result = client.chat(
            [{"role": "user", "content": "Reply with exactly: OK"}],
            model=config.model,
            max_tokens=16,
        )
        assert result.text.strip()
        assert result.usage is not None


class TestLiveAnthropic:
    """Live smoke test against the Anthropic Messages API."""

    def test_live_chat_completion(self) -> None:
        pytest.importorskip("httpx")
        config = resolve_llm_config()
        if config.provider != "anthropic":
            pytest.skip("RPAFORGE_LLM_PROVIDER is not anthropic")
        assert config.model, "RPAFORGE_LLM_MODEL must be set for live tests"
        client = AnthropicClient(base_url=config.base_url, api_key=config.api_key)
        result = client.chat(
            [{"role": "user", "content": "Reply with exactly: OK"}],
            model=config.model,
            max_tokens=16,
        )
        assert result.text.strip()
        assert result.usage is not None
