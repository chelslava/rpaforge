"""Tests for DiagramConverter."""

from __future__ import annotations

from rpaforge.core.diagram_converter import DiagramConverter


def _make_linear_diagram(n: int) -> dict:
    """Build a linear diagram: start -> activity_1 -> ... -> activity_n -> end."""
    nodes = [
        {
            "id": "start",
            "data": {"blockData": {"type": "start", "processName": "Test"}},
        }
    ]
    for i in range(1, n + 1):
        nodes.append(
            {
                "id": f"act_{i}",
                "data": {
                    "blockData": {
                        "type": "activity",
                        "library": "Flow",
                        "activity": {"name": f"Step{i}", "library": "Flow"},
                    },
                    "activity": {"name": f"Step{i}", "library": "Flow"},
                    "activityValues": {},
                },
            }
        )
    nodes.append({"id": "end", "data": {"blockData": {"type": "end"}}})

    edges = [{"source": "start", "target": "act_1", "sourceHandle": None}]
    for i in range(1, n):
        edges.append(
            {"source": f"act_{i}", "target": f"act_{i + 1}", "sourceHandle": None}
        )
    edges.append({"source": f"act_{n}", "target": "end", "sourceHandle": None})

    return {"nodes": nodes, "edges": edges}


def test_linear_diagram_no_duplicates() -> None:
    """Each activity block must appear exactly once, not 3× due to triple successor bug."""
    diagram = _make_linear_diagram(5)
    converter = DiagramConverter()
    process = converter.convert(diagram)

    assert len(process.tasks) == 1
    activities = process.tasks[0].activities
    node_ids = [a.node_id for a in activities]

    assert len(node_ids) == 5, f"Expected 5 activities, got {len(node_ids)}: {node_ids}"
    assert len(set(node_ids)) == 5, f"Duplicate node_ids detected: {node_ids}"

    for i in range(1, 6):
        count = node_ids.count(f"act_{i}")
        assert count == 1, f"act_{i} appears {count} times instead of 1"


def test_declared_variables_are_available_to_the_converted_process() -> None:
    """Persisted Studio variables must be injected before execution starts."""
    diagram = _make_linear_diagram(1)
    diagram["variables"] = [
        {"name": "api_token", "type": "secret", "value": "runtime-secret"},
        {"name": "retry_count", "type": "number", "value": 3},
    ]

    process = DiagramConverter().convert(diagram)

    assert process.variables == {"api_token": "runtime-secret", "retry_count": 3}
