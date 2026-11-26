"""Redacted context bundle builder for AI failure diagnosis (issue #906).

Assembles everything the diagnosis LLM needs about one failed run — the
audit record (already redacted at write time), the tail of the run's
NDJSON event log (masked at emit time), the current diagram and any
selector-heal proposals — into one JSON bundle. The whole bundle is
swept once more through :func:`mask_secret_values` before returning, so
a secret that slipped into an error message can never reach a provider
call (defense in depth; acceptance criterion of #906).
"""

from __future__ import annotations

import contextlib
import json
from pathlib import Path
from typing import Any, cast

from rpaforge.core.secrets import mask_event_data

#: Bundle schema version, bumped on breaking shape changes.
BUNDLE_SCHEMA_VERSION = 1

#: How many trailing NDJSON events to include.
DEFAULT_MAX_EVENTS = 20
#: How many trailing audit steps to include.
DEFAULT_MAX_STEPS = 15


def _read_json(path: Path) -> dict[str, Any] | None:
    """Read one JSON file, returning ``None`` when missing or invalid."""
    try:
        parsed = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None
    return parsed if isinstance(parsed, dict) else None


def _read_ndjson_tail(path: Path, limit: int) -> list[dict[str, Any]]:
    """Return the last ``limit`` valid events from an NDJSON log."""
    events: list[dict[str, Any]] = []
    try:
        with path.open(encoding="utf-8") as handle:
            for line in handle:
                line = line.strip()
                if not line:
                    continue
                with contextlib.suppress(ValueError):
                    events.append(json.loads(line))
    except OSError:
        return []
    return events[-limit:]


def _collect_selector_fixes(audit_path: Path | None) -> list[dict[str, Any]]:
    """Best-effort read of selector-heal proposals next to the audit file.

    Healing artifacts (``selectors/healing.py``) live in
    ``<audit-dir>/selector-fixes/*.json`` keyed by selector hash with no
    node linkage — they are passed through unfiltered so the model can
    match them against the failing selector.
    """
    if audit_path is None:
        return []
    fixes_dir = audit_path.parent / "selector-fixes"
    if not fixes_dir.is_dir():
        return []
    fixes: list[dict[str, Any]] = []
    for fix_path in sorted(fixes_dir.glob("fix-*.json"))[:10]:
        fix = _read_json(fix_path)
        if fix is not None:
            fixes.append(fix)
    return fixes


def _failed_step(steps: list[dict[str, Any]]) -> dict[str, Any] | None:
    """Return the last failed step, or the last step, or ``None``."""
    for step in reversed(steps):
        if step.get("status") == "failed":
            return cast("dict[str, Any]", step)
    return cast("dict[str, Any]", steps[-1]) if steps else None


def build_diagnosis_bundle(
    *,
    audit_path: Path | str | None = None,
    logs_path: Path | str | None = None,
    diagram: dict[str, Any] | None = None,
    item_id: str | None = None,
    run_id: str | None = None,
    error: str | None = None,
    max_events: int = DEFAULT_MAX_EVENTS,
    max_steps: int = DEFAULT_MAX_STEPS,
) -> dict[str, Any]:
    """Assemble the redacted diagnosis context bundle for one failed run.

    :param audit_path: Audit JSON written by ``RunRecord.save``.
    :param logs_path: Per-run NDJSON event log (``<logs_dir>/<id>.ndjson``).
    :param diagram: Current diagram document (``{"nodes": [...], "edges": [...]}``).
    :param item_id: Queue item id (batch mode identity).
    :param run_id: Audit run id (live mode identity).
    :param error: Explicit top-level error override (e.g. the queue item's
        ``error_message``); falls back to the failed step's error.
    :param max_events: Trailing NDJSON events to include.
    :param max_steps: Trailing audit steps to include.
    :returns: Masked bundle dict ready for the diagnosis prompt.
    """
    audit_file = Path(audit_path) if audit_path else None
    log_file = Path(logs_path) if logs_path else None

    record = _read_json(audit_file) if audit_file else None
    record = record if record is not None else {}

    steps_all = record.get("steps") or []
    steps = steps_all[-max_steps:] if isinstance(steps_all, list) else []
    events = _read_ndjson_tail(log_file, max_events) if log_file else []
    failed = _failed_step(steps) if steps else None

    resolved_error = (
        error
        or (failed or {}).get("error")
        or record.get("error")
        or "Unknown failure (no error recorded)"
    )

    bundle: dict[str, Any] = {
        "schema_version": BUNDLE_SCHEMA_VERSION,
        "run_id": run_id or record.get("run_id"),
        "item_id": item_id,
        "process_name": record.get("process_name"),
        "status": record.get("status", "failed"),
        "error": str(resolved_error),
        "failed_step": failed,
        "steps": steps,
        "events": events,
        "diagram": diagram,
        "selector_fixes": _collect_selector_fixes(audit_file),
    }
    # Defense in depth: the artifacts above are masked at write/emit
    # time, but a sweep here guarantees nothing unmasked leaks out even
    # from hand-edited or older files. Uses the SAME full masking layer
    # as the NDJSON emit path (registered values + shaped patterns +
    # credential-named keys), so bundle visibility equals log visibility.
    return mask_event_data(bundle)
