"""Tests for the LLM Decision diagram block (issue #735)."

Covers converter mapping (N options -> branch handles), validator rules
(>=2 options, existing fallback) and runtime routing incl. fallback
safety semantics.
"""

from __future__ import annotations

import json
from typing import Any

import pytest

from rpaforge.core.diagram_converter import DiagramConverter
from rpaforge.core.execution import (
    EVENT_LLM_DECISION_FALLBACK,
    ActivityCall,
    LLMDecisionGroup,
    Process,
    Task,
)
from rpaforge.core.executor import ProcessExecutor
from rpaforge.core.validator import ProcessValidator
from rpaforge.llm.client import LLMResult
from rpaforge_libraries.Flow import Flow

# ---------------------------------------------------------------- fixtures


class _ScriptedLLM:
    """Fake LLM client returning scripted responses."""

    def __init__(self, texts: list[str]) -> None:
        self._texts = list(texts)
        self.prompts: list[list[dict[str, str]]] = []

    def chat(self, messages, *, model, **_kwargs: Any):
        self.prompts.append([dict(m) for m in messages])
        return LLMResult(text=self._texts.pop(0), model=model)


def _patch_client(
    monkeypatch: pytest.MonkeyPatch, client: _ScriptedLLM, model: str = "test-model"
) -> None:
    import rpaforge.core.executor as executor_module

    def _fake(model_arg: str) -> tuple[_ScriptedLLM, str]:
        return client, model or model_arg

    monkeypatch.setattr(executor_module, "resolve_llm_decision_client", _fake)


def _decision_process(
    question: str = "Which folder holds the invoice?",
    options: list[dict[str, str]] | None = None,
    fallback_option: str = "other",
    model: str = "",
    include_b_activity: bool = True,
) -> Process:
    if options is None:
        options = [
            {"id": "invoices", "value": "invoices", "label": "Invoices folder"},
            {"id": "other", "value": "other", "label": "Other folder"},
        ]
    task = Task(name="main")
    invoices_call = ActivityCall(
        library="Flow",
        activity="log_message",
        args=("went-invoices",),
        output_variable="route",
    )
    other_call = ActivityCall(
        library="Flow",
        activity="log_message",
        args=("went-other",),
        output_variable="route",
    )
    branches: dict[str, list[ActivityCall]] = {"invoices": [invoices_call]}
    if include_b_activity:
        branches["other"] = [other_call]
    task.activities.append(
        LLMDecisionGroup(
            question=question,
            options=options,
            model=model,
            fallback_option=fallback_option,
            branches=branches,
            node_id="dec-1",
        )
    )
    process = Process(name="llm-decision-test")
    process.tasks.append(task)
    return process


def _make_executor() -> ProcessExecutor:
    executor = ProcessExecutor()
    executor.register_library("Flow", Flow())
    return executor


def _decision_diagram() -> dict[str, Any]:
    """Minimal valid diagram: start -> llm-decision -> two branches -> shared end."""
    return {
        "nodes": [
            {
                "id": "start-1",
                "data": {"blockData": {"type": "start", "processName": "Decision"}},
            },
            {
                "id": "dec-1",
                "data": {
                    "blockData": {
                        "type": "llm-decision",
                        "question": "Where does the document go?",
                        "model": "",
                        "fallback_option": "archive",
                        "options": [
                            {
                                "id": "invoices",
                                "value": "invoices",
                                "label": "Invoices",
                            },
                            {"id": "archive", "value": "archive", "label": "Archive"},
                            {"id": "orphan", "value": "orphan", "label": "Orphan"},
                        ],
                    }
                },
            },
            {
                "id": "inv-1",
                "data": {
                    "blockData": {
                        "type": "activity",
                        "library": "Flow",
                        "activity": {"name": "log_message", "library": "Flow"},
                        "params": {"message": "invoice path"},
                    }
                },
            },
            {
                "id": "arc-1",
                "data": {
                    "blockData": {
                        "type": "activity",
                        "library": "Flow",
                        "activity": {"name": "log_message", "library": "Flow"},
                        "params": {"message": "archive path"},
                    }
                },
            },
            {
                "id": "end-1",
                "data": {"blockData": {"type": "end", "status": "PASS"}},
            },
        ],
        "edges": [
            {"source": "start-1", "target": "dec-1", "sourceHandle": "output"},
            {"source": "dec-1", "target": "inv-1", "sourceHandle": "option:invoices"},
            {"source": "dec-1", "target": "arc-1", "sourceHandle": "option:archive"},
            {"source": "inv-1", "target": "end-1", "sourceHandle": "output"},
            {"source": "arc-1", "target": "end-1", "sourceHandle": "output"},
        ],
    }


# ------------------------------------------------------------ converter


class TestConverterMapping:
    """Acceptance: Converter maps N options to distinct branch handles."""

    def test_options_map_to_branches(self) -> None:
        process = DiagramConverter().convert(_decision_diagram())
        groups = [
            item
            for task in process.tasks
            for item in task.activities
            if isinstance(item, LLMDecisionGroup)
        ]
        assert len(groups) == 1
        group = groups[0]
        assert set(group.branches) == {"invoices", "archive"}
        assert group.question == "Where does the document go?"
        assert group.fallback_option == "archive"
        assert [o["id"] for o in group.options] == ["invoices", "archive", "orphan"]
        # Each branch carries its own activity up to the merge (end-1 excluded).
        assert all(len(items) == 1 for items in group.branches.values())

    def test_unconnected_option_has_no_branch(self) -> None:
        process = DiagramConverter().convert(_decision_diagram())
        group = next(
            item
            for task in process.tasks
            for item in task.activities
            if isinstance(item, LLMDecisionGroup)
        )
        assert "orphan" not in group.branches

    def test_existing_diagrams_unchanged(self) -> None:
        """A plain if-diagram converts exactly as before (backward compat)."""
        activity_block = lambda: {  # noqa: E731
            "blockData": {
                "type": "activity",
                "library": "Flow",
                "activity": {"name": "log_message", "library": "Flow"},
                "params": {},
            }
        }
        diagram = {
            "nodes": [
                {
                    "id": "s",
                    "data": {"blockData": {"type": "start", "processName": "P"}},
                },
                {
                    "id": "cond",
                    "data": {"blockData": {"type": "if", "condition": "1 > 2"}},
                },
                {"id": "act-true", "data": activity_block()},
                {"id": "act-false", "data": activity_block()},
            ],
            "edges": [
                {"source": "s", "target": "cond", "sourceHandle": "output"},
                {"source": "cond", "target": "act-true", "sourceHandle": "true"},
                {"source": "cond", "target": "act-false", "sourceHandle": "false"},
            ],
        }
        process = DiagramConverter().convert(diagram)
        assert not any(
            isinstance(item, LLMDecisionGroup)
            for task in process.tasks
            for item in task.activities
        )


# ------------------------------------------------------------ validator


class TestValidatorRules:
    """Acceptance: validator rejects 0/1-option nodes and unknown fallback."""

    def _diagram_with_node(self, block_data: dict[str, Any]) -> dict[str, Any]:
        return {
            "nodes": [
                {"id": "s", "data": {"blockData": {"type": "start"}}},
                {
                    "id": "d",
                    "data": {"blockData": {"type": "llm-decision", **block_data}},
                },
                {
                    "id": "a",
                    "data": {
                        "blockData": {
                            "type": "assign",
                            "variableName": "x",
                            "expression": "1",
                        }
                    },
                },
                {
                    "id": "b",
                    "data": {
                        "blockData": {
                            "type": "assign",
                            "variableName": "y",
                            "expression": "2",
                        }
                    },
                },
                {"id": "e", "data": {"blockData": {"type": "end", "status": "PASS"}}},
            ],
            "edges": [
                {"source": "s", "target": "d", "sourceHandle": "output"},
                {"source": "d", "target": "a", "sourceHandle": "option:x"},
                {"source": "d", "target": "b", "sourceHandle": "option:y"},
                {"source": "a", "target": "e", "sourceHandle": "output"},
                {"source": "b", "target": "e", "sourceHandle": "output"},
            ],
        }

    def _errors(self, diagram: dict[str, Any]) -> list[str]:
        result = ProcessValidator().validate_diagram(diagram)
        return [e.error_type for e in result.errors]

    def test_zero_or_one_option_rejected(self) -> None:
        errors = self._errors(
            self._diagram_with_node(
                {
                    "question": "q",
                    "fallback_option": "only",
                    "options": [{"id": "only", "value": "only", "label": "Only"}],
                }
            )
        )
        assert "INVALID_LLM_DECISION_OPTIONS" in errors

    def test_two_options_accepted(self) -> None:
        errors = self._errors(
            self._diagram_with_node(
                {
                    "question": "q",
                    "fallback_option": "y",
                    "options": [
                        {"id": "x", "value": "x", "label": "X"},
                        {"id": "y", "value": "y", "label": "Y"},
                    ],
                }
            )
        )
        assert not errors

    def test_missing_fallback_rejected(self) -> None:
        errors = self._errors(
            self._diagram_with_node(
                {
                    "question": "q",
                    "options": [
                        {"id": "x", "value": "x", "label": "X"},
                        {"id": "y", "value": "y", "label": "Y"},
                    ],
                }
            )
        )
        assert "MISSING_FALLBACK_OPTION" in errors

    def test_unknown_fallback_rejected(self) -> None:
        errors = self._errors(
            self._diagram_with_node(
                {
                    "question": "q",
                    "fallback_option": "nope",
                    "options": [
                        {"id": "x", "value": "x", "label": "X"},
                        {"id": "y", "value": "y", "label": "Y"},
                    ],
                }
            )
        )
        assert "UNKNOWN_FALLBACK_OPTION" in errors

    def test_unknown_handle_warns(self) -> None:
        diagram = self._diagram_with_node(
            {
                "question": "q",
                "fallback_option": "y",
                "options": [
                    {"id": "x", "value": "x", "label": "X"},
                    {"id": "y", "value": "y", "label": "Y"},
                ],
            }
        )
        diagram["edges"].append(
            {"source": "d", "target": "a", "sourceHandle": "option:ghost"}
        )
        result = ProcessValidator().validate_diagram(diagram)
        assert any("unknown handle 'option:ghost'" in w for w in result.warnings)


# ------------------------------------------------------------ executor


class TestRuntimeRouting:
    """Acceptance: mocked valid id routes; garbage lands on fallback+warning."""

    def test_valid_option_routes_to_matching_branch(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        client = _ScriptedLLM([json.dumps({"option": "invoices"})])
        _patch_client(monkeypatch, client)

        executor = _make_executor()
        result = executor.run(_decision_process())

        assert result.status.value == "PASS"
        assert result.variables.get("route") == "went-invoices"

    def test_garbage_output_falls_back_with_event(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        client = _ScriptedLLM(["total garbage, not JSON"])
        _patch_client(monkeypatch, client)

        events: list[tuple[str, tuple[Any, ...]]] = []
        executor = _make_executor()
        executor.add_listener(
            lambda event_type, *args: events.append((event_type, args))
        )
        result = executor.run(_decision_process())

        assert result.status.value == "PASS"
        assert result.variables.get("route") == "went-other"
        fallback_events = [e for e in events if e[0] == EVENT_LLM_DECISION_FALLBACK]
        assert len(fallback_events) == 1
        node_id, payload = fallback_events[0][1]
        assert node_id == "dec-1"
        assert payload["fallback_option"] == "other"

    def test_unknown_option_id_falls_back(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        client = _ScriptedLLM([json.dumps({"option": "does-not-exist"})])
        _patch_client(monkeypatch, client)
        executor = _make_executor()
        result = executor.run(_decision_process())
        assert result.status.value == "PASS"
        assert result.variables.get("route") == "went-other"

    def test_raw_text_option_id_accepted(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """Models may answer with the bare id instead of JSON - accept it."""
        client = _ScriptedLLM(['"invoices"'])
        _patch_client(monkeypatch, client)
        executor = _make_executor()
        result = executor.run(_decision_process())
        assert result.variables.get("route") == "went-invoices"

    def test_llm_error_falls_back(self, monkeypatch: pytest.MonkeyPatch) -> None:
        class _BrokenClient:
            def chat(self, *_a: Any, **_kw: Any) -> Any:
                raise ConnectionError("endpoint unreachable")

        _patch_client(monkeypatch, _BrokenClient())  # type: ignore[arg-type]
        executor = _make_executor()
        result = executor.run(_decision_process())
        assert result.status.value == "PASS"
        assert result.variables.get("route") == "went-other"

    def test_no_fallback_configured_fails_task(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        client = _ScriptedLLM(["garbage"])
        _patch_client(monkeypatch, client)
        executor = _make_executor()
        process = _decision_process(fallback_option="")
        result = executor.run(process)
        assert result.status.value == "FAIL"
        assert "no valid fallback_option" in str(result.message)

    def test_prompt_contains_question_and_options(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        client = _ScriptedLLM([json.dumps({"option": "invoices"})])
        _patch_client(monkeypatch, client)
        executor = _make_executor()
        executor.run(_decision_process(question="Pick a folder"))
        user_prompt = client.prompts[0][1]["content"]
        assert "Pick a folder" in user_prompt
        assert '"invoices"' in user_prompt
