"""Offline prompt eval for the AI library extraction contract (issue #904).

Golden-replay half of the prompt-CI harness for ``rpaforge_libraries.AI``:
recorded provider responses are replayed through the real extraction
flow, asserting parse rate, schema validity and the self-correction
retry budget without any network. Version/digest gating for the shared
templates lives in ``packages/core/tests/test_prompt_eval.py``.
"""

from __future__ import annotations

import json
from typing import Any

import pytest

from rpaforge_libraries.AI import library as ai_library_module
from rpaforge_libraries.AI.library import (
    AI,
    MAX_RETRIES,
    AIExtractionError,
    _parse_json_object,
    _validate,
)

# ---------------------------------------------------------------- fixtures

_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "vendor": {"type": "string"},
        "total": {"type": "number"},
    },
    "required": ["vendor", "total"],
}

_GOLDEN_VALID: list[str] = [
    json.dumps({"vendor": "Acme GmbH", "total": 149.99}),
    '```json\n{"vendor": "Contoso", "total": 42}\n```',
    json.dumps({"vendor": "GlobalCorp", "total": "88.5"}),
]

_GOLDEN_INVALID: list[str] = [
    "The vendor is Acme and the total is 149.99.",
    json.dumps({"vendor": "NoTotal"}),
    json.dumps(["wrong", "shape"]),
]


class _ScriptedClient:
    """Fake LLM client returning scripted responses and capturing kwargs."""

    def __init__(self, texts: list[str]) -> None:
        self._texts = list(texts)
        self.model_name = "fake-model"
        self.calls: list[dict[str, Any]] = []

    def chat(self, messages, **kwargs: Any):
        self.calls.append({"messages": [dict(m) for m in messages], **kwargs})
        from rpaforge.llm.client import LLMResult
        from rpaforge.llm.client import TokenUsage as _TokenUsage

        return LLMResult(
            text=self._texts.pop(0),
            model=self.model_name,
            usage=_TokenUsage.from_parts(10, 5),
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


# ------------------------------------------------------------------ replay


class TestGoldenReplay:
    """Recorded answers parse and validate at rate 1.0; invalid reject."""

    def test_valid_recorded_answers_parse_and_validate(self) -> None:
        for text in _GOLDEN_VALID:
            parsed = _parse_json_object(text)
            coerced, errors = _validate(parsed, _SCHEMA)
            assert not errors, (text, errors)
            assert coerced is not None
            assert coerced["vendor"]

    def test_invalid_recorded_answers_reject(self) -> None:
        # Prose and a JSON array both fail parsing (ValueError)…
        with pytest.raises(ValueError):
            _parse_json_object(_GOLDEN_INVALID[0])
        with pytest.raises(ValueError):
            _parse_json_object(_GOLDEN_INVALID[2])
        # …while the schema-miss response parses but fails validation.
        parsed = _parse_json_object(_GOLDEN_INVALID[1])
        _coerced, errors = _validate(parsed, _SCHEMA)
        assert errors


class TestExtractionFlow:
    """The full activity keeps prompt identity and retry budget contract."""

    def test_first_try_valid_single_round_trip(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        client = _ScriptedClient([_GOLDEN_VALID[0]])
        _install(monkeypatch, client)
        result = AI().extract_structured_data("INVOICE 1", _SCHEMA, model="m")
        assert result["attempts"] == 1
        assert result["warnings"] == []
        assert len(client.calls) == 1
        call = client.calls[0]
        assert call["prompt_id"] == "ai_extract.system"
        assert call["prompt_version"] == 1

    def test_self_correction_recovers_within_budget(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        client = _ScriptedClient([_GOLDEN_INVALID[1], _GOLDEN_VALID[0]])
        _install(monkeypatch, client)
        result = AI().extract_structured_data("INVOICE 1", _SCHEMA, model="m")
        assert result["attempts"] == 2
        assert result["data"]["vendor"] == "Acme GmbH"
        assert len(client.calls) == 2
        retry_message = client.calls[1]["messages"][-1]["content"]
        assert retry_message.startswith("Your previous JSON response was invalid:")
        assert retry_message.endswith("ONLY the corrected JSON object.")

    def test_retry_budget_matches_documented_max(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        client = _ScriptedClient([_GOLDEN_INVALID[0]] * (MAX_RETRIES + 2))
        _install(monkeypatch, client)
        with pytest.raises(AIExtractionError) as exc_info:
            AI().extract_structured_data("INVOICE 1", _SCHEMA, model="m", strict=True)
        assert exc_info.value.attempts == MAX_RETRIES + 1
        assert len(client.calls) == MAX_RETRIES + 1
