"""Regression tests for surfacing nodes skipped due to missing activity data."""

from __future__ import annotations

import logging
from typing import Any

import pytest

from rpaforge.core.diagram_converter import DiagramConverter
from rpaforge.core.validator import ValidationResult


def _linear_diagram_with(broken_nodes: list[dict[str, Any]]) -> dict[str, Any]:
    """Build a start -> broken_1 -> ... -> broken_n -> end diagram."""
    nodes: list[dict[str, Any]] = [
        {"id": "start", "data": {"blockData": {"type": "start", "processName": "T"}}}
    ]
    for index in range(len(broken_nodes)):
        nodes.append({"id": f"broken_{index}", "data": broken_nodes[index]})
    nodes.append({"id": "end", "data": {"blockData": {"type": "end"}}})

    edges: list[dict[str, Any]] = [{"source": "start", "target": "broken_0"}]
    for index in range(len(broken_nodes) - 1):
        edges.append({"source": f"broken_{index}", "target": f"broken_{index + 1}"})
    edges.append({"source": f"broken_{len(broken_nodes) - 1}", "target": "end"})

    return {"nodes": nodes, "edges": edges}


class TestSkippedNodeWarnings:
    """Nodes without data.activity must warn instead of vanishing silently."""

    def test_missing_activity_is_lenient_but_recorded(self) -> None:
        """Conversion succeeds and the broken node is exposed as skipped."""
        diagram = _linear_diagram_with(
            [{"blockData": {"type": "activity", "label": "Orphan Step"}}]
        )

        converter = DiagramConverter()
        process = converter.convert(diagram)

        assert process.tasks[0].activities == []
        assert converter.skipped_node_ids == ["broken_0"]

    def test_warning_threaded_into_validation_result(self) -> None:
        """Caller-provided ValidationResult receives one warning per skip."""
        diagram = _linear_diagram_with(
            [
                {"blockData": {"type": "activity", "label": "Orphan One"}},
                {"blockData": {"type": "activity", "label": "Orphan Two"}},
            ]
        )
        validation_result = ValidationResult()

        DiagramConverter().convert(diagram, validation_result=validation_result)

        assert validation_result.is_valid
        assert len(validation_result.warnings) == 2
        assert all("broken_" in warning for warning in validation_result.warnings)

    def test_warning_message_includes_node_id_and_name(self) -> None:
        """Warning text names both the node id and its display label."""
        diagram = _linear_diagram_with(
            [{"blockData": {"type": "activity", "label": "Fill Invoice"}}]
        )

        validation_result = ValidationResult()
        DiagramConverter().convert(diagram, validation_result=validation_result)
        warnings = validation_result.warnings

        assert warnings == [
            "Node 'broken_0' (Fill Invoice) has no activity data and was skipped"
        ]

    def test_skip_emits_logger_warning(self, caplog: pytest.LogCaptureFixture) -> None:
        """A logger.warning carrying id and name is emitted at skip time."""
        diagram = _linear_diagram_with(
            [{"blockData": {"type": "activity", "label": "Send Email"}}]
        )

        with caplog.at_level(logging.WARNING, logger="rpaforge.converter"):
            DiagramConverter().convert(diagram)

        messages = [record.message for record in caplog.records]
        assert any("broken_0" in message for message in messages)
        assert any("Send Email" in message for message in messages)

    def test_node_without_block_data_is_skipped_when_validation_passes(
        self,
    ) -> None:
        """A data-less node defaults to activity type and is skipped with a warning."""
        diagram = _linear_diagram_with([{}])
        validation_result = ValidationResult()

        converter = DiagramConverter()
        process = converter.convert(diagram, validation_result=validation_result)

        assert process.tasks[0].activities == []
        assert converter.skipped_node_ids == ["broken_0"]
        assert validation_result.warnings == [
            "Node 'broken_0' has no activity data and was skipped"
        ]

    def test_valid_diagram_produces_no_warnings(self) -> None:
        """A fully wired activity diagram yields zero skips and zero warnings."""
        diagram = {
            "nodes": [
                {
                    "id": "start",
                    "data": {"blockData": {"type": "start", "processName": "T"}},
                },
                {
                    "id": "act",
                    "data": {
                        "blockData": {"type": "activity", "library": "Flow"},
                        "activity": {"name": "Step1", "library": "Flow"},
                        "activityValues": {},
                    },
                },
                {"id": "end", "data": {"blockData": {"type": "end"}}},
            ],
            "edges": [
                {"source": "start", "target": "act"},
                {"source": "act", "target": "end"},
            ],
        }
        validation_result = ValidationResult()

        converter = DiagramConverter()
        converter.convert(diagram, validation_result=validation_result)

        assert converter.skipped_node_ids == []
        assert validation_result.warnings == []
