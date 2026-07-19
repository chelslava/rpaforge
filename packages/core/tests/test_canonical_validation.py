"""Regression and scaling tests for the shared diagram validation pipeline."""

from __future__ import annotations

import asyncio
import time
from typing import Any

from rpaforge import StudioEngine
from rpaforge.bridge.handlers import BridgeHandlers
from rpaforge.core.validator import validate_diagram


def _linear_diagram(node_count: int, *, cycle: bool = False) -> dict[str, Any]:
    nodes = []
    for index in range(node_count):
        block_type = (
            "start" if index == 0 else "end" if index == node_count - 1 else "activity"
        )
        nodes.append(
            {
                "id": f"n{index}",
                "data": {"blockData": {"type": block_type}},
            }
        )
    edges = [
        {"source": f"n{index}", "target": f"n{index + 1}"}
        for index in range(node_count - 1)
    ]
    if cycle and node_count > 0:
        edges.append({"source": f"n{node_count - 1}", "target": "n0"})
    return {"nodes": nodes, "edges": edges}


def test_cycles_are_checked_at_all_size_boundaries() -> None:
    for node_count in (1, 19, 20, 99, 100, 10_000):
        diagram = _linear_diagram(node_count, cycle=True)
        result = validate_diagram(diagram)
        assert not result.is_valid
        assert any(error.error_type == "CIRCULAR_REFERENCE" for error in result.errors)
        assert all("skipped" not in warning.lower() for warning in result.warnings)


def test_malformed_edges_are_checked_at_all_size_boundaries() -> None:
    for node_count in (1, 19, 20, 99, 100, 10_000):
        diagram = _linear_diagram(node_count)
        diagram["edges"].append({"source": "missing", "target": "n0"})
        result = validate_diagram(diagram)
        assert not result.is_valid
        assert any(error.error_type == "INVALID_SOURCE" for error in result.errors)


def test_bridge_preview_matches_canonical_validator() -> None:
    diagram = _linear_diagram(100, cycle=True)
    expected = validate_diagram(diagram)
    handlers = BridgeHandlers(StudioEngine())
    actual = asyncio.run(handlers._handle_validate_diagram({"diagram": diagram}))

    assert actual["valid"] is expected.is_valid
    assert [error["code"] for error in actual["errors"]] == [
        error.error_type for error in expected.errors
    ]


def test_large_validation_scales_near_linearly() -> None:
    small = _linear_diagram(1_000)
    large = _linear_diagram(10_000)

    start = time.perf_counter()
    assert validate_diagram(small).is_valid
    small_duration = time.perf_counter() - start

    start = time.perf_counter()
    assert validate_diagram(large).is_valid
    large_duration = time.perf_counter() - start

    assert large_duration < max(2.5, small_duration * 25)
