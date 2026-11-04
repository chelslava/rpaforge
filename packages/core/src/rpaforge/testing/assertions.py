"""Assertion evaluation for diagram test specs (issue #845).

Assertions are declarative: expected process status, expected final
variables (exact equality), SafeEvaluator expressions over the final
variables, per-node statuses, and a required executed-node set. Every
failed assertion contributes one human-readable failure string.
"""

from __future__ import annotations

from typing import Any

from rpaforge.core.safe_evaluator import safe_eval
from rpaforge.testing.spec import AssertionSpec

__all__ = ["evaluate_assertions"]


def evaluate_assertions(
    assertions: AssertionSpec,
    *,
    process_status: str | None,
    variables: dict[str, Any],
    node_statuses: dict[str, str],
    visited_nodes: set[str],
) -> list[str]:
    """Evaluate all assertions; returns one failure string per violation."""
    failures: list[str] = []

    if (
        assertions.process_status is not None
        and process_status != assertions.process_status
    ):
        failures.append(
            f"process status expected '{assertions.process_status}', "
            f"got '{process_status}'"
        )

    for name, expected in assertions.variables.items():
        actual = variables.get(name)
        if actual != expected:
            failures.append(f"variable '{name}' expected {expected!r}, got {actual!r}")

    for expression in assertions.expressions:
        try:
            value = safe_eval(expression, dict(variables))
        except Exception as exc:
            failures.append(f"expression '{expression}' raised: {exc}")
            continue
        if not value:
            failures.append(f"expression '{expression}' evaluated falsy")

    for node_id, expected in assertions.node_status.items():
        actual = node_statuses.get(node_id)
        if actual is None:
            failures.append(
                f"node '{node_id}' status expected '{expected}', "
                "but the node was not visited"
            )
        elif actual != expected:
            failures.append(
                f"node '{node_id}' status expected '{expected}', got '{actual}'"
            )

    for node_id in assertions.nodes_executed:
        if node_id not in visited_nodes:
            failures.append(f"expected node '{node_id}' was not executed")

    return failures
