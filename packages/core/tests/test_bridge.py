"""Tests for RPAForge Bridge Server."""

from __future__ import annotations

import json
from unittest.mock import MagicMock

import pytest

from rpaforge.bridge import (
    BridgeServer,
    JSONRPCError,
    JSONRPCErrorCode,
    JSONRPCNotification,
    JSONRPCRequest,
    JSONRPCResponse,
    parse_message,
)
from rpaforge.bridge.events import LogEvent, ProcessFinishedEvent, ProcessStartedEvent


class TestJSONRPCProtocol:
    """Tests for JSON-RPC protocol classes."""

    def test_request_to_dict(self):
        """Test request serialization."""
        request = JSONRPCRequest(method="test", id=1, params={"arg": "value"})
        result = request.to_dict()

        assert result["jsonrpc"] == "2.0"
        assert result["method"] == "test"
        assert result["id"] == 1
        assert result["params"] == {"arg": "value"}

    def test_request_to_json(self):
        """Test request JSON serialization."""
        request = JSONRPCRequest(method="test", id=1)
        json_str = request.to_json()

        assert isinstance(json_str, str)
        data = json.loads(json_str)
        assert data["method"] == "test"

    def test_response_success(self):
        """Test success response creation."""
        response = JSONRPCResponse.success(1, {"result": "ok"})

        assert response.id == 1
        assert response.result == {"result": "ok"}
        assert response.error is None

    def test_response_error(self):
        """Test error response creation."""
        error = JSONRPCError(code=-32600, message="Invalid Request")
        response = JSONRPCResponse.error_response(1, error)

        assert response.id == 1
        assert response.error is not None
        assert response.error.code == -32600
        assert response.result is None

    def test_notification_to_dict(self):
        """Test notification serialization."""
        notification = JSONRPCNotification(method="event", params={"data": "test"})
        result = notification.to_dict()

        assert "id" not in result
        assert result["method"] == "event"
        assert result["params"] == {"data": "test"}

    def test_parse_request(self):
        """Test parsing a request message."""
        data = json.dumps(
            {"jsonrpc": "2.0", "method": "test", "id": 1, "params": {"x": 1}}
        )
        message = parse_message(data)

        assert isinstance(message, JSONRPCRequest)
        assert message.method == "test"
        assert message.id == 1
        assert message.params == {"x": 1}

    def test_parse_notification(self):
        """Test parsing a notification message."""
        data = json.dumps({"jsonrpc": "2.0", "method": "event", "params": {"x": 1}})
        message = parse_message(data)

        assert isinstance(message, JSONRPCNotification)
        assert message.method == "event"
        assert message.params == {"x": 1}

    def test_parse_invalid_json(self):
        """Test parsing invalid JSON."""
        message = parse_message("not json")
        assert message is None

    def test_parse_missing_method(self):
        """Test parsing message without method."""
        data = json.dumps({"jsonrpc": "2.0", "id": 1})
        message = parse_message(data)
        assert message is None


class TestBridgeEvents:
    """Tests for bridge events."""

    def test_log_event(self):
        """Test log event creation."""
        event = LogEvent(level="info", message="Test message")

        result = event.to_dict()
        assert result["type"] == "log"
        assert result["level"] == "info"
        assert result["message"] == "Test message"
        assert "timestamp" in result

    def test_process_started_event(self):
        """Test process started event."""
        event = ProcessStartedEvent(process_id="proc-123", name="Test Process")

        result = event.to_dict()
        assert result["type"] == "processStarted"
        assert result["processId"] == "proc-123"
        assert result["name"] == "Test Process"

    def test_process_finished_event(self):
        """Test process finished event."""
        event = ProcessFinishedEvent(status="pass", duration=1.5, message="Done")

        result = event.to_dict()
        assert result["type"] == "processFinished"
        assert result["status"] == "pass"
        assert result["duration"] == 1.5
        assert result["message"] == "Done"


class TestBridgeServer:
    """Tests for BridgeServer."""

    @pytest.fixture
    def mock_engine(self):
        """Create a mock engine."""
        engine = MagicMock()
        engine.run_string.return_value = MagicMock()
        engine.run_string.return_value.suite.status = "PASS"
        engine.run_string.return_value.suite.message = "OK"
        return engine

    @pytest.fixture
    def server(self, mock_engine):
        """Create a bridge server instance."""
        return BridgeServer(engine=mock_engine)

    def test_server_initialization(self, server):
        """Test server initialization."""
        assert server._engine is not None
        assert server._running is False
        assert len(server._method_handlers) > 0

    def test_handlers_registered(self, server):
        """Test that handlers are registered."""
        assert "ping" in server._method_handlers
        assert "runProcess" in server._method_handlers
        assert "setBreakpoint" in server._method_handlers
        assert "getActivities" in server._method_handlers


class TestBridgeHandlers:
    """Tests for bridge handlers."""

    @pytest.fixture
    def mock_engine(self):
        """Create a mock engine."""
        engine = MagicMock()
        engine.run_string.return_value = MagicMock()
        engine.run_string.return_value.suite.status = "PASS"
        return engine

    @pytest.fixture
    def handlers(self, mock_engine):
        """Create bridge handlers instance."""
        from rpaforge.bridge.handlers import BridgeHandlers

        return BridgeHandlers(engine=mock_engine)

    def test_ping_handler(self, handlers):
        """Test ping handler."""
        result = handlers._handle_ping({})

        assert result["pong"] is True
        assert "timestamp" in result

    def test_get_capabilities_handler(self, handlers):
        """Test get capabilities handler."""
        result = handlers._handle_get_capabilities({})

        assert "version" in result
        assert "features" in result
        assert "libraries" in result

    def test_get_activities_handler(self, handlers):
        """Test get activities handler."""
        result = handlers._handle_get_activities({})

        assert "activities" in result
        assert isinstance(result["activities"], list)
        assert len(result["activities"]) > 0

        activity = result["activities"][0]
        assert "name" in activity
        assert "robotFramework" in activity
        assert "library" in activity["robotFramework"]
        assert "params" in activity

    async def test_run_process_missing_source(self, handlers):
        """Test run process with missing source."""
        with pytest.raises(JSONRPCError) as exc_info:
            await handlers._handle_run_process({})

        assert exc_info.value.code == JSONRPCErrorCode.INVALID_PARAMS

    async def test_run_process_success(self, handlers):
        """Test successful run process starts async execution."""
        result = await handlers._handle_run_process(
            {"source": "*** Tasks ***\nTest\n    Log    Hi"}
        )

        assert "processId" in result
        assert "status" in result
        assert result["status"] == "running"

    def test_run_file_missing_path(self, handlers):
        """Test run file with missing path."""
        with pytest.raises(JSONRPCError) as exc_info:
            handlers._handle_run_file({})

        assert exc_info.value.code == JSONRPCErrorCode.INVALID_PARAMS

    def test_stop_process(self, handlers, mock_engine):
        """Test stop process handler."""
        result = handlers._handle_stop_process({})

        assert result["stopped"] is True
        mock_engine.stop.assert_called_once()

    def test_get_breakpoints_no_debugger(self, handlers):
        """Test get breakpoints without debugger."""
        result = handlers._handle_get_breakpoints({})

        assert result["breakpoints"] == []

    def test_get_variables_no_debugger(self, handlers):
        """Test get variables without debugger."""
        result = handlers._handle_get_variables({})

        assert result["variables"] == []

    def test_get_call_stack_no_debugger(self, handlers):
        """Test get call stack without debugger."""
        result = handlers._handle_get_call_stack({})

        assert result["callStack"] == []


class TestJSONRPCError:
    """Tests for JSONRPCError class."""

    def test_error_to_dict(self):
        """Test error serialization."""
        error = JSONRPCError(
            code=-32600, message="Invalid Request", data={"key": "value"}
        )
        result = error.to_dict()

        assert result["code"] == -32600
        assert result["message"] == "Invalid Request"
        assert result["data"] == {"key": "value"}

    def test_error_to_dict_no_data(self):
        """Test error serialization without data."""
        error = JSONRPCError(code=-32600, message="Invalid Request")
        result = error.to_dict()

        assert "data" not in result
