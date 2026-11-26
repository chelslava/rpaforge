"""Tests for the versioned prompt registry (issue #904)."""

import hashlib
import json

import pytest

from rpaforge.prompts import (
    PromptError,
    get_template,
    render_prompt,
    template_digest,
    template_ids,
)

EXPECTED_IDS = (
    "agentic.system_json",
    "agentic.system_native",
    "agentic.user",
    "ai_extract.correction",
    "ai_extract.system",
    "ai_extract.user",
    "diagnosis.retry",
    "diagnosis.system",
    "llm_decision.system",
    "llm_decision.user",
    "ocr.transcribe",
    "vlm_grounding.locate",
    "vlm_grounding.system",
)


class TestRegistryInventory:
    """Registry contents: every template loads and is well-formed."""

    def test_all_templates_registered(self) -> None:
        assert template_ids() == EXPECTED_IDS

    def test_every_template_is_v1_and_declares_matching_placeholders(self) -> None:
        from rpaforge.prompts.registry import _PLACEHOLDER_RE

        for prompt_id in template_ids():
            template = get_template(prompt_id)
            assert template.version == 1
            assert template.description
            assert set(_PLACEHOLDER_RE.findall(template.template)) == set(
                template.variables
            )

    def test_unknown_id_raises(self) -> None:
        with pytest.raises(PromptError, match="Unknown prompt id"):
            render_prompt("no.such_prompt")

    def test_invalid_id_shape_raises(self) -> None:
        with pytest.raises(PromptError, match="Invalid prompt id"):
            render_prompt("../etc/passwd")


class TestFailClosedRender:
    """Render validates the variable set strictly."""

    def test_missing_variable_raises(self) -> None:
        with pytest.raises(PromptError, match="missing .*'element'"):
            render_prompt("vlm_grounding.locate")

    def test_extra_variable_raises(self) -> None:
        with pytest.raises(PromptError, match="unexpected"):
            render_prompt("vlm_grounding.locate", element="x", oops="y")

    def test_no_leftover_placeholders_after_render(self) -> None:
        rendered = render_prompt("llm_decision.user", question="Q", options="O1\nO2")
        assert "{{" not in rendered.text and "}}" not in rendered.text


class TestRenderedIdentity:
    """Rendered prompts carry the telemetry identity."""

    def test_identity_fields(self) -> None:
        rendered = render_prompt("diagnosis.retry", error="bad")
        assert rendered.prompt_id == "diagnosis.retry"
        assert rendered.prompt_version == 1
        assert rendered.text.startswith("Your answer was rejected: bad.")


# Byte-identical regression pins (issue #904 acceptance): v1 templates must
# render exactly the strings that existed inline before the migration. Each
# expected value below is the verbatim concatenation of the original Python
# string literals, with sample values substituted for the f-string holes.
V1_GOLDEN: dict[str, tuple[dict[str, str], str]] = {
    "vlm_grounding.system": (
        {},
        "You locate UI elements in screenshots. Respond with ONLY a JSON "
        'object: {"bbox": [x, y, width, height], "confidence": 0..1} where '
        "bbox is the pixel region of the element matching the user's "
        "description. No markdown fences, no commentary.",
    ),
    "vlm_grounding.locate": (
        {"element": "the Submit button"},
        "Locate this element: the Submit button",
    ),
    "ai_extract.system": (
        {},
        "You extract structured data from raw text. Respond with ONLY a JSON "
        "object that validates against the provided JSON Schema - no markdown "
        "fences, no commentary.",
    ),
    "ai_extract.user": (
        {"text": "TOTAL: 42", "schema": '{"type": "object"}'},
        'TOTAL: 42\n\nJSON Schema:\n{"type": "object"}\n\nReturn ONLY the JSON object.',
    ),
    "ai_extract.correction": (
        {"errors": "missing 'total'"},
        "Your previous JSON response was invalid: missing 'total' "
        "Fix it and respond with ONLY the corrected JSON object.",
    ),
    "ocr.transcribe": (
        {},
        "Transcribe ALL text visible in this document page image. "
        "Preserve reading order and line breaks. Output ONLY the transcribed "
        "text - no commentary, no markdown fences.",
    ),
    "llm_decision.system": (
        {},
        "You route workflow decisions. Pick the single best "
        'option and respond with ONLY a JSON object: {"option": '
        '"<id>"}. No markdown fences, no commentary.',
    ),
    "llm_decision.user": (
        {"question": "Continue?", "options": '- id="yes"'},
        'Continue?\n\nOptions:\n- id="yes"',
    ),
    "agentic.system_json": (
        {},
        "You are an automation agent. Reach the user's goal by "
        "calling allowed activities step by step. Respond with "
        'ONLY a JSON object: {"thought": "...", "action": '
        '"call", "activity": "Library.activity_id", "args": '
        '{...}} or {"thought": "...", "action": "finish", '
        '"result": ...}. No markdown fences, no commentary.',
    ),
    "agentic.system_native": (
        {},
        "You are an automation agent. Reach the user's goal by "
        "calling the provided tools step by step; call report_finish "
        "with the final answer once the goal is reached. "
        "No commentary outside tool calls.",
    ),
    "agentic.user": (
        {"goal": "open the app", "catalog": "[]"},
        "Goal: open the app\n\nTool catalog (ONLY these may be called):\n[]",
    ),
    "diagnosis.system": (
        {},
        "You diagnose a failed RPA process run. You receive a redacted JSON "
        "bundle: the error, the failing step, recent audit steps and events, "
        "the current diagram (nodes with ids and params) and any selector "
        'heal proposals. Respond with ONLY one JSON object: {"root_cause": '
        '"...", "confidence": "high"|"medium"|"low", '
        '"explanation": "...", "proposals": [...]}. Each proposal is one '
        'of: {"type": "param_change", "node_id", "param", '
        '"new_value"} | {"type": "selector_update", "node_id", '
        '"new_selector"} | {"type": "wrap_retry", "node_id", '
        '"retry_count", "retry_interval_s"} | {"type": "wrap_trycatch", '
        '"node_id", "exception_type"} | {"type": "insert_precondition", '
        '"after_node_id", "library", "activity", "args", "label"}. '
        "Only reference node ids that exist in the diagram. No markdown "
        "fences, no commentary.",
    ),
    "diagnosis.retry": (
        {"error": "Diagnosis 'root_cause' must be a non-empty string"},
        "Your answer was rejected: Diagnosis 'root_cause' must be a "
        "non-empty string. Respond again with ONLY the corrected JSON object.",
    ),
}


class TestV1ByteIdentical:
    """v1 templates render byte-identically to the pre-migration strings."""

    def test_all_ids_have_golden_pins(self) -> None:
        assert set(V1_GOLDEN) == set(EXPECTED_IDS)

    def test_rendered_output_matches_inline_predecessors(self) -> None:
        for prompt_id, (variables, expected) in V1_GOLDEN.items():
            rendered = render_prompt(prompt_id, **variables)
            assert rendered.text == expected, prompt_id


class TestTemplateDigest:
    """Digests are stable sha256 of the raw template text."""

    def test_digest_is_sha256_of_template(self) -> None:
        template = get_template("ocr.transcribe")
        expected = hashlib.sha256(template.template.encode("utf-8")).hexdigest()
        assert template_digest("ocr.transcribe") == expected

    def test_digest_changes_when_template_text_changes(self) -> None:
        original = get_template("ocr.transcribe").template
        patched = original.replace("ALL text", "ALL visible text")
        assert patched != original
        assert hashlib.sha256(patched.encode("utf-8")).hexdigest() != template_digest(
            "ocr.transcribe"
        )

    def test_template_payload_shape(self) -> None:
        from rpaforge.prompts import registry as registry_module

        resource = (
            registry_module.resources.files(registry_module._PACKAGE)
            / registry_module._TEMPLATES_DIR
            / "diagnosis.system.json"
        )
        payload = json.loads(resource.read_text(encoding="utf-8"))
        assert payload["id"] == "diagnosis.system"
        assert payload["version"] == 1
        assert payload["variables"] == []
