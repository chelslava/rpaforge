"""Tests for rpaforge.llm client contracts, errors, and configuration."""

from __future__ import annotations

import subprocess
import sys

import pytest

from rpaforge.llm import (
    DEFAULT_MAX_TOKENS,
    AnthropicClient,
    LLMAuthError,
    LLMClient,
    LLMConfig,
    LLMConnectionError,
    LLMError,
    LLMResponseError,
    LLMResult,
    OpenAICompatClient,
    TokenUsage,
    create_client,
    resolve_llm_config,
)

LLM_ENV_VARS = (
    "RPAFORGE_LLM_PROVIDER",
    "RPAFORGE_LLM_BASE_URL",
    "RPAFORGE_LLM_MODEL",
    "RPAFORGE_LLM_API_KEY",
)


def _clear_llm_env(monkeypatch: pytest.MonkeyPatch) -> None:
    for name in LLM_ENV_VARS:
        monkeypatch.delenv(name, raising=False)


class TestLLMExceptionHierarchy:
    """Tests for the typed exception hierarchy."""

    def test_all_errors_derive_from_base(self) -> None:
        for exc_type in (LLMConnectionError, LLMAuthError, LLMResponseError):
            assert issubclass(exc_type, LLMError)

    def test_base_error_is_exception(self) -> None:
        assert issubclass(LLMError, Exception)


class TestTokenUsageAndResult:
    """Tests for result dataclasses."""

    def test_token_usage_from_parts_computes_total(self) -> None:
        usage = TokenUsage.from_parts(5, 7)
        assert usage.prompt_tokens == 5
        assert usage.completion_tokens == 7
        assert usage.total_tokens == 12

    def test_llm_result_defaults(self) -> None:
        result = LLMResult(text="hi")
        assert result.text == "hi"
        assert result.model == ""
        assert result.usage is None
        assert result.truncated is False

    def test_default_max_tokens_constant(self) -> None:
        assert DEFAULT_MAX_TOKENS == 1024


class TestResolveLLMConfig:
    """Tests for RPAFORGE_LLM_* environment-driven configuration."""

    def test_missing_provider_raises(self, monkeypatch: pytest.MonkeyPatch) -> None:
        _clear_llm_env(monkeypatch)
        with pytest.raises(LLMError, match="RPAFORGE_LLM_PROVIDER"):
            resolve_llm_config()

    def test_explicit_openai_provider_gets_default_url(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        _clear_llm_env(monkeypatch)
        config = resolve_llm_config(provider="OpenAI")
        assert config.provider == "openai"
        assert config.base_url == "https://api.openai.com/v1"

    def test_ollama_provider_default_base_url(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        _clear_llm_env(monkeypatch)
        config = resolve_llm_config(provider="ollama")
        assert config.base_url == "http://localhost:11434/v1"

    def test_env_vars_are_used(self, monkeypatch: pytest.MonkeyPatch) -> None:
        _clear_llm_env(monkeypatch)
        monkeypatch.setenv("RPAFORGE_LLM_PROVIDER", "vllm")
        monkeypatch.setenv("RPAFORGE_LLM_BASE_URL", "http://gw.local/v1/")
        monkeypatch.setenv("RPAFORGE_LLM_MODEL", "llama-3")
        monkeypatch.setenv("RPAFORGE_LLM_API_KEY", "sk-env-key")
        config = resolve_llm_config()
        assert config.provider == "vllm"
        assert config.base_url == "http://gw.local/v1"
        assert config.model == "llama-3"
        assert config.api_key == "sk-env-key"

    def test_explicit_args_override_env(self, monkeypatch: pytest.MonkeyPatch) -> None:
        _clear_llm_env(monkeypatch)
        monkeypatch.setenv("RPAFORGE_LLM_PROVIDER", "ollama")
        monkeypatch.setenv("RPAFORGE_LLM_MODEL", "env-model")
        config = resolve_llm_config(provider="openai", model="explicit-model")
        assert config.provider == "openai"
        assert config.model == "explicit-model"

    def test_unknown_provider_with_base_url_is_accepted(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        _clear_llm_env(monkeypatch)
        config = resolve_llm_config(
            provider="my-gateway", base_url="https://gw.internal/v1"
        )
        assert config.provider == "my-gateway"
        assert config.base_url == "https://gw.internal/v1"

    def test_unknown_provider_without_base_url_raises(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        _clear_llm_env(monkeypatch)
        with pytest.raises(LLMError, match="RPAFORGE_LLM_BASE_URL"):
            resolve_llm_config(provider="nope")


class TestCreateClient:
    """Tests for the provider-to-adapter factory."""

    def test_anthropic_config_builds_anthropic_client(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        pytest.importorskip("httpx")
        _clear_llm_env(monkeypatch)
        client = create_client(
            LLMConfig(
                provider="anthropic",
                base_url="https://api.anthropic.com",
                api_key="k",
            )
        )
        assert isinstance(client, AnthropicClient)

    def test_openai_compatible_config_builds_compat_client(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        pytest.importorskip("httpx")
        _clear_llm_env(monkeypatch)
        client = create_client(
            LLMConfig(
                provider="ollama",
                base_url="http://localhost:11434/v1",
            )
        )
        assert isinstance(client, OpenAICompatClient)

    def test_runtime_checkable_protocol_satisfied(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        pytest.importorskip("httpx")
        _clear_llm_env(monkeypatch)
        client = create_client(
            LLMConfig(provider="openai", base_url="https://api.openai.com/v1")
        )
        assert isinstance(client, LLMClient)

    def test_unknown_provider_without_url_raises(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        pytest.importorskip("httpx")
        _clear_llm_env(monkeypatch)
        with pytest.raises(LLMError, match="base URL"):
            create_client(LLMConfig(provider="ghost"))


class TestLazyHttpxImport:
    """Tests for the optional httpx dependency behavior."""

    def test_instantiation_without_httpx_raises_actionable_error(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.setitem(sys.modules, "httpx", None)
        with pytest.raises(LLMError, match=r"rpaforge-core\[llm\]"):
            OpenAICompatClient()

    def test_anthropic_instantiation_without_httpx_raises(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.setitem(sys.modules, "httpx", None)
        with pytest.raises(LLMError, match=r"rpaforge-core\[llm\]"):
            AnthropicClient()

    def test_package_imports_cleanly_without_httpx(self) -> None:
        code = (
            "import sys; sys.modules['httpx'] = None; "
            "import rpaforge.llm; "
            "print(len(rpaforge.llm.__all__))"
        )
        proc = subprocess.run(  # noqa: S603
            [sys.executable, "-c", code],
            capture_output=True,
            text=True,
            timeout=60,
            check=False,
        )
        assert proc.returncode == 0, proc.stderr
        assert proc.stdout.strip().isdigit()
