"""Diagnosis engine: LLM call, fail-closed parsing, artifacts (issue #906).

The model receives the redacted bundle and must answer with one JSON
object matching :data:`DIAGNOSIS_SCHEMA`: a root-cause hypothesis plus
typed fix proposals (``param_change``, ``selector_update``,
``wrap_retry``, ``wrap_trycatch``, ``insert_precondition``). Parsing is
fail-closed — unknown proposal types, missing fields or references to
node ids absent from the diagram reject the answer, and the engine
retries once with the validation error fed back before giving up.
"""

from __future__ import annotations

import json
import logging
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

logger = logging.getLogger("rpaforge.diagnosis")

#: NDJSON event name for a produced diagnosis (healing precedent).
EVENT_DIAGNOSIS_PROPOSED = "diagnosis_proposed"

#: Proposal types accepted in v1 (issue #906 proposal list).
PROPOSAL_TYPES = (
    "param_change",
    "selector_update",
    "wrap_retry",
    "wrap_trycatch",
    "insert_precondition",
)

#: Required fields per proposal type (name -> primitive type).
_PROPOSAL_REQUIRED: dict[str, dict[str, type]] = {
    "param_change": {"node_id": str, "param": str},
    "selector_update": {"node_id": str, "new_selector": str},
    "wrap_retry": {"node_id": str},
    "wrap_trycatch": {"node_id": str},
    "insert_precondition": {
        "after_node_id": str,
        "library": str,
        "activity": str,
    },
}

_CONFIDENCE_LEVELS = ("high", "medium", "low")

_JSON_FENCE_RE = re.compile(r"^```[a-zA-Z0-9_-]*\s*|\s*```$", re.MULTILINE)

_SYSTEM_PROMPT = (
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
    "fences, no commentary."
)


class DiagnosisError(Exception):
    """Raised when the model answer cannot be parsed or validated."""


def _strip_fences(text: str) -> str:
    """Remove markdown fences the model may add despite instructions."""
    return _JSON_FENCE_RE.sub("", text.strip()).strip()


def _diagram_node_ids(diagram: dict[str, Any] | None) -> set[str] | None:
    """Extract node ids from a studio diagram document, if parseable."""
    if not isinstance(diagram, dict):
        return None
    nodes = diagram.get("nodes")
    if not isinstance(nodes, list):
        return None
    ids: set[str] = set()
    for node in nodes:
        if isinstance(node, dict) and isinstance(node.get("id"), str):
            ids.add(node["id"])
    return ids


def _validate_proposal(raw: Any, node_ids: set[str] | None) -> dict[str, Any]:
    """Validate one proposal object, fail-closed."""
    if not isinstance(raw, dict):
        raise DiagnosisError(f"Proposal is not an object: {raw!r}")
    proposal_type = raw.get("type")
    if proposal_type not in _PROPOSAL_REQUIRED:
        raise DiagnosisError(
            f"Unknown proposal type {proposal_type!r}; expected one of "
            f"{', '.join(PROPOSAL_TYPES)}"
        )
    for field_name, field_type in _PROPOSAL_REQUIRED[proposal_type].items():
        value = raw.get(field_name)
        if value is None or not isinstance(value, field_type):
            raise DiagnosisError(
                f"Proposal '{proposal_type}' field '{field_name}' must be "
                f"{field_type.__name__}, got {value!r}"
            )
    id_field = "after_node_id" if proposal_type == "insert_precondition" else "node_id"
    if node_ids is not None and raw[id_field] not in node_ids:
        raise DiagnosisError(
            f"Proposal '{proposal_type}' references unknown node id '{raw[id_field]}'"
        )
    return raw


def parse_diagnosis(text: str, diagram: dict[str, Any] | None = None) -> dict[str, Any]:
    """Parse and validate one model answer into a diagnosis dict.

    :param text: Raw model output (JSON, fences tolerated).
    :param diagram: Optional diagram document; when present, proposal
        node references are validated against it.
    :raises DiagnosisError: On unparseable JSON or any schema violation.
    """
    try:
        parsed = json.loads(_strip_fences(text))
    except ValueError as err:
        raise DiagnosisError(f"Diagnosis answer was not valid JSON: {err}") from err
    if not isinstance(parsed, dict):
        raise DiagnosisError(
            f"Diagnosis answer must be a JSON object, got {type(parsed).__name__}"
        )

    root_cause = parsed.get("root_cause")
    confidence = parsed.get("confidence")
    explanation = parsed.get("explanation")
    proposals_raw = parsed.get("proposals")
    if not isinstance(root_cause, str) or not root_cause.strip():
        raise DiagnosisError("Diagnosis 'root_cause' must be a non-empty string")
    if confidence not in _CONFIDENCE_LEVELS:
        raise DiagnosisError(
            f"Diagnosis 'confidence' must be one of {', '.join(_CONFIDENCE_LEVELS)}"
        )
    if not isinstance(explanation, str):
        raise DiagnosisError("Diagnosis 'explanation' must be a string")
    if not isinstance(proposals_raw, list):
        raise DiagnosisError("Diagnosis 'proposals' must be a list")

    node_ids = _diagram_node_ids(diagram)
    proposals = [_validate_proposal(item, node_ids) for item in proposals_raw]

    return {
        "root_cause": root_cause.strip(),
        "confidence": confidence,
        "explanation": explanation,
        "proposals": proposals,
    }


def _build_client(model: str | None = None) -> tuple[Any, str]:
    """Build an LLM client from ``RPAFORGE_LLM_*`` config (test seam)."""
    from rpaforge.llm import create_client, resolve_llm_config

    config = resolve_llm_config()
    return create_client(config), model or config.model


def diagnose_run(
    bundle: dict[str, Any],
    *,
    client: Any | None = None,
    model: str | None = None,
    max_attempts: int = 2,
) -> dict[str, Any]:
    """Diagnose one failed run from its redacted bundle.

    :param bundle: Output of :func:`~rpaforge.diagnosis.bundle.build_diagnosis_bundle`.
    :param client: LLM client override (tests inject scripted fakes);
        defaults to the ``RPAFORGE_LLM_*``-resolved client.
    :param model: Model override.
    :param max_attempts: Total attempts including the self-correction retry.
    :returns: Diagnosis dict with ``model``/``usage`` metadata attached.
    :raises DiagnosisError: When every attempt failed validation.
    """
    if client is None:
        client, model = _build_client(model)
    model = model or ""

    messages: list[dict[str, str]] = [
        {"role": "system", "content": _SYSTEM_PROMPT},
        {
            "role": "user",
            "content": json.dumps(bundle, ensure_ascii=False, default=str),
        },
    ]

    last_error: DiagnosisError | None = None
    for _ in range(max(1, max_attempts)):
        result = client.chat(messages, model=model, json_mode=True)
        try:
            diagnosis = parse_diagnosis(result.text, bundle.get("diagram"))
        except DiagnosisError as err:
            last_error = err
            logger.debug("Diagnosis answer rejected: %s", err)
            messages.append({"role": "assistant", "content": result.text or ""})
            messages.append(
                {
                    "role": "user",
                    "content": (
                        f"Your answer was rejected: {err}. Respond again with "
                        "ONLY the corrected JSON object."
                    ),
                }
            )
            continue
        diagnosis["model"] = model
        if result.usage is not None:
            diagnosis["total_tokens"] = result.usage.total_tokens
        logger.info(
            "Diagnosis produced (confidence=%s, proposals=%d)",
            diagnosis["confidence"],
            len(diagnosis["proposals"]),
        )
        return diagnosis
    raise DiagnosisError(f"Diagnosis failed validation after retries: {last_error}")


def save_diagnosis_artifact(
    diagnosis: dict[str, Any],
    logs_dir: Path | str,
    *,
    item_id: str | None = None,
    run_id: str | None = None,
) -> Path:
    """Write the diagnosis JSON next to the run logs (healing precedent).

    :param diagnosis: Validated diagnosis dict.
    :param logs_dir: Daemon/serve logs directory.
    :param item_id: Queue item identity (batch mode).
    :param run_id: Audit run identity (live mode).
    :returns: Path of the written artifact ``<logs_dir>/diagnosis/<key>.json``.
    """
    key = item_id or run_id
    if not key:
        raise ValueError("save_diagnosis_artifact requires item_id or run_id")
    directory = Path(logs_dir) / "diagnosis"
    directory.mkdir(parents=True, exist_ok=True)
    payload = {
        **diagnosis,
        "artifact_id": key,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    path = directory / f"{key}.json"
    path.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    return path


def load_diagnosis_artifact(
    logs_dir: Path | str, *, item_id: str | None = None, run_id: str | None = None
) -> dict[str, Any] | None:
    """Read one diagnosis artifact, ``None`` when missing or invalid."""
    key = item_id or run_id
    if not key:
        return None
    path = Path(logs_dir) / "diagnosis" / f"{key}.json"
    try:
        parsed = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None
    return parsed if isinstance(parsed, dict) else None
