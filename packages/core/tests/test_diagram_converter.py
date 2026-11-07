"""Tests for DiagramConverter."""

from __future__ import annotations

from rpaforge.core.diagram_converter import DiagramConverter
from rpaforge.core.execution import ActivityCall, ParallelGroup, TryCatchGroup


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


def _make_activity_node(node_id: str, label: str) -> dict:
    """Build a plain activity diagram node."""
    return {
        "id": node_id,
        "data": {
            "blockData": {
                "type": "activity",
                "library": "Flow",
                "activity": {"name": label, "library": "Flow"},
            },
            "activity": {"name": label, "library": "Flow"},
            "activityValues": {},
        },
    }


def _make_parallel_diagram(
    fail_fast: bool | None = None,
    branch_count: int = 2,
    declared_branches: list[dict] | None = None,
    connect_branches: bool = True,
) -> dict:
    """Build: start -> parallel(branch-1..N) -> branch acts -> merge -> end."""
    branch_ids = [f"branch-{i}" for i in range(1, branch_count + 1)]
    parallel_data: dict = {
        "type": "parallel",
        "branches": declared_branches
        if declared_branches is not None
        else [{"id": bid, "name": bid.upper()} for bid in branch_ids],
    }
    if fail_fast is not None:
        parallel_data["fail_fast"] = fail_fast

    nodes: list[dict] = [
        {"id": "start", "data": {"blockData": {"type": "start", "processName": "P"}}},
        {"id": "par", "data": {"blockData": parallel_data}},
    ]
    edges: list[dict] = [{"source": "start", "target": "par", "sourceHandle": None}]

    for index, bid in enumerate(branch_ids, start=1):
        nodes.append(_make_activity_node(f"act_{index}", f"Step{index}"))
        if connect_branches:
            edges.append(
                {"source": "par", "target": f"act_{index}", "sourceHandle": bid}
            )
            edges.append(
                {"source": f"act_{index}", "target": "merge", "sourceHandle": None}
            )
    nodes.append(_make_activity_node("merge", "Merge"))
    nodes.append({"id": "end", "data": {"blockData": {"type": "end"}}})
    edges.append({"source": "merge", "target": "end", "sourceHandle": None})

    return {"nodes": nodes, "edges": edges, "variables": []}


class TestParallelConversion:
    """Parallel diagram blocks convert to ParallelGroup (issue #856)."""

    def test_parallel_converts_to_group_with_branches(self) -> None:
        """Each branch handle yields an ordered branch of ActivityCalls."""
        process = DiagramConverter().convert(_make_parallel_diagram())
        groups = [
            a for a in process.tasks[0].activities if isinstance(a, ParallelGroup)
        ]

        assert len(groups) == 1
        group = groups[0]
        assert group.node_id == "par"
        assert len(group.branches) == 2
        assert [len(branch) for branch in group.branches] == [1, 1]
        assert group.branches[0][0].node_id == "act_1"
        assert group.branches[1][0].node_id == "act_2"

    def test_parallel_fail_fast_defaults_to_true(self) -> None:
        """Missing fail_fast behaves as fail_fast=True."""
        process = DiagramConverter().convert(_make_parallel_diagram())
        group = next(
            a for a in process.tasks[0].activities if isinstance(a, ParallelGroup)
        )
        assert group.fail_fast is True

    def test_parallel_fail_fast_false(self) -> None:
        """fail_fast=False from blockData reaches the ParallelGroup."""
        process = DiagramConverter().convert(_make_parallel_diagram(fail_fast=False))
        group = next(
            a for a in process.tasks[0].activities if isinstance(a, ParallelGroup)
        )
        assert group.fail_fast is False

    def test_parallel_merge_continues_after_group(self) -> None:
        """Execution resumes at the merge node after the concurrent section."""
        process = DiagramConverter().convert(_make_parallel_diagram())
        activities = process.tasks[0].activities
        after_group = [
            a
            for a in activities
            if isinstance(a, ActivityCall) and a.node_id == "merge"
        ]
        assert len(after_group) == 1, "merge node must appear exactly once"

    def test_parallel_declared_branch_without_connection_is_dropped(self) -> None:
        """A declared branch with no edge contributes no branch activities."""
        diagram = _make_parallel_diagram(
            declared_branches=[
                {"id": "branch-1", "name": "B1"},
                {"id": "branch-2", "name": "B2"},
                {"id": "branch-3", "name": "B3"},
            ]
        )
        process = DiagramConverter().convert(diagram)
        group = next(
            a for a in process.tasks[0].activities if isinstance(a, ParallelGroup)
        )
        assert len(group.branches) == 2

    def test_nested_parallel_inside_try_catch_branch(self) -> None:
        """Parallel nested in a try branch converts to a nested group."""
        diagram = {
            "nodes": [
                {
                    "id": "start",
                    "data": {"blockData": {"type": "start", "processName": "P"}},
                },
                {"id": "tc", "data": {"blockData": {"type": "try-catch"}}},
                {"id": "par", "data": {"blockData": {"type": "parallel"}}},
                _make_activity_node("pa", "ParStepA"),
                _make_activity_node("pb", "ParStepB"),
                _make_activity_node("merge", "ParMerge"),
                _make_activity_node("catch_act", "Handle"),
                _make_activity_node("after", "After"),
                {"id": "end", "data": {"blockData": {"type": "end"}}},
            ],
            "edges": [
                {"source": "start", "target": "tc", "sourceHandle": None},
                {"source": "tc", "target": "par", "sourceHandle": "output"},
                {"source": "par", "target": "pa", "sourceHandle": "branch-1"},
                {"source": "par", "target": "pb", "sourceHandle": "branch-2"},
                {"source": "pa", "target": "merge", "sourceHandle": None},
                {"source": "pb", "target": "merge", "sourceHandle": None},
                {"source": "merge", "target": "after", "sourceHandle": None},
                {"source": "tc", "target": "catch_act", "sourceHandle": "error"},
                {"source": "catch_act", "target": "after", "sourceHandle": None},
                {"source": "after", "target": "end", "sourceHandle": None},
            ],
            "variables": [],
        }

        process = DiagramConverter().convert(diagram)
        activities = process.tasks[0].activities
        tc_group = next(a for a in activities if isinstance(a, TryCatchGroup))
        parallels = [a for a in tc_group.try_activities if isinstance(a, ParallelGroup)]
        assert len(parallels) == 1
        assert len(parallels[0].branches) == 2


def test_comment_nodes_are_skipped_by_converter() -> None:
    """Comment nodes carry no checkpoint and no activity (issue #865)."""
    diagram = _make_linear_diagram(1)
    diagram["nodes"].append(
        {
            "id": "comment-1",
            "type": "comment",
            "data": {
                "blockData": {
                    "id": "comment-1",
                    "type": "comment",
                    "name": "Comment",
                    "label": "Why this exists",
                    "category": "annotations",
                    "text": "Retry three times per ticket #123",
                },
                "description": "",
                "tags": [],
            },
        }
    )
    diagram["edges"].append(
        {"source": "comment-1", "target": "act_1", "sourceHandle": None}
    )

    process = DiagramConverter().convert(diagram)
    activities = process.tasks[0].activities
    assert all(a.node_id != "comment-1" for a in activities)
    assert [a.node_id for a in activities] == ["act_1"]


def test_frame_nodes_are_skipped_by_converter() -> None:
    """Frame nodes are visual containers: no checkpoint, no activity (#866)."""
    diagram = _make_linear_diagram(1)
    diagram["nodes"].append(
        {
            "id": "frame-1",
            "type": "frame",
            "data": {
                "blockData": {
                    "id": "frame-1",
                    "type": "frame",
                    "name": "Frame",
                    "label": "Login flow region",
                    "category": "annotations",
                    "title": "Login flow region",
                    "collapsed": False,
                },
            },
        }
    )
    diagram["edges"].append(
        {"source": "frame-1", "target": "act_1", "sourceHandle": None}
    )

    process = DiagramConverter().convert(diagram)
    activities = process.tasks[0].activities
    assert all(a.node_id != "frame-1" for a in activities)
    assert [a.node_id for a in activities] == ["act_1"]
