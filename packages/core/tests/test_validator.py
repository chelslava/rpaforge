"""Tests for ProcessValidator."""

from __future__ import annotations

import pytest

from rpaforge.core.diagram_converter import DiagramConverter
from rpaforge.core.execution import ActivityCall, Process, Task
from rpaforge.core.validator import (
    ProcessValidator,
    ValidationError,
    ValidationResult,
    validate_diagram,
    validate_process,
)


def _make_simple_diagram() -> dict:
    """Create a simple valid diagram: start -> activity -> end."""
    return {
        "nodes": [
            {
                "id": "start",
                "data": {"blockData": {"type": "start", "processName": "Test"}},
            },
            {
                "id": "act1",
                "data": {
                    "blockData": {
                        "type": "activity",
                        "library": "Flow",
                        "activity": {"name": "Log", "library": "Flow"},
                    },
                    "activity": {"name": "Log", "library": "Flow"},
                    "activityValues": {},
                },
            },
            {"id": "end", "data": {"blockData": {"type": "end"}}},
        ],
        "edges": [
            {"source": "start", "target": "act1", "sourceHandle": None},
            {"source": "act1", "target": "end", "sourceHandle": None},
        ],
    }


def _make_if_diagram() -> dict:
    """Create diagram with if branch."""
    return {
        "nodes": [
            {
                "id": "start",
                "data": {"blockData": {"type": "start", "processName": "Test"}},
            },
            {
                "id": "if1",
                "data": {"blockData": {"type": "if", "condition": "${x} > 0"}},
            },
            {
                "id": "act_true",
                "data": {
                    "blockData": {
                        "type": "activity",
                        "library": "Flow",
                        "activity": {"name": "Log", "library": "Flow"},
                    },
                    "activity": {"name": "Log", "library": "Flow"},
                },
            },
            {
                "id": "act_false",
                "data": {
                    "blockData": {
                        "type": "activity",
                        "library": "Flow",
                        "activity": {"name": "Log", "library": "Flow"},
                    },
                    "activity": {"name": "Log", "library": "Flow"},
                },
            },
            {"id": "end", "data": {"blockData": {"type": "end"}}},
        ],
        "edges": [
            {"source": "start", "target": "if1", "sourceHandle": None},
            {"source": "if1", "target": "act_true", "sourceHandle": "true"},
            {"source": "if1", "target": "act_false", "sourceHandle": "false"},
            {"source": "act_true", "target": "end", "sourceHandle": None},
            {"source": "act_false", "target": "end", "sourceHandle": None},
        ],
    }


def _make_circular_diagram() -> dict:
    """Create diagram with circular reference."""
    return {
        "nodes": [
            {
                "id": "start",
                "data": {"blockData": {"type": "start", "processName": "Test"}},
            },
            {
                "id": "act1",
                "data": {
                    "blockData": {
                        "type": "activity",
                        "library": "Flow",
                        "activity": {"name": "Log", "library": "Flow"},
                    },
                    "activity": {"name": "Log", "library": "Flow"},
                },
            },
            {
                "id": "act2",
                "data": {
                    "blockData": {
                        "type": "activity",
                        "library": "Flow",
                        "activity": {"name": "Log", "library": "Flow"},
                    },
                    "activity": {"name": "Log", "library": "Flow"},
                },
            },
            {"id": "end", "data": {"blockData": {"type": "end"}}},
        ],
        "edges": [
            {"source": "start", "target": "act1", "sourceHandle": None},
            {"source": "act1", "target": "act2", "sourceHandle": None},
            {"source": "act2", "target": "act1", "sourceHandle": None},
            {"source": "act2", "target": "end", "sourceHandle": None},
        ],
    }


def _make_multi_start_diagram() -> dict:
    """Create diagram with multiple start nodes."""
    return {
        "nodes": [
            {
                "id": "start1",
                "data": {"blockData": {"type": "start", "processName": "Test"}},
            },
            {
                "id": "start2",
                "data": {"blockData": {"type": "start", "processName": "Test2"}},
            },
            {
                "id": "act1",
                "data": {
                    "blockData": {
                        "type": "activity",
                        "library": "Flow",
                        "activity": {"name": "Log", "library": "Flow"},
                    },
                    "activity": {"name": "Log", "library": "Flow"},
                },
            },
            {"id": "end", "data": {"blockData": {"type": "end"}}},
        ],
        "edges": [
            {"source": "start1", "target": "act1", "sourceHandle": None},
            {"source": "start2", "target": "act1", "sourceHandle": None},
            {"source": "act1", "target": "end", "sourceHandle": None},
        ],
    }


def _make_orphaned_node_diagram() -> dict:
    """Create diagram with orphaned node."""
    return {
        "nodes": [
            {
                "id": "start",
                "data": {"blockData": {"type": "start", "processName": "Test"}},
            },
            {
                "id": "act1",
                "data": {
                    "blockData": {
                        "type": "activity",
                        "library": "Flow",
                        "activity": {"name": "Log", "library": "Flow"},
                    },
                    "activity": {"name": "Log", "library": "Flow"},
                },
            },
            {
                "id": "orphaned",
                "data": {
                    "blockData": {
                        "type": "activity",
                        "library": "Flow",
                        "activity": {"name": "Log", "library": "Flow"},
                    },
                    "activity": {"name": "Log", "library": "Flow"},
                },
            },
            {"id": "end", "data": {"blockData": {"type": "end"}}},
        ],
        "edges": [
            {"source": "start", "target": "act1", "sourceHandle": None},
            {"source": "act1", "target": "end", "sourceHandle": None},
        ],
    }


def _make_invalid_edge_diagram() -> dict:
    """Create diagram with edge to non-existent node."""
    return {
        "nodes": [
            {
                "id": "start",
                "data": {"blockData": {"type": "start", "processName": "Test"}},
            },
            {
                "id": "act1",
                "data": {
                    "blockData": {
                        "type": "activity",
                        "library": "Flow",
                        "activity": {"name": "Log", "library": "Flow"},
                    },
                    "activity": {"name": "Log", "library": "Flow"},
                },
            },
            {"id": "end", "data": {"blockData": {"type": "end"}}},
        ],
        "edges": [
            {"source": "start", "target": "act1", "sourceHandle": None},
            {"source": "act1", "target": "nonexistent", "sourceHandle": None},
        ],
    }


def _make_end_with_outgoing_diagram() -> dict:
    """Create diagram where end node has outgoing edges."""
    return {
        "nodes": [
            {
                "id": "start",
                "data": {"blockData": {"type": "start", "processName": "Test"}},
            },
            {
                "id": "act1",
                "data": {
                    "blockData": {
                        "type": "activity",
                        "library": "Flow",
                        "activity": {"name": "Log", "library": "Flow"},
                    },
                    "activity": {"name": "Log", "library": "Flow"},
                },
            },
            {
                "id": "end",
                "data": {"blockData": {"type": "end"}},
            },
        ],
        "edges": [
            {"source": "start", "target": "act1", "sourceHandle": None},
            {"source": "end", "target": "act1", "sourceHandle": None},
        ],
    }


def _make_missing_if_branch_diagram() -> dict:
    """Create diagram with if node missing a branch."""
    return {
        "nodes": [
            {
                "id": "start",
                "data": {"blockData": {"type": "start", "processName": "Test"}},
            },
            {
                "id": "if1",
                "data": {"blockData": {"type": "if", "condition": "${x} > 0"}},
            },
            {
                "id": "act1",
                "data": {
                    "blockData": {
                        "type": "activity",
                        "library": "Flow",
                        "activity": {"name": "Log", "library": "Flow"},
                    },
                    "activity": {"name": "Log", "library": "Flow"},
                },
            },
            {"id": "end", "data": {"blockData": {"type": "end"}}},
        ],
        "edges": [
            {"source": "start", "target": "if1", "sourceHandle": None},
            {"source": "if1", "target": "act1", "sourceHandle": "true"},
            {"source": "act1", "target": "end", "sourceHandle": None},
        ],
    }


class TestProcessValidator:
    """Tests for ProcessValidator."""

    def test_valid_simple_diagram(self) -> None:
        """Valid diagram should pass validation."""
        diagram = _make_simple_diagram()
        validator = ProcessValidator()
        result = validator.validate_diagram(diagram)

        assert result.is_valid
        assert len(result.errors) == 0

    def test_valid_if_diagram(self) -> None:
        """Valid if diagram should pass."""
        diagram = _make_if_diagram()
        validator = ProcessValidator()
        result = validator.validate_diagram(diagram)

        assert result.is_valid
        assert len(result.errors) == 0

    def test_circular_reference_detected(self) -> None:
        """Circular references should be detected."""
        diagram = _make_circular_diagram()
        validator = ProcessValidator()
        result = validator.validate_diagram(diagram)

        assert not result.is_valid
        assert any(e.error_type == "CIRCULAR_REFERENCE" for e in result.errors)

    def test_multiple_start_nodes_detected(self) -> None:
        """Multiple start nodes should be detected."""
        diagram = _make_multi_start_diagram()
        validator = ProcessValidator()
        result = validator.validate_diagram(diagram)

        assert not result.is_valid
        assert any(e.error_type == "MULTIPLE_STARTS" for e in result.errors)

    def test_orphaned_node_detected(self) -> None:
        """Orphaned nodes should be detected."""
        diagram = _make_orphaned_node_diagram()
        validator = ProcessValidator()
        result = validator.validate_diagram(diagram)

        assert not result.is_valid
        assert any(e.error_type == "ORPHANED_NODE" for e in result.errors)

    def test_invalid_edge_target_detected(self) -> None:
        """Edge referencing non-existent target should be detected."""
        diagram = _make_invalid_edge_diagram()
        validator = ProcessValidator()
        result = validator.validate_diagram(diagram)

        assert not result.is_valid
        assert any(e.error_type == "INVALID_TARGET" for e in result.errors)

    def test_end_node_with_outgoing_detected(self) -> None:
        """End node with outgoing edges should be detected."""
        diagram = _make_end_with_outgoing_diagram()
        validator = ProcessValidator()
        result = validator.validate_diagram(diagram)

        assert not result.is_valid
        assert any(e.error_type == "INVALID_END_CONNECTIONS" for e in result.errors)

    def test_missing_if_branch_detected(self) -> None:
        """If node missing a branch should be detected."""
        diagram = _make_missing_if_branch_diagram()
        validator = ProcessValidator()
        result = validator.validate_diagram(diagram)

        assert not result.is_valid
        assert any(e.error_type == "MISSING_FALSE_BRANCH" for e in result.errors)

    def test_empty_diagram(self) -> None:
        """Empty diagram should fail validation."""
        diagram = {"nodes": [], "edges": []}
        validator = ProcessValidator()
        result = validator.validate_diagram(diagram)

        assert not result.is_valid
        assert any(e.error_type == "MISSING_START" for e in result.errors)

    def test_validate_topology_method(self) -> None:
        """validate_topology should work with nodes and edges."""
        diagram = _make_simple_diagram()
        validator = ProcessValidator()
        result = validator.validate_topology(diagram["nodes"], diagram["edges"])

        assert result.is_valid

    def test_check_circular_references_method(self) -> None:
        """check_circular_references should return cycles."""
        diagram = _make_circular_diagram()
        validator = ProcessValidator()
        cycles = validator.check_circular_references(diagram)

        assert len(cycles) > 0

    def test_no_circular_references(self) -> None:
        """Linear diagram should have no circular references."""
        diagram = _make_simple_diagram()
        validator = ProcessValidator()
        cycles = validator.check_circular_references(diagram)

        assert len(cycles) == 0


class TestValidationResult:
    """Tests for ValidationResult."""

    def test_add_error(self) -> None:
        """add_error should set is_valid to False."""
        result = ValidationResult()
        result.add_error("Test error", error_type="TEST")

        assert not result.is_valid
        assert len(result.errors) == 1
        assert result.errors[0].message == "Test error"
        assert result.errors[0].error_type == "TEST"

    def test_add_warning(self) -> None:
        """add_warning should add to warnings list."""
        result = ValidationResult()
        result.add_warning("Test warning")

        assert result.is_valid
        assert len(result.warnings) == 1
        assert result.warnings[0] == "Test warning"

    def test_summary_valid(self) -> None:
        """Summary for valid result."""
        result = ValidationResult()
        result.add_warning("Some warning")
        summary = result.summary()

        assert "Validation passed" in summary

    def test_summary_invalid(self) -> None:
        """Summary for invalid result."""
        result = ValidationResult()
        result.add_error("Error", error_type="TEST")
        summary = result.summary()

        assert "Validation failed" in summary


class TestValidateDiagram:
    """Tests for validate_diagram convenience function."""

    def test_validate_diagram_valid(self) -> None:
        """validate_diagram should return valid result."""
        diagram = _make_simple_diagram()
        result = validate_diagram(diagram)

        assert result.is_valid

    def test_validate_diagram_invalid(self) -> None:
        """validate_diagram should return invalid result."""
        diagram = _make_circular_diagram()
        result = validate_diagram(diagram)

        assert not result.is_valid


class TestValidateProcess:
    """Tests for validate_process."""

    def test_validate_process_valid(self) -> None:
        """Valid process should pass."""
        task = Task(name="Test Task")
        task.activities.append(
            ActivityCall(library="Flow", activity="Log", args=("Hello",))
        )
        process = Process(name="Test Process", tasks=[task])

        result = validate_process(process)
        assert result.is_valid

    def test_validate_process_null(self) -> None:
        """Null process should fail."""
        result = validate_process(None)
        assert not result.is_valid

    def test_validate_process_no_tasks(self) -> None:
        """Process without tasks should fail unless allowed."""
        process = Process(name="Empty Process", tasks=[])

        result = validate_process(process, allow_empty=False)
        assert not result.is_valid

    def test_validate_process_empty_allowed(self) -> None:
        """Empty process is allowed when specified."""
        process = Process(name="Empty Process", tasks=[])

        result = validate_process(process, allow_empty=True)
        assert result.is_valid


class TestDiagramConverterValidation:
    """Tests for validation integrated in DiagramConverter."""

    def test_convert_with_valid_diagram(self) -> None:
        """Should convert valid diagram successfully."""
        diagram = _make_simple_diagram()
        converter = DiagramConverter()
        process = converter.convert(diagram)

        assert process is not None
        assert process.name == "Test"

    def test_convert_with_circular_diagram_raises(self) -> None:
        """Should raise error for circular diagram."""
        diagram = _make_circular_diagram()
        converter = DiagramConverter()

        with pytest.raises(ValidationError):
            converter.convert(diagram)

    def test_convert_with_multi_start_raises(self) -> None:
        """Should raise error for multiple start nodes."""
        diagram = _make_multi_start_diagram()
        converter = DiagramConverter()

        with pytest.raises(ValidationError):
            converter.convert(diagram)

    def test_convert_with_no_start_returns_empty(self) -> None:
        """Diagram without start node returns empty process."""
        diagram = {
            "nodes": [
                {
                    "id": "act1",
                    "data": {
                        "blockData": {
                            "type": "activity",
                            "library": "Flow",
                            "activity": {"name": "Log", "library": "Flow"},
                        },
                        "activity": {"name": "Log", "library": "Flow"},
                    },
                },
                {"id": "end", "data": {"blockData": {"type": "end"}}},
            ],
            "edges": [],
        }
        converter = DiagramConverter()
        process = converter.convert(diagram)

        assert process.name == "Empty Process"


class TestEdgeCases:
    """Tests for edge cases."""

    def test_diagram_with_no_end_warning(self) -> None:
        """Diagram without end node should produce warning."""
        diagram = {
            "nodes": [
                {
                    "id": "start",
                    "data": {"blockData": {"type": "start", "processName": "Test"}},
                },
                {
                    "id": "act1",
                    "data": {
                        "blockData": {
                            "type": "activity",
                            "library": "Flow",
                            "activity": {"name": "Log", "library": "Flow"},
                        },
                        "activity": {"name": "Log", "library": "Flow"},
                    },
                },
            ],
            "edges": [
                {"source": "start", "target": "act1", "sourceHandle": None},
            ],
        }
        validator = ProcessValidator()
        result = validator.validate_diagram(diagram)

        assert result.is_valid
        assert len(result.warnings) > 0

    def test_invalid_node_type(self) -> None:
        """Node with invalid type should fail."""
        diagram = {
            "nodes": [
                {
                    "id": "start",
                    "data": {"blockData": {"type": "start", "processName": "Test"}},
                },
                {"id": "bad", "data": {"blockData": {"type": "invalid_type"}}},
                {"id": "end", "data": {"blockData": {"type": "end"}}},
            ],
            "edges": [
                {"source": "start", "target": "bad", "sourceHandle": None},
                {"source": "bad", "target": "end", "sourceHandle": None},
            ],
        }
        validator = ProcessValidator()
        result = validator.validate_diagram(diagram)

        assert not result.is_valid
        assert any(e.error_type == "INVALID_TYPE" for e in result.errors)

    def test_start_node_with_multiple_outgoing(self) -> None:
        """Start node with multiple outgoing edges should fail."""
        diagram = {
            "nodes": [
                {
                    "id": "start",
                    "data": {"blockData": {"type": "start", "processName": "Test"}},
                },
                {
                    "id": "act1",
                    "data": {
                        "blockData": {
                            "type": "activity",
                            "library": "Flow",
                            "activity": {"name": "Log", "library": "Flow"},
                        },
                        "activity": {"name": "Log", "library": "Flow"},
                    },
                },
                {
                    "id": "act2",
                    "data": {
                        "blockData": {
                            "type": "activity",
                            "library": "Flow",
                            "activity": {"name": "Log", "library": "Flow"},
                        },
                        "activity": {"name": "Log", "library": "Flow"},
                    },
                },
                {"id": "end", "data": {"blockData": {"type": "end"}}},
            ],
            "edges": [
                {"source": "start", "target": "act1", "sourceHandle": None},
                {"source": "start", "target": "act2", "sourceHandle": None},
                {"source": "act1", "target": "end", "sourceHandle": None},
                {"source": "act2", "target": "end", "sourceHandle": None},
            ],
        }
        validator = ProcessValidator()
        result = validator.validate_diagram(diagram)

        assert not result.is_valid
        assert any(e.error_type == "INVALID_START_CONNECTIONS" for e in result.errors)
