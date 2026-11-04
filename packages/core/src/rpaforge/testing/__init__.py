"""Diagram testing framework for RPAForge (issue #845).

Fast, side-effect-free diagram tests: mock activities, skip everything
unmocked, assert final variables / node statuses / coverage, emit JUnit XML
for CI.
"""

from rpaforge.testing.junit import build_junit_xml
from rpaforge.testing.runner import (
    CallRecord,
    SpecResult,
    collect_activity_nodes,
    run_spec,
    run_specs,
)
from rpaforge.testing.spec import (
    AssertionSpec,
    MockSpec,
    SpecError,
    TestSpec,
    discover_specs,
    load_spec,
    parse_spec,
)

__all__ = [
    "AssertionSpec",
    "CallRecord",
    "MockSpec",
    "SpecError",
    "SpecResult",
    "TestSpec",
    "build_junit_xml",
    "collect_activity_nodes",
    "discover_specs",
    "load_spec",
    "parse_spec",
    "run_spec",
    "run_specs",
]
