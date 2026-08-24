"""Tests for the AI library (issue #734 - Extract Structured Data)."""

from __future__ import annotations

import json
import os
from typing import Any

import pytest

from rpaforge.core.activity import ACTIVITY_REGISTRY, LIBRARY_REGISTRY
from rpaforge.llm.client import LLMResult, TokenUsage
from rpaforge_libraries.AI import (
    AI,
    MAX_RETRIES,
    AIExtractionError,
    AISchemaError,
)
from rpaforge_libraries.AI import library as ai_library_module
from rpaforge_libraries.AI.schema import (
    has_pydantic,
    parse_schema,
    validate_against_schema,
)

INVOICE_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "vendor": {"type": "string"},
        "total": {"type": "number"},
        "items": {
            "type": "array",
            "items": {"type": "object", "properties": {"sku": {"type": "string"}}},
        },
    },
    "required": ["vendor", "total"],
}


class _ScriptedClient:
    """Fake LLM client returning scripted responses and capturing prompts."""

    def __init__(self, texts: list[str], model: str = "fake-model") -> None:
        self._texts = list(texts)
        self.model_name = model
        self.calls: list[list[dict[str, str]]] = []

    def chat(self, messages, **_kwargs: Any):
        self.calls.append([dict(message) for message in messages])
        return LLMResult(
            text=self._texts.pop(0),
            model=self.model_name,
            usage=TokenUsage.from_parts(10, 5),
        )


def _install(monkeypatch: pytest.MonkeyPatch, client: _ScriptedClient) -> None:
    def _fake_build(*_args: Any, **_kwargs: Any) -> _ScriptedClient:
        return client

    monkeypatch.setattr(ai_library_module, "_build_client", _fake_build)


@pytest.fixture(autouse=True)
def _clear_llm_env(monkeypatch: pytest.MonkeyPatch) -> None:
    for var in (
        "RPAFORGE_LLM_PROVIDER",
        "RPAFORGE_LLM_BASE_URL",
        "RPAFORGE_LLM_MODEL",
        "RPAFORGE_LLM_API_KEY",
    ):
        monkeypatch.delenv(var, raising=False)


class TestRegistration:
    """Library and activity registration."""

    def test_ai_library_registered(self) -> None:
        assert "AI" in LIBRARY_REGISTRY

    def test_extract_activity_registered(self) -> None:
        meta = ACTIVITY_REGISTRY["AI.extract_structured_data"]
        assert meta.name == "Extract Structured Data"
        param_names = {param["name"] for param in meta.params}
        assert {"text", "json_schema", "model", "strict"} <= param_names


class TestValidExtraction:
    """Acceptance: valid extraction against a mocked provider."""

    def test_valid_first_attempt(self, monkeypatch: pytest.MonkeyPatch) -> None:
        payload = json.dumps({"vendor": "Acme", "total": 42.5, "items": []})
        client = _ScriptedClient([payload])
        _install(monkeypatch, client)

        result = AI().extract_structured_data(
            "invoice text", INVOICE_SCHEMA, model="m1"
        )

        assert result["data"] == {"vendor": "Acme", "total": 42.5, "items": []}
        assert result["warnings"] == []
        assert result["attempts"] == 1
        assert result["model"] == "fake-model"
        assert result["usage"] == {
            "prompt_tokens": 10,
            "completion_tokens": 5,
            "total_tokens": 15,
        }

    def test_prompt_embeds_schema_and_json_mode_requested(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        client = _ScriptedClient(['{"vendor": "X", "total": 1}'])
        _install(monkeypatch, client)
        AI().extract_structured_data("t", INVOICE_SCHEMA, model="m")
        first = client.calls[0]
        assert first[0]["role"] == "system"
        assert "JSON Schema" in first[1]["content"]
        assert '"required":["vendor","total"]' in first[1]["content"].replace(" ", "")

    def test_markdown_fences_stripped(self, monkeypatch: pytest.MonkeyPatch) -> None:
        fenced = '```json\n{"vendor": "A", "total": 3}\n```'
        client = _ScriptedClient([fenced])
        _install(monkeypatch, client)
        result = AI().extract_structured_data("t", INVOICE_SCHEMA, model="m")
        assert result["attempts"] == 1
        assert result["data"]["vendor"] == "A"

    def test_json_string_schema_accepted(self, monkeypatch: pytest.MonkeyPatch) -> None:
        client = _ScriptedClient(['{"vendor": "B", "total": 9}'])
        _install(monkeypatch, client)
        result = AI().extract_structured_data(
            "t", json.dumps(INVOICE_SCHEMA), model="m"
        )
        assert result["attempts"] == 1


class TestCorrectionLoop:
    """Acceptance: invalid output triggers correction round-trip then success."""

    def test_invalid_then_valid_succeeds_on_second_attempt(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        bad = json.dumps({"vendor": "Acme"})
        good = json.dumps({"vendor": "Acme", "total": 10})
        client = _ScriptedClient([bad, good])
        _install(monkeypatch, client)

        result = AI().extract_structured_data("t", INVOICE_SCHEMA, model="m")

        assert result["attempts"] == 2
        assert result["data"] == {"vendor": "Acme", "total": 10.0}
        assert len(client.calls) == 2

    def test_correction_message_carries_validation_errors(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        bad = json.dumps({"vendor": "Acme"})
        good = json.dumps({"vendor": "Acme", "total": 10})
        client = _ScriptedClient([bad, good])
        _install(monkeypatch, client)
        AI().extract_structured_data("t", INVOICE_SCHEMA, model="m")

        correction_turns = [
            m
            for m in client.calls[1]
            if "previous JSON response was invalid" in m["content"]
        ]
        assert len(correction_turns) == 1
        assert "missing required property 'total'" in correction_turns[0]["content"]

    def test_correction_includes_previous_assistant_reply(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        bad = json.dumps({"vendor": "Acme"})
        good = json.dumps({"vendor": "Acme", "total": 10})
        client = _ScriptedClient([bad, good])
        _install(monkeypatch, client)
        AI().extract_structured_data("t", INVOICE_SCHEMA, model="m")
        roles = [m["role"] for m in client.calls[1]]
        assert roles == ["system", "user", "assistant", "user"]

    def test_unparsable_then_valid(self, monkeypatch: pytest.MonkeyPatch) -> None:
        client = _ScriptedClient(["not json at all", '{"vendor": "V", "total": 0}'])
        _install(monkeypatch, client)
        result = AI().extract_structured_data("t", INVOICE_SCHEMA, model="m")
        assert result["attempts"] == 2
        assert result["data"]["vendor"] == "V"


class TestStrictMode:
    """Acceptance: strict=True raises typed error carrying last failure."""

    def test_raises_after_exhaustion(self, monkeypatch: pytest.MonkeyPatch) -> None:
        always_bad = json.dumps({"vendor": "Acme"})
        client = _ScriptedClient([always_bad] * (MAX_RETRIES + 1))
        _install(monkeypatch, client)

        with pytest.raises(AIExtractionError) as excinfo:
            AI().extract_structured_data("t", INVOICE_SCHEMA, model="m", strict=True)

        assert excinfo.value.attempts == MAX_RETRIES + 1
        assert excinfo.value.errors
        assert "missing required property 'total'" in str(excinfo.value)
        assert len(client.calls) == MAX_RETRIES + 1


class TestBestEffortMode:
    """strict=False returns best-effort data plus warnings."""

    def test_parseable_but_invalid_returns_data_with_warnings(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        bad = json.dumps({"vendor": "Acme"})
        client = _ScriptedClient([bad] * (MAX_RETRIES + 1))
        _install(monkeypatch, client)

        result = AI().extract_structured_data("t", INVOICE_SCHEMA, model="m")

        assert result["attempts"] == MAX_RETRIES + 1
        assert result["data"] == {"vendor": "Acme"}
        assert result["warnings"]
        assert "missing required property 'total'" in result["warnings"][0]

    def test_unparsable_returns_empty_data(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        client = _ScriptedClient(["garbage"] * (MAX_RETRIES + 1))
        _install(monkeypatch, client)
        result = AI().extract_structured_data("t", INVOICE_SCHEMA, model="m")
        assert result["data"] == {}
        assert "not valid JSON" in result["warnings"][0]


class TestSchemaErrors:
    """Malformed json_schema raises typed errors before any LLM call."""

    @pytest.mark.parametrize(
        ("raw", "fragment"),
        [
            ("{not json", "not valid JSON"),
            ('["array"]', "JSON object"),
            ({"type": "string"}, "root must have"),
            (123, "dict or a JSON string"),
        ],
    )
    def test_invalid_schema_raises_typed_error(self, raw: Any, fragment: str) -> None:
        with pytest.raises(AISchemaError, match=fragment):
            AI().extract_structured_data("t", raw, model="m")


class TestConfigurationErrors:
    """Missing configuration produces actionable typed errors."""

    def test_missing_model_raises_actionable_error(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        client = _ScriptedClient([])
        _install(monkeypatch, client)
        with pytest.raises(Exception, match="RPAFORGE_LLM_MODEL"):
            AI().extract_structured_data("t", INVOICE_SCHEMA)

    def test_missing_provider_raises_actionable_error(self) -> None:
        # Real _build_client against a cleared environment (autouse fixture).
        with pytest.raises(ai_library_module.AIError, match="[Pp]rovider"):
            ai_library_module._build_client()


class TestPydanticCoercion:
    """Optional pydantic layer repairs near-miss values."""

    @pytest.mark.skipif(not has_pydantic(), reason="pydantic not installed")
    def test_numeric_string_coerced_to_number(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        payload = json.dumps({"vendor": "Acme", "total": "42.5"})
        client = _ScriptedClient([payload])
        _install(monkeypatch, client)

        result = AI().extract_structured_data("t", INVOICE_SCHEMA, model="m")

        assert result["attempts"] == 1
        assert result["data"]["total"] == 42.5
        assert isinstance(result["data"]["total"], float)

    def test_stdlib_validator_rejects_wrong_types_without_pydantic_path(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        payload = json.dumps({"vendor": "Acme", "total": "42.5"})
        # Patch the name the library actually calls (imported directly).
        monkeypatch.setattr(ai_library_module, "has_pydantic", lambda: False)
        client = _ScriptedClient([payload] * (MAX_RETRIES + 1))
        _install(monkeypatch, client)

        result = AI().extract_structured_data("t", INVOICE_SCHEMA, model="m")

        assert result["attempts"] == MAX_RETRIES + 1
        assert "expected number" in result["warnings"][0]


class TestMockTransportEndToEnd:
    """Full path through a real adapter over httpx.MockTransport."""

    def test_openai_compat_mock_transport(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        httpx = pytest.importorskip("httpx")

        def handler(request: httpx.Request) -> httpx.Response:
            body = json.loads(request.content)
            assert body["model"] == "mock-gpt"
            completion = json.dumps({"vendor": "MockCo", "total": 7})
            return httpx.Response(
                200,
                json={
                    "choices": [{"message": {"content": completion}}],
                    "model": "mock-gpt",
                    "usage": {"prompt_tokens": 4, "completion_tokens": 6},
                },
            )

        from rpaforge.llm import OpenAICompatClient

        transport = httpx.MockTransport(handler)
        client = OpenAICompatClient(
            base_url="http://mock/v1", api_key="k", transport=transport
        )

        def _fake_build(*_args: Any, **_kwargs: Any) -> Any:
            return client

        monkeypatch.setattr(ai_library_module, "_build_client", _fake_build)

        result = AI().extract_structured_data("t", INVOICE_SCHEMA, model="mock-gpt")

        assert result["attempts"] == 1
        assert result["data"] == {"vendor": "MockCo", "total": 7.0}


class TestOllamaOfflineOptIn:
    """Opt-in integration against a live Ollama endpoint."""

    @pytest.mark.skipif(
        not os.environ.get("RPAFORGE_TEST_OLLAMA"),
        reason="set RPAFORGE_TEST_OLLAMA=1 with Ollama running to enable",
    )
    def test_offline_extraction_via_ollama(self) -> None:
        os.environ["RPAFORGE_LLM_PROVIDER"] = "ollama"
        os.environ.setdefault("RPAFORGE_LLM_MODEL", "llama3.2")
        schema = {
            "type": "object",
            "properties": {"city": {"type": "string"}},
            "required": ["city"],
        }
        result = AI().extract_structured_data(
            "The company headquarters are located in Berlin.", schema, strict=True
        )
        assert result["data"]["city"].strip() == "Berlin"


class TestSchemaModuleUnit:
    """Direct unit coverage for the validator helpers."""

    def test_validate_enum(self) -> None:
        schema = {
            "type": "object",
            "properties": {"status": {"enum": ["open", "closed"]}},
        }
        assert validate_against_schema({"status": "open"}, schema) == []
        errors = validate_against_schema({"status": "unknown"}, schema)
        assert errors and "'unknown'" in errors[0]

    def test_validate_nested_array_index_paths(self) -> None:
        schema = {
            "type": "object",
            "properties": {"rows": {"type": "array", "items": {"type": "integer"}}},
        }
        errors = validate_against_schema({"rows": [1, "two", 3]}, schema)
        assert errors == ["rows[1]: expected integer, got string."]

    def test_validate_bounds(self) -> None:
        schema = {"type": "number", "minimum": 1, "maximum": 10}
        assert validate_against_schema(5.5, schema) == []
        assert validate_against_schema(0, schema)
        assert validate_against_schema(11, schema)

    def test_parse_schema_passthrough_dict(self) -> None:
        assert parse_schema(INVOICE_SCHEMA) is INVOICE_SCHEMA
