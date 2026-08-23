"""Core-side tests for the approval block lowering (issue #748, part 1)."""

from __future__ import annotations

from typing import Any

import pytest

from rpaforge.core.diagram_converter import DiagramConverter
from rpaforge.core.execution import TryCatchGroup
from rpaforge.core.validator import ProcessValidator


def _approval_diagram(block_data: dict[str, Any]) -> dict[str, Any]:
    return {
        "nodes": [
            {"id": "s", "data": {"blockData": {"type": "start"}}},
            {"id": "a", "data": {"blockData": {"type": "approval", **block_data}}},
            {
                "id": "fb",
                "data": {
                    "blockData": {
                        "type": "activity",
                        "library": "Flow",
                        "activity": {"name": "log_message", "library": "Flow"},
                        "params": {"message": "rejected path"},
                    }
                },
            },
            {"id": "e", "data": {"blockData": {"type": "end", "status": "PASS"}}},
        ],
        "edges": [
            {"source": "s", "target": "a", "sourceHandle": "output"},
            {"source": "a", "target": "e", "sourceHandle": "output"},
            {"source": "a", "target": "fb", "sourceHandle": "rejected"},
            {"source": "fb", "target": "e", "sourceHandle": "output"},
        ],
    }


VALID = {
    "question": "Ship release 1.0?",
    "on_reject": "fallback",
    "timeout_ttl": 300,
}


class TestApprovalValidator:
    def _errors(self, diagram: dict[str, Any]) -> list[str]:
        result = ProcessValidator().validate_diagram(diagram)
        return [e.error_type for e in result.errors]

    def test_valid_node_passes(self) -> None:
        assert self._errors(_approval_diagram(VALID)) == []

    def test_missing_question_rejected(self) -> None:
        errors = self._errors(_approval_diagram({**VALID, "question": "   "}))
        assert "MISSING_QUESTION" in errors

    @pytest.mark.parametrize("bad", ["auto", "", "APPLY"])
    def test_invalid_on_reject_rejected(self, bad: str) -> None:
        errors = self._errors(_approval_diagram({**VALID, "on_reject": bad}))
        assert "INVALID_ON_REJECT" in errors

    def test_on_reject_fail_passes_without_fallback_edge(self) -> None:
        diagram = _approval_diagram({**VALID, "on_reject": "fail"})
        diagram["edges"] = [
            e for e in diagram["edges"] if e.get("sourceHandle") != "rejected"
        ]
        assert self._errors(diagram) == []


class TestApprovalLowering:
    def test_lowes_to_try_catch_with_hitl_call(self) -> None:
        process = DiagramConverter().convert(_approval_diagram(VALID))
        groups = [
            item
            for task in process.tasks
            for item in task.activities
            if isinstance(item, TryCatchGroup)
        ]
        assert len(groups) == 1
        group = groups[0]
        call = group.try_activities[0]
        assert (call.library, call.activity) == ("__hitl__", "Request Approval")
        assert call.kwargs["question"] == "Ship release 1.0?"
        assert call.kwargs["ttl_seconds"] == 300.0
        assert call.node_id == "a"
        # rejected branch collected as catch activities
        assert len(group.catch_activities) == 1

    def test_output_variable_passthrough(self) -> None:
        diagram = _approval_diagram({**VALID, "output_variable": "token"})
        process = DiagramConverter().convert(diagram)
        group = next(
            item
            for task in process.tasks
            for item in task.activities
            if isinstance(item, TryCatchGroup)
        )
        assert group.try_activities[0].output_variable == "token"
