"""Tests for the Agentic Loop block (issue #736)."

Covers: scripted multi-step completion under mocked LLM tool-calls,
whitelist violation abort, iteration budget, timeout guardrail firing
inside agent-executed activities, converter/validator wiring.
"""

from __future__ import annotations

import json
import time
from typing import Any

import pytest

from rpaforge.core.activity import activity, library
from rpaforge.core.agentic import (
    EVENT_AGENTIC_ABORT,
    EVENT_AGENTIC_ITERATION,
    AgenticLoopGroup,
    build_tool_catalog,
    parse_agent_step,
)
from rpaforge.core.diagram_converter import DiagramConverter
from rpaforge.core.execution import ActivityCall, Process, Task
from rpaforge.core.executor import ProcessExecutor
from rpaforge.core.validator import ProcessValidator
from rpaforge.llm.client import LLMResult
from rpaforge_libraries.Flow import Flow

# ---------------------------------------------------------------- fakes


class _ScriptedAgent:
    """Fake LLM client scripting agent steps."""

    def __init__(self, texts: list[str]) -> None:
        self._texts = list(texts)
        self.model_name = "agent-model"
        self.prompts: list[list[dict[str, str]]] = []

    def chat(self, messages, *, model="", **_kwargs: Any):
        self.prompts.append([dict(m) for m in messages])
        return LLMResult(
            text=self._texts.pop(0),
            model=model,
            usage=None,
        )


def _patch(monkeypatch: pytest.MonkeyPatch, client: _ScriptedAgent) -> None:
    import rpaforge.core.executor as executor_module

    def _fake(model: str) -> tuple[_ScriptedAgent, str]:
        return client, client.model_name

    monkeypatch.setattr(executor_module, "resolve_llm_decision_client", _fake)


def _step_call(activity_id: str, **args: Any) -> str:
    return json.dumps(
        {"thought": "t", "action": "call", "activity": activity_id, "args": args}
    )


def _finish(result: Any) -> str:
    return json.dumps({"thought": "done", "action": "finish", "result": result})


def _make_group(**overrides: Any) -> AgenticLoopGroup:
    base: dict[str, Any] = {
        "goal": "Log two messages then finish",
        "allowed_activities": ["Flow.log_message", "Flow.timestamp"],
        "max_iterations": 5,
        "output_variable": "agent_result",
        "node_id": "ag-1",
    }
    base.update(overrides)
    return AgenticLoopGroup(**base)


def _make_executor() -> ProcessExecutor:
    executor = ProcessExecutor()
    executor.register_library("Flow", Flow())
    return executor


# ------------------------------------------------------- step protocol


class TestStepProtocol:
    def test_parse_call_step(self) -> None:
        step = parse_agent_step(_step_call("Flow.log_message", message="hi"))
        assert step.action == "call"
        assert step.activity == "Flow.log_message"
        assert step.args == {"message": "hi"}

    def test_parse_finish_step(self) -> None:
        step = parse_agent_step(_finish({"ok": True}))
        assert step.action == "finish"
        assert step.finish_result == {"ok": True}

    def test_bare_activity_string(self) -> None:
        step = parse_agent_step('"Flow.timestamp"')
        assert step.action == "call"
        assert step.activity == "Flow.timestamp"

    def test_invalid_json_raises(self) -> None:
        with pytest.raises(ValueError, match="not valid JSON"):
            parse_agent_step("banana")

    def test_unknown_action_raises(self) -> None:
        with pytest.raises(ValueError, match="Unknown agent action"):
            parse_agent_step(json.dumps({"action": "dance"}))


class TestToolCatalog:
    def test_unknown_activity_raises_keyerror(self) -> None:
        with pytest.raises(KeyError, match="Nope.nothing"):
            build_tool_catalog(["Nope.nothing"])

    def test_catalog_carries_registry_metadata(self) -> None:
        catalog = build_tool_catalog(["Flow.log_message"])
        entry = catalog[0]
        assert entry["id"] == "Flow.log_message"
        param_names = {p["name"] for p in entry["params"]}
        assert "message" in param_names


# ------------------------------------------------------------ executor


class TestAgentCompletion:
    """Acceptance: scripted 2-step task completes under mocked LLM."""

    def test_two_step_task_then_finish(self, monkeypatch: pytest.MonkeyPatch) -> None:
        client = _ScriptedAgent(
            [
                _step_call("Flow.log_message", message="step-one"),
                _step_call("Flow.log_message", message="step-two"),
                _finish("all-done"),
            ]
        )
        _patch(monkeypatch, client)

        events: list[tuple[str, tuple[Any, ...]]] = []
        executor = _make_executor()
        executor.add_listener(lambda etype, *args: events.append((etype, args)))

        result = executor.run(_process_with(_make_group(max_iterations=5)))

        assert result.status.value == "PASS"
        assert result.variables.get("agent_result") == "all-done"

        loop_result = next(
            a
            for a in result.task_results[0]["activities"]
            if a["type"] == "agentic_loop"
        )
        assert loop_result["aborted"] is False
        assert [
            e["activity"] for e in loop_result["transcript"] if e["action"] == "call"
        ] == [
            "Flow.log_message",
            "Flow.log_message",
        ]
        assert all(
            e["observation_status"] == "PASS"
            for e in loop_result["transcript"]
            if e["action"] == "call"
        )

        iterations = [e for e in events if e[0] == EVENT_AGENTIC_ITERATION]
        assert len(iterations) == 3

    def test_error_observation_feeds_back(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """A failing call becomes an error observation; agent recovers."""
        client = _ScriptedAgent(
            [
                # missing required 'message' arg -> call fails
                _step_call("Flow.log_message"),
                _step_call("Flow.log_message", message="recovered"),
                _finish("done"),
            ]
        )
        _patch(monkeypatch, client)

        executor = _make_executor()
        result = executor.run(_process_with(_make_group()))

        assert result.status.value == "PASS"
        transcript = next(
            a
            for a in result.task_results[0]["activities"]
            if a["type"] == "agentic_loop"
        )["transcript"]
        assert transcript[0]["observation_status"] == "FAIL"
        assert transcript[0]["observation_error"]
        assert transcript[1]["observation_status"] == "PASS"


class TestWhitelistSafeguard:
    """Acceptance: non-whitelisted request aborts to fallback, never executes."""

    def test_violation_aborts_to_fallback(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        client = _ScriptedAgent([_step_call("String.to_upper", text="x")])
        _patch(monkeypatch, client)

        events: list[tuple[str, tuple[Any, ...]]] = []
        executor = _make_executor()
        executor.add_listener(lambda etype, *args: events.append((etype, args)))

        fallback_ran: list[bool] = []

        class _CanaryLib:
            def canary(self) -> str:
                fallback_ran.append(True)
                return "fallback-ran"

        executor.register_library("CanaryLib", _CanaryLib())

        group = _make_group(
            fallback_activities=[ActivityCall(library="CanaryLib", activity="canary")]
        )
        result = executor.run(_process_with(group))

        assert result.status.value == "PASS"  # fallback path succeeded
        assert fallback_ran == [True]
        aborts = [e for e in events if e[0] == EVENT_AGENTIC_ABORT]
        assert len(aborts) == 1
        assert "Whitelist violation" in aborts[0][1][1]["reason"]

    def test_violation_without_fallback_fails_task(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        client = _ScriptedAgent([_step_call("String.to_upper", text="x")])
        _patch(monkeypatch, client)
        executor = _make_executor()
        result = executor.run(_process_with(_make_group()))
        assert result.status.value == "FAIL"
        assert "Whitelist violation" in str(result.message)


class TestBudgets:
    """Acceptance: max_iterations reached -> deterministic fallback routing."""

    def test_iteration_budget_exhaustion_routes_to_fallback(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        endless_call = _step_call("Flow.timestamp")
        client = _ScriptedAgent([endless_call] * 3 + [_finish("never-reached")])
        _patch(monkeypatch, client)

        executor = _make_executor()
        group = _make_group(
            max_iterations=3,
            fallback_activities=[
                ActivityCall(library="Flow", activity="log_message", args=("fb",))
            ],
        )
        result = executor.run(_process_with(group))

        assert result.status.value == "PASS"
        loop_result = next(
            a
            for a in result.task_results[0]["activities"]
            if a["type"] == "agentic_loop"
        )
        assert loop_result["aborted"] is True
        assert "Iteration budget exhausted" in loop_result["abort_reason"]
        # Transcript shows every attempt before the abort.
        assert len(loop_result["transcript"]) == 3


# -------------------------------------------------------- guardrails


class TestGuardrailsInsideAgentSteps:
    """Acceptance: timeout guardrail still fires on agent-executed activities."""

    def test_step_timeout_produces_fail_observation(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        client = _ScriptedAgent(
            [
                _step_call("Slow.slow_op"),
                _finish("survived"),
            ]
        )
        _patch(monkeypatch, client)

        # is_stateful=False so the executor does NOT disable the timeout
        # (stateful libraries run in-process without timeouts by design, #723).
        @library(name="Slow", category="Test", icon="🐌", is_stateful=False)
        class SlowLib:
            @activity(name="Slow Op", category="Test")
            def slow_op(self) -> str:
                time.sleep(1.0)
                return "finally"

        executor = _make_executor()
        executor.register_library("Slow", SlowLib())

        group = _make_group(allowed_activities=["Slow.slow_op"], step_timeout_ms=150)
        result = executor.run(_process_with(group))

        assert result.status.value == "PASS"
        loop_result = next(
            a
            for a in result.task_results[0]["activities"]
            if a["type"] == "agentic_loop"
        )
        call_entry = loop_result["transcript"][0]
        assert call_entry["observation_status"] == "FAIL"


class TestCircuitBreakerEngaged:
    """Agent-invoked activities flow through the standard machinery."""

    def test_circuit_breaker_tracks_agent_calls(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        client = _ScriptedAgent([_step_call("Flow.timestamp"), _finish(None)])
        _patch(monkeypatch, client)
        executor = _make_executor()
        executor.run(_process_with(_make_group(output_variable="")))
        assert any(key.endswith("timestamp") for key in executor._circuit_breakers)


# -------------------------------------------------- converter/validator


def _agentic_diagram(with_fallback: bool = True) -> dict[str, Any]:
    nodes: list[dict[str, Any]] = [
        {
            "id": "start-1",
            "data": {"blockData": {"type": "start", "processName": "Agentic"}},
        },
        {
            "id": "ag-1",
            "data": {
                "blockData": {
                    "type": "agentic-loop",
                    "goal": "Find invoice",
                    "allowed_activities": ["Flow.log_message"],
                    "max_iterations": 4,
                    "output_variable": "answer",
                }
            },
        },
        {
            "id": "fb-1",
            "data": {
                "blockData": {
                    "type": "activity",
                    "library": "Flow",
                    "activity": {"name": "log_message", "library": "Flow"},
                    "params": {"message": "fallback ran"},
                }
            },
        },
        {
            "id": "after-1",
            "data": {
                "blockData": {
                    "type": "activity",
                    "library": "Flow",
                    "activity": {"name": "log_message", "library": "Flow"},
                    "params": {"message": "continuing"},
                }
            },
        },
        {"id": "end-1", "data": {"blockData": {"type": "end", "status": "PASS"}}},
    ]
    edges: list[dict[str, Any]] = [
        {"source": "start-1", "target": "ag-1", "sourceHandle": "output"},
        {"source": "ag-1", "target": "after-1", "sourceHandle": "output"},
        {"source": "after-1", "target": "end-1", "sourceHandle": "output"},
    ]
    if with_fallback:
        edges.insert(
            1, {"source": "ag-1", "target": "fb-1", "sourceHandle": "fallback"}
        )
    return {"nodes": nodes, "edges": edges}


class TestConverterWiring:
    def test_agentic_block_builds_group(self) -> None:
        process = DiagramConverter().convert(_agentic_diagram())
        groups = [
            item
            for task in process.tasks
            for item in task.activities
            if isinstance(item, AgenticLoopGroup)
        ]
        assert len(groups) == 1
        group = groups[0]
        assert group.goal == "Find invoice"
        assert group.allowed_activities == ["Flow.log_message"]
        assert group.max_iterations == 4
        assert group.output_variable == "answer"
        # Fallback branch collected via handle.
        assert len(group.fallback_activities) == 1


class TestValidatorRules:
    def _diagram(self, block_data: dict[str, Any]) -> dict[str, Any]:
        return {
            "nodes": [
                {"id": "s", "data": {"blockData": {"type": "start"}}},
                {
                    "id": "g",
                    "data": {"blockData": {"type": "agentic-loop", **block_data}},
                },
                {"id": "e", "data": {"blockData": {"type": "end", "status": "PASS"}}},
            ],
            "edges": [{"source": "s", "target": "g"}, {"source": "g", "target": "e"}],
        }

    def _errors(self, diagram: dict[str, Any]) -> list[str]:
        return [
            e.error_type for e in ProcessValidator().validate_diagram(diagram).errors
        ]

    def test_valid_node_passes(self) -> None:
        errors = self._errors(
            self._diagram(
                {
                    "goal": "g",
                    "allowed_activities": ["Flow.log_message"],
                    "max_iterations": 3,
                }
            )
        )
        assert not errors

    def test_missing_goal_rejected(self) -> None:
        errors = self._errors(
            self._diagram({"allowed_activities": ["Flow.log_message"]})
        )
        assert "MISSING_GOAL" in errors

    def test_empty_whitelist_rejected(self) -> None:
        errors = self._errors(self._diagram({"goal": "g", "allowed_activities": []}))
        assert "INVALID_AGENTIC_WHITELIST" in errors

    def test_malformed_activity_id_rejected(self) -> None:
        errors = self._errors(
            self._diagram({"goal": "g", "allowed_activities": ["justname"]})
        )
        assert "INVALID_AGENTIC_ACTIVITY_ID" in errors

    def test_bad_iterations_rejected(self) -> None:
        errors = self._errors(
            self._diagram(
                {
                    "goal": "g",
                    "allowed_activities": ["Flow.log_message"],
                    "max_iterations": 0,
                }
            )
        )
        assert "INVALID_MAX_ITERATIONS" in errors


# ---------------------------------------------------------------- helpers


def _process_with(group: AgenticLoopGroup) -> Process:
    task = Task(name="main")
    task.activities.append(group)
    process = Process(name="agentic-test")
    process.tasks.append(task)
    return process
