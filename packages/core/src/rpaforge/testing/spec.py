"""Diagram test-spec model and discovery for ``rpaforge-runner test`` (issue #845).

A spec is a JSON file describing one fast, side-effect-free test of a
diagram: which diagram to load, which activities to mock, which (rare)
activities may run for real, and what to assert afterwards::

    {
      "name": "invoice total",
      "diagram": "process/invoice.process",
      "variables": {"tax_rate": 0.2},
      "mocks": [
        {"activity": "WebUI.Click Element", "return": {"ok": true}},
        {"activity": "HTTP.Fetch", "sequence": [{"status": 200}, {"error": "boom"}]},
        {"activity": "Database.Execute", "raise": "connection refused"}
      ],
      "allow_real": ["Flow.Log"],
      "assert": {
        "process_status": "pass",
        "variables": {"total": 42},
        "expressions": ["total == 42"],
        "node_status": {"n3": "pass"},
        "nodes_executed": ["n1", "n2"]
      },
      "min_coverage": 80
    }

Spec files are named ``*.test.json`` (or ``*.rpaforge-test.json``). A spec
path may also point at a directory, which is scanned recursively for such
files.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

__all__ = [
    "AssertionSpec",
    "MockSpec",
    "SpecError",
    "TestSpec",
    "discover_specs",
    "load_spec",
]

#: File-name patterns treated as test specs when scanning directories.
SPEC_SUFFIXES = (".test.json", ".rpaforge-test.json")

_KNOWN_TOP_LEVEL = {
    "name",
    "diagram",
    "variables",
    "mocks",
    "allow_real",
    "assert",
    "min_coverage",
}


class SpecError(ValueError):
    """Raised when a test spec cannot be parsed or fails validation."""


@dataclass(frozen=True)
class MockSpec:
    """One activity override: fixed ``return``, scripted ``sequence`` or ``raise``."""

    activity: str
    return_value: Any = None
    sequence: tuple[Any, ...] = ()
    raise_message: str | None = None


@dataclass(frozen=True)
class AssertionSpec:
    """Expected outcomes asserted after the run."""

    process_status: str | None = None
    variables: dict[str, Any] = field(default_factory=dict)
    expressions: tuple[str, ...] = ()
    node_status: dict[str, str] = field(default_factory=dict)
    nodes_executed: tuple[str, ...] = ()


@dataclass(frozen=True)
class TestSpec:
    """One diagram test: inputs, mocks, allow-list and assertions."""

    name: str
    diagram: str
    variables: dict[str, Any] = field(default_factory=dict)
    mocks: tuple[MockSpec, ...] = ()
    allow_real: tuple[str, ...] = ()
    assertions: AssertionSpec = field(default_factory=AssertionSpec)
    min_coverage: float | None = None
    source_path: str | None = None


def _require_str(value: Any, what: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise SpecError(f"{what} must be a non-empty string")
    return value.strip()


def _parse_mock(data: Any, index: int) -> MockSpec:
    if not isinstance(data, dict):
        raise SpecError(f"mocks[{index}] must be an object")
    unknown = set(data) - {"activity", "return", "sequence", "raise"}
    if unknown:
        raise SpecError(f"mocks[{index}]: unknown keys {sorted(unknown)}")
    activity = _require_str(data.get("activity"), f"mocks[{index}].activity")
    provided = sum(
        1 for key in ("return", "sequence", "raise") if data.get(key) is not None
    )
    if provided != 1:
        raise SpecError(
            f"mocks[{index}] ('{activity}'): exactly one of return/sequence/raise"
        )
    sequence = data.get("sequence")
    if sequence is not None and (not isinstance(sequence, list) or not sequence):
        raise SpecError(f"mocks[{index}].sequence must be a non-empty list")
    raise_message = data.get("raise")
    if raise_message is not None and not isinstance(raise_message, str):
        raise SpecError(f"mocks[{index}].raise must be a string")
    return MockSpec(
        activity=activity,
        return_value=data.get("return"),
        sequence=tuple(sequence) if sequence is not None else (),
        raise_message=raise_message,
    )


def _parse_assert(data: Any) -> AssertionSpec:
    if data is None:
        return AssertionSpec()
    if not isinstance(data, dict):
        raise SpecError("'assert' section must be an object")
    unknown = set(data) - {
        "process_status",
        "variables",
        "expressions",
        "node_status",
        "nodes_executed",
    }
    if unknown:
        raise SpecError(f"'assert': unknown keys {sorted(unknown)}")
    variables = data.get("variables", {})
    if not isinstance(variables, dict):
        raise SpecError("'assert.variables' must be an object")
    expressions = data.get("expressions", [])
    if not isinstance(expressions, list) or any(
        not isinstance(e, str) for e in expressions
    ):
        raise SpecError("'assert.expressions' must be a list of strings")
    node_status = data.get("node_status", {})
    if not isinstance(node_status, dict) or any(
        not isinstance(v, str) for v in node_status.values()
    ):
        raise SpecError("'assert.node_status' must map node ids to status strings")
    nodes_executed = data.get("nodes_executed", [])
    if not isinstance(nodes_executed, list) or any(
        not isinstance(n, str) for n in nodes_executed
    ):
        raise SpecError("'assert.nodes_executed' must be a list of node ids")
    process_status = data.get("process_status")
    if process_status is not None and not isinstance(process_status, str):
        raise SpecError("'assert.process_status' must be a string")
    return AssertionSpec(
        process_status=process_status,
        variables=dict(variables),
        expressions=tuple(expressions),
        node_status=dict(node_status),
        nodes_executed=tuple(nodes_executed),
    )


def parse_spec(data: Any, source_path: str | None = None) -> TestSpec:
    """Parse a raw spec dict into a :class:`TestSpec` (validating)."""
    if not isinstance(data, dict):
        raise SpecError("test spec must be a JSON object")
    unknown = set(data) - _KNOWN_TOP_LEVEL
    if unknown:
        raise SpecError(f"unknown spec keys: {sorted(unknown)}")

    name = _require_str(data.get("name"), "'name'")
    diagram = _require_str(data.get("diagram"), "'diagram'")

    variables = data.get("variables", {})
    if not isinstance(variables, dict):
        raise SpecError("'variables' must be an object")

    mocks_raw = data.get("mocks", [])
    if not isinstance(mocks_raw, list):
        raise SpecError("'mocks' must be a list")
    mocks = tuple(_parse_mock(m, i) for i, m in enumerate(mocks_raw))

    allow_real = data.get("allow_real", [])
    if not isinstance(allow_real, list) or any(
        not isinstance(a, str) for a in allow_real
    ):
        raise SpecError("'allow_real' must be a list of strings")

    min_coverage = data.get("min_coverage")
    if min_coverage is not None:
        if not isinstance(min_coverage, (int, float)) or not 0 <= min_coverage <= 100:
            raise SpecError("'min_coverage' must be a number between 0 and 100")
        min_coverage = float(min_coverage)

    return TestSpec(
        name=name,
        diagram=diagram,
        variables=dict(variables),
        mocks=mocks,
        allow_real=tuple(allow_real),
        assertions=_parse_assert(data.get("assert")),
        min_coverage=min_coverage,
        source_path=source_path,
    )


def load_spec(path: Path | str) -> TestSpec:
    """Load one spec from a JSON file."""
    spec_path = Path(path)
    try:
        raw = spec_path.read_text(encoding="utf-8")
    except OSError as exc:
        raise SpecError(f"cannot read spec file {spec_path}: {exc}") from exc
    try:
        data = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise SpecError(f"invalid JSON in spec {spec_path}: {exc}") from exc
    return parse_spec(data, source_path=str(spec_path))


def discover_specs(path: Path | str) -> list[TestSpec]:
    """Load a single spec file, or scan a directory for ``*.test.json`` specs.

    The default spec name pattern is ``*.test.json`` (``*.rpaforge-test.json``
    is accepted too). Results are sorted by path for stable output.
    """
    root = Path(path).expanduser()
    if root.is_file():
        return [load_spec(root)]
    if root.is_dir():
        found: list[Path] = []
        for pattern in SPEC_SUFFIXES:
            found.extend(p for p in root.rglob(f"*{pattern}"))
        # de-duplicate when both suffix patterns could match the same file
        unique = sorted({p.resolve(): p for p in found}.values())
        return [load_spec(p) for p in unique]
    raise SpecError(f"spec path does not exist: {root}")


def normalize_activity_key(library: str, activity: str) -> str:
    """Canonical ``Library.Activity`` key used for mock/allow matching."""
    return re.sub(r"\s+", " ", f"{library}.{activity}").strip()
