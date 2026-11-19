"""
Execution audit logging for RPAForge.

Records run history with step-level detail, variable snapshots, and timing.
Supports credential redaction for privacy.
"""

from __future__ import annotations

import json
import logging
from dataclasses import asdict, dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any

from rpaforge.core.secrets import mask_secret_values

logger = logging.getLogger("rpaforge")

# Fields to redact in variable snapshots and parameters
REDACT_PATTERNS = {"password", "secret", "token", "credential", "key"}


def should_redact(field_name: str) -> bool:
    """Check if a field name should be redacted."""
    name_lower = field_name.lower()
    return any(pattern in name_lower for pattern in REDACT_PATTERNS)


def _name_redact(value: Any) -> Any:
    """Name-based redaction pass over a payload structure."""
    if isinstance(value, dict):
        return {
            k: "[REDACTED]" if should_redact(k) else _name_redact(v)
            for k, v in value.items()
        }
    elif isinstance(value, (list, tuple)):
        return [_name_redact(v) for v in value]
    return value


def redact_value(value: Any) -> Any:
    """Redact sensitive values recursively.

    Two layers: name-based (a field whose name looks credential-ish is
    replaced wholesale) and value-based (issue #912) — every occurrence
    of a value registered with the runtime secret registry
    (:mod:`rpaforge.core.secrets`) is masked whatever the key name it
    sits under. The value-based layer honors ``RPAFORGE_LOG_UNMASKED``;
    name-based redaction is unconditional.
    """
    return mask_secret_values(_name_redact(value))


@dataclass
class StepRecord:
    """Record of a single activity execution step."""

    activity: str  # e.g. "WebUI.Click Element"
    node_id: str
    started_at: str  # ISO format datetime
    duration_ms: int
    status: str  # "success" | "failed" | "skipped"
    inputs: dict[str, Any] = field(default_factory=dict)
    output: Any | None = None
    error: str | None = None
    continued_on_error: bool = False
    variable_snapshot: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        """Convert to dict, with redacted sensitive fields.

        Name-based redaction covers inputs and the variable snapshot;
        the value-based layer (issue #912) then masks every occurrence
        of a registered secret value across the whole record — error
        messages and outputs included.
        """
        data = asdict(self)
        # Name-based: redact inputs and variable snapshot
        if data.get("inputs"):
            data["inputs"] = redact_value(data["inputs"])
        if data.get("variable_snapshot"):
            data["variable_snapshot"] = redact_value(data["variable_snapshot"])
        # Value-based: registered secrets are masked wherever they appear.
        return mask_secret_values(data)


@dataclass
class RunRecord:
    """Record of a complete process run."""

    run_id: str  # UUID
    process_name: str
    started_at: str  # ISO format datetime
    finished_at: str | None = None
    status: str = "running"  # "running" | "success" | "failed" | "cancelled"
    steps: list[StepRecord] = field(default_factory=list)
    #: Structured permission-policy violations (issue #844), redacted.
    policy_violations: list[dict[str, Any]] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        """Convert to dict with nested step records.

        Step records redact themselves (see :meth:`StepRecord.to_dict`);
        the value-based layer additionally sweeps the whole record so a
        registered secret value cannot survive in a top-level field.
        """
        return mask_secret_values(
            {
                "run_id": self.run_id,
                "process_name": self.process_name,
                "started_at": self.started_at,
                "finished_at": self.finished_at,
                "status": self.status,
                "steps": [step.to_dict() for step in self.steps],
                "policy_violations": [redact_value(v) for v in self.policy_violations],
            }
        )

    def save(self, runs_dir: Path) -> Path:
        """Save run record to JSON file. Returns path to saved file."""
        runs_dir.mkdir(parents=True, exist_ok=True)

        # Use ISO timestamp for filename
        start_dt = datetime.fromisoformat(self.started_at)
        filename = f"{start_dt.strftime('%Y-%m-%d_%H-%M-%S')}_{self.run_id}.json"
        filepath = runs_dir / filename

        with open(filepath, "w", encoding="utf-8") as f:
            json.dump(self.to_dict(), f, indent=2, default=str)

        logger.debug(f"Run record saved to {filepath}")
        return filepath

    @classmethod
    def load(cls, filepath: Path) -> RunRecord:
        """Load run record from JSON file."""
        with open(filepath, encoding="utf-8") as f:
            data = json.load(f)

        # Reconstruct step records
        steps = [StepRecord(**step) for step in data.get("steps", [])]
        data["steps"] = steps

        return cls(**data)
