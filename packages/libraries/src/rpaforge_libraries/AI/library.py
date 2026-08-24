"""RPAForge AI Library - LLM-powered activities for diagram authors."""

from __future__ import annotations

import json
import logging
import os
import re
from typing import Any

from rpaforge.core.activity import activity, library, output, param, tags
from rpaforge_libraries.AI.schema import (
    coerce_with_pydantic,
    has_pydantic,
    parse_schema,
    schema_to_prompt,
    validate_against_schema,
)
from rpaforge_libraries.i18n import _

logger = logging.getLogger("rpaforge.ai")

#: Correction round-trips allowed after the first attempt. Mirrors the
#: proven validate+retry loop in ``packages/studio/electron/ai/generateDiagram.ts``.
MAX_RETRIES = 2

_FENCE_RE = re.compile(r"^```[a-zA-Z0-9_-]*\s*|\s*```$", re.MULTILINE)


class AIError(Exception):
    """Base exception for AI library errors."""


class AIDependencyError(AIError, ImportError):
    """Raised when the optional ``[llm]`` extra is missing."""


class AISchemaError(AIError):
    """Raised when ``json_schema`` is malformed or not an object schema."""


class AIExtractionError(AIError):
    """Raised in strict mode when every attempt failed validation.

    The message embeds the last validation failure so callers (and the
    debugger console) see exactly why the model output was rejected.
    """

    def __init__(self, message: str, errors: list[str], attempts: int) -> None:
        super().__init__(message)
        self.errors = list(errors)
        self.attempts = attempts


_INSTALL_HINT = _("Install it with: pip install 'rpaforge-libraries[llm]'")

_SYSTEM_PROMPT = (
    "You extract structured data from raw text. Respond with ONLY a JSON "
    "object that validates against the provided JSON Schema - no markdown "
    "fences, no commentary."
)


def _build_client(provider: str | None = None, base_url: str | None = None):
    """Build an LLM client from explicit args with ``RPAFORGE_LLM_*`` fallbacks.

    Split out as a module-level seam so tests can monkeypatch it with a
    scripted fake client instead of any HTTP machinery.
    """
    try:
        from rpaforge.llm import create_client, resolve_llm_config
    except ImportError as err:
        raise AIDependencyError(
            _("rpaforge-core LLM module is unavailable. ") + _INSTALL_HINT
        ) from err
    try:
        config = resolve_llm_config(provider=provider, base_url=base_url)
        return create_client(config)
    except Exception as err:
        error_text = str(err)
        if "pip install" in error_text or "extra" in error_text.lower():
            raise AIDependencyError(error_text) from err
        raise AIError(error_text) from err


def _strip_fences(text: str) -> str:
    """Remove a single wrapping markdown code fence if present."""
    stripped = text.strip()
    if stripped.startswith("```"):
        stripped = _FENCE_RE.sub("", stripped)
    return stripped.strip()


def _parse_json_object(text: str) -> dict[str, Any]:
    """Parse *text* into a dict, raising :class:`ValueError` when impossible."""
    candidate = _strip_fences(text)
    try:
        parsed = json.loads(candidate)
    except ValueError as err:
        raise ValueError(f"Response was not valid JSON: {err}") from err
    if not isinstance(parsed, dict):
        raise ValueError(f"Expected a JSON object, got {type(parsed).__name__}.")
    return parsed


def _validate(
    data: dict[str, Any], schema: dict[str, Any]
) -> tuple[Any | None, list[str]]:
    """Run structural validation plus optional pydantic coercion.

    Returns ``(coerced_data_or_None, errors)``. When pydantic is available,
    its lax pass repairs near-miss types first; the stdlib validator then
    runs again on the *coerced* data so rules pydantic does not encode
    (bounds, lengths) still gate strictness without blocking repairs.
    """
    structural_errors = validate_against_schema(data, schema)
    if not has_pydantic():
        return (None if structural_errors else data), structural_errors
    coerced, _pydantic_errors = coerce_with_pydantic(data, schema)
    if coerced is None:
        # Pydantic rejected the shape outright - surface the human-readable
        # stdlib errors (same rules: required keys, enums, types).
        return None, structural_errors
    residual_errors = validate_against_schema(coerced, schema)
    if residual_errors:
        return None, residual_errors
    return coerced, []


@library(name="AI", category="AI", icon="🤖")
class AI:
    """LLM-powered library - structured extraction over any provider.

    Activities call the pluggable :mod:`rpaforge.llm` client layer
    (OpenAI-compatible endpoints such as OpenAI/Ollama/vLLM plus Anthropic).
    Configuration resolves from ``RPAFORGE_LLM_PROVIDER``, ``_BASE_URL``,
    ``_MODEL`` and ``_API_KEY`` environment variables; offline runs work out
    of the box against Ollama.

    Optional dependencies are imported lazily; install them with
    ``pip install 'rpaforge-libraries[llm]'``.
    """

    @activity(name="Extract Structured Data", category="AI", timeout_ms=180000)
    @tags("ai", "llm", "extract", "json", "schema")
    @output("Dict with data, warnings, attempts, model and token usage")
    @param(
        "text", type="string", description="Raw text to extract structured data from."
    )
    @param(
        "json_schema",
        type="dict",
        description=(
            'JSON Schema the output must satisfy, e.g. {"type": "object", '
            '"properties": {...}, "required": [...]}. Accepts a dict or a JSON string.'
        ),
    )
    @param(
        "model",
        type="string",
        description="Model name override (defaults to RPAFORGE_LLM_MODEL).",
    )
    @param(
        "strict",
        type="boolean",
        description="True raises after retries are exhausted; False returns best-effort data plus warnings.",
    )
    def extract_structured_data(
        self,
        text: str,
        json_schema: str | dict[str, Any],
        model: str = "",
        strict: bool = False,
    ) -> dict[str, Any]:
        """Extract a typed object from unstructured text via an LLM.

        Builds a prompt embedding *json_schema*, requests structured output
        from the configured provider and validates each response against the
        schema. Validation failures feed the error text back to the model as
        a correction request, up to :data:`MAX_RETRIES` round-trips after
        the first attempt (same loop as Studio diagram generation).

        When pydantic is installed (``rpaforge-libraries[llm]``), responses
        are additionally coerced through an equivalent dynamic model, so
        near-miss values like ``"42"`` for an integer property are repaired.

        :param text: Raw text to extract from.
        :param json_schema: JSON Schema (dict or JSON string); root must be
            an object schema.
        :param model: Optional model override; falls back to
            ``RPAFORGE_LLM_MODEL``.
        :param strict: Raise :class:`AIExtractionError` carrying the last
            validation failure once retries are exhausted instead of
            returning a best-effort result.
        :returns: Dict with ``data`` (extracted payload), ``warnings``
            (non-fatal issues), ``attempts`` (LLM round-trips used),
            ``model`` (model reported by the provider) and ``usage``
            (accumulated prompt/completion/total tokens).
        :raises AISchemaError: If *json_schema* is malformed.
        :raises AIError: If no provider is configured or the provider call fails.
        :raises AIExtractionError: In strict mode after all attempts fail.
        """
        try:
            schema = parse_schema(json_schema)
        except ValueError as err:
            raise AISchemaError(str(err)) from err

        client = _build_client()
        # Precedence mirrors resolve_llm_config: explicit argument > env.
        resolved_model = (
            model.strip() or os.environ.get("RPAFORGE_LLM_MODEL", "").strip()
        )
        if not resolved_model:
            raise AIError(
                _(
                    "No LLM model configured. Set RPAFORGE_LLM_MODEL "
                    "or pass model= to Extract Structured Data."
                )
            )

        base_messages: list[dict[str, str]] = [
            {"role": "system", "content": _SYSTEM_PROMPT},
            {
                "role": "user",
                "content": (
                    f"{text}\n\nJSON Schema:\n{schema_to_prompt(schema)}\n\n"
                    "Return ONLY the JSON object."
                ),
            },
        ]

        last_errors: list[str] = []
        last_data: Any = {}
        usage = {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}
        reported_model = ""
        messages = list(base_messages)
        total_attempts = MAX_RETRIES + 1

        for attempt in range(1, total_attempts + 1):
            result = client.chat(
                messages,  # type: ignore[arg-type]
                model=resolved_model,
                json_mode=True,
            )
            reported_model = result.model or reported_model
            if result.usage is not None:
                usage["prompt_tokens"] += result.usage.prompt_tokens
                usage["completion_tokens"] += result.usage.completion_tokens
                usage["total_tokens"] += result.usage.total_tokens

            try:
                parsed = _parse_json_object(result.text)
            except ValueError as err:
                last_errors = [str(err)]
                last_data = {}
            else:
                validated, errors = _validate(parsed, schema)
                if not errors:
                    logger.info(
                        _(
                            "Extracted structured data in {attempt} attempt(s)",
                            attempt=attempt,
                        )
                    )
                    return {
                        "data": validated,
                        "warnings": [],
                        "attempts": attempt,
                        "model": reported_model,
                        "usage": usage,
                    }
                last_errors = errors
                last_data = parsed

            if attempt <= MAX_RETRIES:
                correction = "; ".join(last_errors)
                logger.warning(
                    _(
                        "Attempt {attempt} failed validation: {error}",
                        attempt=attempt,
                        error=correction,
                    )
                )
                messages.append({"role": "assistant", "content": result.text})
                messages.append(
                    {
                        "role": "user",
                        "content": (
                            f"Your previous JSON response was invalid: {correction} "
                            "Fix it and respond with ONLY the corrected JSON object."
                        ),
                    }
                )

        if strict:
            raise AIExtractionError(
                _(
                    "Structured extraction failed after {count} attempt(s). Last errors: {errors}",
                    count=total_attempts,
                    errors="; ".join(last_errors),
                ),
                errors=last_errors,
                attempts=total_attempts,
            )

        warnings = [
            _(
                "Best-effort result after {count} attempt(s): {errors}",
                count=total_attempts,
                errors="; ".join(last_errors),
            )
        ]
        return {
            "data": last_data,
            "warnings": warnings,
            "attempts": total_attempts,
            "model": reported_model,
            "usage": usage,
        }
