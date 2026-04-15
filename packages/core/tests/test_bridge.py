"""Integration tests for Bridge component."""

from __future__ import annotations

import json

import pytest

from rpaforge.bridge.events import LogEvent, ProcessFinishedEvent, ProcessStartedEvent
from rpaforge.bridge.protocol import JSONRPCError, JSONRPCRequest, parse_message


class TestBridgeProtocol:
    """Tests for Bridge protocol parsing."""

    def test_parse_request(self):
        data = '{"jsonrpc": "2.0", "method": "ping", "id": 1, "params": {}}'
        message = parse_message(data)

        assert isinstance(message, JSONRPCRequest)
        assert message.jsonrpc == "2.0"
        assert message.method == "ping"
        assert message.id == 1
        assert message.params == {}

    def test_parse_request_with_params(self):
        data = '{"jsonrpc": "2.0", "method": "runProcess", "id": 2, "params": {"source": "print(1)"}}'
        message = parse_message(data)

        assert isinstance(message, JSONRPCRequest)
        assert message.method == "runProcess"
        assert message.params == {"source": "print(1)"}


class TestBridgeEvents:
    """Tests for Bridge events."""

    def test_process_started_event(self):
        event = ProcessStartedEvent(process_id="proc-123", name="Test Process")

        data = event.to_dict()

        assert data["type"] == "processStarted"
        assert data["processId"] == "proc-123"
        assert data["name"] == "Test Process"

    def test_process_finished_event(self):
        event = ProcessFinishedEvent(status="pass", duration=1.5, message="Done")

        data = event.to_dict()

        assert data["type"] == "processFinished"
        assert data["status"] == "pass"
        assert data["duration"] == 1.5
        assert data["message"] == "Done"

    def test_log_event(self):
        event = LogEvent(message="Hello, world!", level="info", source="engine")

        data = event.to_dict()

        assert data["type"] == "log"
        assert data["message"] == "Hello, world!"
        assert data["level"] == "info"
        assert data["source"] == "engine"


class TestBridgeIntegration:
    """Integration tests using real StudioEngine."""

    @pytest.fixture
    def engine(self):
        from rpaforge import StudioEngine

        return StudioEngine()

    @pytest.fixture
    def handlers(self, engine):
        from rpaforge.bridge.handlers import BridgeHandlers

        return BridgeHandlers(engine)

    def test_engine_creation(self, engine):
        assert engine is not None
        assert engine.executor is not None

    def test_get_handlers_map(self, handlers):
        handler_map = handlers.get_handlers()

        assert isinstance(handler_map, dict)
        assert "ping" in handler_map
        assert "getCapabilities" in handler_map
        assert "runProcess" in handler_map
        assert "getActivities" in handler_map
        assert "generateCode" in handler_map

    def test_ping_handler(self, handlers):
        result = handlers._handle_ping({})

        assert result["pong"] is True
        assert "timestamp" in result
        assert "status" in result

    def test_get_capabilities(self, handlers):
        result = handlers._handle_get_capabilities({})

        assert "version" in result
        assert "features" in result
        assert "libraries" in result
        assert result["features"]["debugger"] is True

    def test_get_activities(self, handlers):
        result = handlers._handle_get_activities({})

        assert "activities" in result
        assert isinstance(result["activities"], list)
        assert len(result["activities"]) > 0

    def test_stop_process_idle(self, handlers):
        result = handlers._handle_stop_process({})

        assert result["status"] in ["idle", "no_process"]

    def test_pause_process_not_running(self, handlers):
        result = handlers._handle_pause_process({})

        assert result["status"] in ["not_running", "no_process"]

    def test_resume_process_not_paused(self, handlers):
        result = handlers._handle_resume_process({})

        assert result["status"] in ["not_paused", "no_process"]

    def test_get_variables_no_runner(self, handlers):
        result = handlers._handle_get_variables({})

        assert "variables" in result

    def test_get_call_stack_no_runner(self, handlers):
        result = handlers._handle_get_call_stack({})

        assert "callStack" in result

    def test_generate_code_empty_diagram(self, handlers):
        from rpaforge.codegen.python_generator import DiagramValidationError

        with pytest.raises(DiagramValidationError):
            handlers._handle_generate_code({"diagram": {"nodes": [], "edges": []}})

    @pytest.mark.asyncio
    async def test_run_process_missing_params(self, handlers):
        with pytest.raises(JSONRPCError) as exc_info:
            await handlers._handle_run_process({})

        assert exc_info.value.code == -32602
