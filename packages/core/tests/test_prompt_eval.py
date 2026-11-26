"""Offline prompt evaluation harness — "prompt CI" (issue #904).

Three offline gates, no network:

1. **Version-bump gate**: the in-repo baseline pins every template's
   sha256 at its version; a template edit without a version bump (and a
   baseline refresh) fails with instructions. ``RPAFORGE_PROMPT_BASELINE_UPDATE=1``
   rewrites the baseline (update_baseline lifecycle, bench.yml precedent).
2. **Golden replay**: recorded provider responses (``golden_responses.json``)
   are replayed through the real parsers, asserting parse rate, schema
   validity and self-correction budgets per prompt contract.
3. **Flow identity**: the retry flow passes the prompt registry identity
   (``prompt_id``/``prompt_version``) down to the client, so ``llm_usage``
   telemetry can attribute runs to prompt versions.
"""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any

import pytest

from rpaforge.core.agentic import parse_agent_step
from rpaforge.diagnosis import DiagnosisError, diagnose_run, parse_diagnosis
from rpaforge.llm.client import LLMResult
from rpaforge.prompts import get_template, render_prompt, template_digest, template_ids

FIXTURES = Path(__file__).resolve().parent / "prompt_eval_fixtures"


def _load_golden() -> dict[str, dict[str, list[str]]]:
    payload = json.loads(
        (FIXTURES / "golden_responses.json").read_text(encoding="utf-8")
    )
    payload.pop("comment", None)
    return payload


class TestVersionBumpGate:
    """Every template edit must come with a version bump + baseline refresh."""

    def test_baseline_matches_registry(self) -> None:
        baseline_path = FIXTURES / "baseline.json"
        current = {
            prompt_id: {
                "version": get_template(prompt_id).version,
                "digest": template_digest(prompt_id),
            }
            for prompt_id in template_ids()
        }
        if os.environ.get("RPAFORGE_PROMPT_BASELINE_UPDATE") == "1":
            document = {
                "comment": (
                    "Prompt CI baseline (issue #904): sha256 of each "
                    "template's raw text at its pinned version. A template "
                    "change MUST bump the version in templates/<id>.json AND "
                    "refresh this file "
                    "(RPAFORGE_PROMPT_BASELINE_UPDATE=1 pytest "
                    "packages/core/tests/test_prompt_eval.py). Eval flags "
                    "prompt edits whose gate regresses."
                ),
                "templates": current,
            }
            baseline_path.write_text(
                json.dumps(document, indent=2) + "\n", encoding="utf-8"
            )
            pytest.skip("baseline rewritten")
        baseline = json.loads(baseline_path.read_text(encoding="utf-8"))["templates"]
        changed = sorted(pid for pid in current if baseline.get(pid) != current[pid])
        assert not changed, (
            "Prompt templates changed without a baseline refresh: "
            f"{changed}. Bump 'version' in the template JSON and refresh "
            "packages/core/tests/prompt_eval_fixtures/baseline.json "
            "(RPAFORGE_PROMPT_BASELINE_UPDATE=1)."
        )

    def test_simulated_edit_without_bump_is_caught(self) -> None:
        baseline = json.loads((FIXTURES / "baseline.json").read_text(encoding="utf-8"))[
            "templates"
        ]
        tampered = dict(baseline)
        tampered["ocr.transcribe"] = {"version": 1, "digest": "deadbeef"}
        current = {
            prompt_id: {
                "version": get_template(prompt_id).version,
                "digest": template_digest(prompt_id),
            }
            for prompt_id in template_ids()
        }
        changed = sorted(pid for pid in current if tampered.get(pid) != current[pid])
        assert changed == ["ocr.transcribe"]


class TestDiagnosisGoldenReplay:
    """Recorded diagnosis answers parse at rate 1.0; invalid ones reject."""

    golden = _load_golden()["diagnosis"]

    def test_valid_recorded_answers_parse(self) -> None:
        parsed = [parse_diagnosis(text) for text in self.golden["valid"]]
        assert len(parsed) == len(self.golden["valid"])
        for diagnosis in parsed:
            assert diagnosis["confidence"] in {"high", "medium", "low"}
            assert isinstance(diagnosis["proposals"], list)

    def test_valid_recorded_answers_validate_node_references(self) -> None:
        diagram = {
            "nodes": [
                {"id": "click-download"},
                {"id": "call-vendor-api"},
                {"id": "start-1"},
            ]
        }
        for text in self.golden["valid"]:
            diagnosis = parse_diagnosis(text, diagram)
            assert diagnosis["proposals"]

    def test_invalid_recorded_answers_reject(self) -> None:
        rejected = 0
        for text in self.golden["invalid"]:
            with pytest.raises(DiagnosisError):
                parse_diagnosis(text)
            rejected += 1
        assert rejected == len(self.golden["invalid"])


class TestAgenticGoldenReplay:
    """Recorded agent steps parse; structural failures reject cleanly."""

    golden = _load_golden()["agentic"]

    def test_valid_recorded_steps_parse(self) -> None:
        steps = [parse_agent_step(text) for text in self.golden["valid"]]
        assert [step.action for step in steps] == ["call", "finish", "call"]
        assert steps[0].activity == "Flow.log_message"
        assert steps[1].finish_result == "done"
        assert steps[2].activity == "Flow.timestamp"

    def test_invalid_recorded_steps_reject(self) -> None:
        for text in self.golden["invalid"]:
            with pytest.raises(ValueError):
                parse_agent_step(text)


class _ScriptedClient:
    """Fake LLM client scripting answers and capturing chat kwargs."""

    def __init__(self, texts: list[str]) -> None:
        self._texts = list(texts)
        self.calls: list[dict[str, Any]] = []
        self.model_name = "diag-model"

    def chat(self, messages, *, model="", **kwargs: Any):
        self.calls.append({"messages": [dict(m) for m in messages], **kwargs})
        return LLMResult(text=self._texts.pop(0), model=model, usage=None)


_BUNDLE: dict[str, Any] = {
    "error": "Click failed: selector not found",
    "failing_step": {"node_id": "click-download", "activity": "WebUI.Click Element"},
    "diagram": {"nodes": [{"id": "click-download"}]},
}

_VALID_ANSWER = json.dumps(
    {
        "root_cause": "selector absent",
        "confidence": "medium",
        "explanation": "x",
        "proposals": [],
    }
)


class TestDiagnosisRetryFlow:
    """Self-correction stays within budget and carries prompt identity."""

    def test_retry_within_budget_and_self_corrects(self) -> None:
        client = _ScriptedClient(["not json at all", _VALID_ANSWER])
        diagnosis = diagnose_run(_BUNDLE, client=client, max_attempts=2)
        assert diagnosis["root_cause"] == "selector absent"
        assert len(client.calls) == 2

    def test_every_call_carries_prompt_identity(self) -> None:
        client = _ScriptedClient(["not json at all", _VALID_ANSWER])
        diagnose_run(_BUNDLE, client=client, max_attempts=2)
        for call in client.calls:
            assert call["prompt_id"] == "diagnosis.system"
            assert call["prompt_version"] == 1
            assert (
                call["messages"][0]["content"] == render_prompt("diagnosis.system").text
            )

    def test_retry_message_is_the_registry_template(self) -> None:
        with pytest.raises(DiagnosisError) as exc_info:
            parse_diagnosis("not json at all")
        client = _ScriptedClient(["not json at all", _VALID_ANSWER])
        diagnose_run(_BUNDLE, client=client, max_attempts=2)
        expected_retry = render_prompt(
            "diagnosis.retry", error=str(exc_info.value)
        ).text
        assert client.calls[1]["messages"][-1]["content"] == expected_retry

    def test_exhausted_budget_raises_after_last_attempt(self) -> None:
        client = _ScriptedClient(["bad", "also bad"])
        with pytest.raises(DiagnosisError, match="after retries"):
            diagnose_run(_BUNDLE, client=client, max_attempts=2)
        assert len(client.calls) == 2
