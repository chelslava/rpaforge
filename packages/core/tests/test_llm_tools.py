"""Tests for provider-native tool calling (issue #900).

Covers ToolSpec/ToolCall primitives, catalog → JSON-schema building,
fail-closed argument validation, adapter round-trips over
httpx.MockTransport, and the agentic-loop / llm-decision migration with
graceful JSON-text fallback.
"""

from __future__ import annotations

import json
from typing import Any

import pytest

from rpaforge.core import executor
from rpaforge.core.agentic import build_tool_catalog
from rpaforge.llm import LLMResponseError, LLMResult
from rpaforge.llm.tools import (
    ToolValidationError,
    build_tool_specs,
    finish_tool_spec,
    sanitize_tool_name,
    validate_tool_arguments,
)
from rpaforge_libraries.Flow import Flow

httpx = pytest.importorskip("httpx")

# ------------------------------------------------------------ primitives


class TestToolSpecBuilding:
    def test_catalog_builds_typed_specs(self) -> None:
        ex = executor.ProcessExecutor()
        ex.register_library("Flow", Flow())
        catalog = build_tool_catalog(["Flow.log_message"])
        specs = build_tool_specs(catalog)
        assert len(specs) == 1
        spec = specs[0]
        assert spec.name == "Flow_log_message"
        assert spec.registry_id == "Flow.log_message"
        schema = spec.parameters
        assert schema["type"] == "object"
        assert "message" in schema["properties"]
        assert schema["properties"]["message"]["type"] == "string"

    def test_names_sanitized_to_provider_grammar(self) -> None:
        assert sanitize_tool_name("MCP:server.tool-method") == (
            "MCP_server_tool-method"
        )
        assert sanitize_tool_name("Excel.Read Range") == "Excel_Read_Range"
        assert len(sanitize_tool_name("x" * 100)) <= 64

    def test_required_params_marked_in_schema(self) -> None:
        catalog = [
            {
                "id": "Lib.act",
                "name": "act",
                "description": "d",
                "params": [
                    {"name": "must", "type": "integer", "required": True},
                    {"name": "opt", "type": "string", "required": False},
                ],
            }
        ]
        spec = build_tool_specs(catalog)[0]
        assert spec.parameters["required"] == ["must"]
        assert spec.parameters["properties"]["must"]["type"] == "integer"

    def test_finish_tool_spec(self) -> None:
        spec = finish_tool_spec()
        assert spec.registry_id == spec.name
        assert "result" in spec.parameters["properties"]


class TestValidateToolArguments:
    def _spec(self) -> Any:
        catalog = [
            {
                "id": "Lib.act",
                "name": "act",
                "description": "d",
                "params": [
                    {"name": "path", "type": "string", "required": True},
                    {"name": "count", "type": "integer", "required": False},
                ],
            }
        ]
        return build_tool_specs(catalog)[0]

    def test_valid_arguments_pass(self) -> None:
        spec = self._spec()
        validate_tool_arguments(spec, {"path": "x", "count": 2})

    def test_missing_required_fails_closed(self) -> None:
        with pytest.raises(ToolValidationError, match="required argument"):
            validate_tool_arguments(self._spec(), {})

    def test_unknown_key_fails_closed(self) -> None:
        with pytest.raises(ToolValidationError, match="unknown argument"):
            validate_tool_arguments(self._spec(), {"path": "x", "evil": 1})

    def test_wrong_type_fails_closed(self) -> None:
        with pytest.raises(ToolValidationError, match="must be integer"):
            validate_tool_arguments(self._spec(), {"path": "x", "count": "2"})

    def test_bool_is_not_integer(self) -> None:
        with pytest.raises(ToolValidationError):
            validate_tool_arguments(self._spec(), {"path": "x", "count": True})

    def test_non_object_arguments_fail(self) -> None:
        with pytest.raises(ToolValidationError, match="must be an object"):
            validate_tool_arguments(self._spec(), ["not", "a", "dict"])  # type: ignore[arg-type]


# ------------------------------------------------------ adapter round-trips


class TestOpenAIToolCalling:
    def _client(self, handler: Any) -> Any:
        from rpaforge.llm.openai_compat import OpenAICompatClient

        return OpenAICompatClient(
            base_url="https://openai.test",
            api_key="sk-test",
            timeout=5.0,
            transport=httpx.MockTransport(handler),
        )

    def test_tools_attached_to_payload_and_call_round_trip(self) -> None:
        seen: dict[str, Any] = {}

        def handler(request: httpx.Request) -> httpx.Response:
            seen["payload"] = json.loads(request.content.decode("utf-8"))
            return httpx.Response(
                200,
                json={
                    "model": "m",
                    "choices": [
                        {
                            "finish_reason": "tool_calls",
                            "message": {
                                "role": "assistant",
                                "content": None,
                                "tool_calls": [
                                    {
                                        "id": "call_1",
                                        "type": "function",
                                        "function": {
                                            "name": "Flow_log_message",
                                            "arguments": '{"message": "hi"}',
                                        },
                                    },
                                    {
                                        "id": "call_2",
                                        "type": "function",
                                        "function": {
                                            "name": "Flow_timestamp",
                                            "arguments": "{}",
                                        },
                                    },
                                ],
                            },
                        }
                    ],
                    "usage": {"prompt_tokens": 5, "completion_tokens": 7},
                },
            )

        spec = build_tool_specs(
            [
                {
                    "id": "Flow.log_message",
                    "name": "log_message",
                    "description": "Log a message",
                    "params": [{"name": "message", "type": "string", "required": True}],
                }
            ]
        )[0]
        result = self._client(handler).chat(
            [{"role": "user", "content": "go"}],
            model="m",
            tools=[spec],
        )
        payload = seen["payload"]
        assert payload["tools"][0]["function"]["name"] == "Flow_log_message"
        assert payload["tool_choice"] == "auto"
        assert len(result.tool_calls) == 2
        first = result.tool_calls[0]
        assert first.name == "Flow_log_message"
        assert first.arguments == {"message": "hi"}
        assert first.call_id == "call_1"
        assert result.text == ""

    def test_malformed_tool_arguments_raise_typed_error(self) -> None:
        def handler(request: httpx.Request) -> httpx.Response:
            return httpx.Response(
                200,
                json={
                    "model": "m",
                    "choices": [
                        {
                            "finish_reason": "tool_calls",
                            "message": {
                                "role": "assistant",
                                "tool_calls": [
                                    {
                                        "id": "call_1",
                                        "type": "function",
                                        "function": {
                                            "name": "broken",
                                            "arguments": "{not json",
                                        },
                                    }
                                ],
                            },
                        }
                    ],
                    "usage": {},
                },
            )

        with pytest.raises(LLMResponseError, match="not valid JSON"):
            self._client(handler).chat([{"role": "user", "content": "x"}], model="m")

    def test_text_only_call_unchanged_without_tools(self) -> None:
        def handler(request: httpx.Request) -> httpx.Response:
            payload = json.loads(request.content.decode("utf-8"))
            assert "tools" not in payload
            return httpx.Response(
                200,
                json={
                    "model": "m",
                    "choices": [
                        {
                            "finish_reason": "stop",
                            "message": {"role": "assistant", "content": "ok"},
                        }
                    ],
                    "usage": {},
                },
            )

        result = self._client(handler).chat(
            [{"role": "user", "content": "x"}], model="m"
        )
        assert result.tool_calls == ()
        assert result.text == "ok"


class TestAnthropicToolCalling:
    def _client(self, handler: Any) -> Any:
        from rpaforge.llm.anthropic import AnthropicClient

        return AnthropicClient(
            base_url="https://anthropic.test",
            api_key="sk-ant-test",
            timeout=5.0,
            transport=httpx.MockTransport(handler),
        )

    def test_tools_sent_as_input_schema_and_parsed_back(self) -> None:
        seen: dict[str, Any] = {}

        def handler(request: httpx.Request) -> httpx.Response:
            seen["payload"] = json.loads(request.content.decode("utf-8"))
            return httpx.Response(
                200,
                json={
                    "id": "msg_1",
                    "type": "message",
                    "role": "assistant",
                    "model": "claude-test",
                    "content": [
                        {
                            "type": "tool_use",
                            "id": "tu_1",
                            "name": "Flow_log_message",
                            "input": {"message": "hi"},
                        },
                        {
                            "type": "tool_use",
                            "id": "tu_2",
                            "name": "report_finish",
                            "input": {"result": "done"},
                        },
                    ],
                    "stop_reason": "tool_use",
                    "usage": {"input_tokens": 5, "output_tokens": 7},
                },
            )

        spec = build_tool_specs(
            [
                {
                    "id": "Flow.log_message",
                    "name": "log_message",
                    "description": "Log",
                    "params": [{"name": "message", "type": "string", "required": True}],
                }
            ]
        )[0]
        result = self._client(handler).chat(
            [{"role": "user", "content": "go"}], model="m", tools=[spec]
        )
        assert seen["payload"]["tools"][0]["input_schema"]["type"] == "object"
        assert len(result.tool_calls) == 2
        assert result.tool_calls[0].call_id == "tu_1"
        assert result.tool_calls[1].arguments == {"result": "done"}


# --------------------------------------------------- agentic loop migration


class _NativeAgent:
    """Fake LLM client exercising native tool calls."""

    supports_tools = True

    def __init__(self, rounds: list[Any] | None = None) -> None:
        self._rounds = list(rounds or [])
        self.model_name = "native-model"
        self.calls: list[dict[str, Any]] = []

    def chat(self, messages, *, model="", **kwargs: Any):  # noqa: ARG002
        self.calls.append({"kwargs": kwargs, "n_messages": len(messages)})
        return self._rounds.pop(0)


def _make_group(**overrides: Any) -> Any:
    from rpaforge.core.agentic import AgenticLoopGroup
    from rpaforge.core.execution import Process, Task

    base: dict[str, Any] = {
        "goal": "Log then finish",
        "allowed_activities": ["Flow.log_message"],
        "max_iterations": 5,
        "output_variable": "agent_result",
        "node_id": "ag-native",
    }
    base.update(overrides)
    group = AgenticLoopGroup(**base)
    task = Task(name="main")
    task.activities.append(group)
    process = Process(name="agentic-native-test")
    process.tasks.append(task)
    return process


def _tool_result(name: str, arguments: dict[str, Any], call_id: str = "c1") -> Any:
    from rpaforge.llm.tools import ToolCall

    return LLMResult(
        text="",
        model="native-model",
        tool_calls=(ToolCall(name=name, arguments=arguments, call_id=call_id),),
    )


def _run_loop(executor_obj: Any, result: Any) -> dict[str, Any]:
    return next(
        a for a in result.task_results[0]["activities"] if a["type"] == "agentic_loop"
    )


class TestAgenticNativeMode:
    def _patch(self, monkeypatch: pytest.MonkeyPatch, client: Any) -> None:
        def _fake(model: str, cancel_token: object = None) -> tuple[Any, str]:
            return client, client.model_name

        monkeypatch.setattr(executor, "resolve_llm_decision_client", _fake)

    def _executor(self) -> Any:
        ex = executor.ProcessExecutor()
        ex.register_library("Flow", Flow())
        return ex

    def test_native_round_trip_call_then_finish(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        client = _NativeAgent(
            [
                _tool_result("Flow_log_message", {"message": "hi"}),
                _tool_result("report_finish", {"result": "logged"}),
            ]
        )
        self._patch(monkeypatch, client)
        ex = self._executor()
        result = ex.run(_make_group())
        loop_result = _run_loop(ex, result)
        assert result.status.value == "PASS"
        assert loop_result["aborted"] is False
        assert loop_result["result"] == "logged"
        assert [e["action"] for e in loop_result["transcript"]] == [
            "call",
            "finish",
        ]
        assert loop_result["transcript"][0]["mode"] == "native"
        assert loop_result["transcript"][0]["activity"] == "Flow.log_message"
        # The tools= payload reached the client with catalog + finish tool.
        assert client.calls[0]["kwargs"]["tools"] is not None
        assert any(
            s.name == "report_finish" for s in client.calls[0]["kwargs"]["tools"]
        )

    def test_text_response_still_parsed_in_native_mode(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        # A model that answers with the JSON-text protocol despite tools
        # being advertised must keep working (parse_agent_step path).
        client = _NativeAgent(
            [
                LLMResult(
                    text=json.dumps(
                        {"thought": "t", "action": "finish", "result": "ok"}
                    ),
                    model="native-model",
                )
            ]
        )
        self._patch(monkeypatch, client)
        result = self._executor().run(_make_group())
        assert result.status.value == "PASS"
        assert result.variables.get("agent_result") == "ok"

    def test_invalid_arguments_fail_closed(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        client = _NativeAgent([_tool_result("Flow_log_message", {"evil": 1})])
        self._patch(monkeypatch, client)
        result = self._executor().run(_make_group())
        loop_result = _run_loop(self._executor(), result)
        assert loop_result["aborted"] is True
        assert "schema validation" in loop_result["abort_reason"]
        assert loop_result["transcript"] == []

    def test_whitelist_violation_aborts(self, monkeypatch: pytest.MonkeyPatch) -> None:
        client = _NativeAgent([_tool_result("Not_Allowed", {})])
        self._patch(monkeypatch, client)
        result = self._executor().run(_make_group())
        loop_result = _run_loop(self._executor(), result)
        assert loop_result["aborted"] is True
        # A tool outside the catalog is rejected by name before dispatch
        # (whitelist enforcement holds in native mode too).
        assert (
            "Unknown tool 'Not_Allowed'" in loop_result["abort_reason"]
            or "Whitelist violation" in loop_result["abort_reason"]
        )

    def test_provider_rejecting_tools_falls_back_to_json_protocol(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        class _RejectingAgent(_NativeAgent):
            def chat(self, messages, *, model="", **kwargs: Any):
                if kwargs.get("tools"):
                    raise LLMResponseError("tools are not supported by this endpoint")
                self.json_used = True
                self.calls.append({"kwargs": kwargs, "n_messages": len(messages)})
                return LLMResult(
                    text=json.dumps(
                        {"thought": "t", "action": "finish", "result": "via-json"}
                    ),
                    model=model,
                )

        client = _RejectingAgent()
        self._patch(monkeypatch, client)
        result = self._executor().run(_make_group())
        assert client.json_used is True
        assert result.status.value == "PASS"
        assert result.variables.get("agent_result") == "via-json"
        # The fallback call carries no tools payload.
        assert client.calls[0]["kwargs"].get("tools") is None


class TestDecisionNativeMode:
    def _patch(self, monkeypatch: pytest.MonkeyPatch, client: Any) -> None:
        def _fake(model: str, cancel_token: object = None) -> tuple[Any, str]:
            return client, client.model_name

        monkeypatch.setattr(executor, "resolve_llm_decision_client", _fake)

    def _decision_process(self) -> Any:
        from rpaforge.core.execution import (
            ActivityCall,
            LLMDecisionGroup,
            Process,
            Task,
        )

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
        task.activities.append(
            LLMDecisionGroup(
                question="Which folder?",
                options=[
                    {"id": "invoices", "value": "invoices", "label": "Invoices"},
                    {"id": "other", "value": "other", "label": "Other"},
                ],
                branches={"invoices": [invoices_call], "other": [other_call]},
                node_id="dec-native",
            )
        )
        process = Process(name="decision-native-test")
        process.tasks.append(task)
        return process

    def _executor(self) -> Any:
        ex = executor.ProcessExecutor()
        ex.register_library("Flow", Flow())
        return ex

    def test_native_choose_option_tool(self, monkeypatch: pytest.MonkeyPatch) -> None:
        client = _NativeAgent([_tool_result("choose_option", {"option": "other"})])
        self._patch(monkeypatch, client)
        result = self._executor().run(self._decision_process())
        assert result.status.value == "PASS"
        assert result.variables.get("route") == "went-other"
        tools = client.calls[0]["kwargs"]["tools"]
        assert tools[0].name == "choose_option"
        assert "option" in tools[0].parameters["properties"]

    def test_decision_falls_back_to_json_on_rejection(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        class _RejectingAgent(_NativeAgent):
            def chat(self, messages, *, model="", **kwargs: Any):  # noqa: ARG002
                if kwargs.get("tools"):
                    raise LLMResponseError("no tools here")
                return LLMResult(text=json.dumps({"option": "invoices"}), model=model)

        client = _RejectingAgent()
        self._patch(monkeypatch, client)
        result = self._executor().run(self._decision_process())
        assert result.status.value == "PASS"
        assert result.variables.get("route") == "went-invoices"
