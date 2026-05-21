"""Integration tests for Bridge component."""

from __future__ import annotations

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

    @pytest.mark.asyncio
    async def test_generate_code_empty_diagram(self, handlers):
        from rpaforge.codegen.python_generator import DiagramValidationError

        with pytest.raises(DiagramValidationError):
            await handlers._handle_generate_code(
                {"diagram": {"nodes": [], "edges": []}}
            )

    @pytest.mark.asyncio
    async def test_run_process_missing_params(self, handlers):
        with pytest.raises(JSONRPCError) as exc_info:
            await handlers._handle_run_process({})

        assert exc_info.value.code == -32602

    @pytest.mark.asyncio
    async def test_run_diagram_rejects_concurrent_call(self, handlers):
        """Second runDiagram call is rejected while first is still running."""
        import asyncio
        import unittest.mock as mock

        minimal_diagram = {
            "nodes": [
                {"id": "n1", "data": {"blockData": {"type": "start"}}},
                {"id": "n2", "data": {"blockData": {"type": "end"}}},
            ],
            "edges": [{"id": "e1", "source": "n1", "target": "n2"}],
        }

        # Simulate a running task by setting _process_task to a non-done future
        running_future: asyncio.Future[None] = asyncio.get_event_loop().create_future()
        handlers._process_task = mock.MagicMock()
        handlers._process_task.done.return_value = False

        with pytest.raises(JSONRPCError) as exc_info:
            await handlers._handle_run_diagram({"diagram": minimal_diagram})

        assert exc_info.value.code == -32602
        running_future.cancel()

    @pytest.mark.asyncio
    async def test_run_diagram_missing_diagram_param(self, handlers):
        """runDiagram raises JSONRPCError when diagram param is missing."""
        with pytest.raises(JSONRPCError) as exc_info:
            await handlers._handle_run_diagram({})

        assert exc_info.value.code == -32602

    def test_list_windows_registered_in_handler_map(self, handlers):
        handler_map = handlers.get_handlers()
        assert "listWindows" in handler_map
        assert "inspectDesktop" in handler_map

    @pytest.mark.asyncio
    async def test_inspect_desktop_no_window_raises(self, handlers):
        """inspectDesktop without windowId raises JSONRPCError.

        Code is -32001 when DesktopUI library is not installed (CI),
        or -32602 when it is installed but no window has been selected yet.
        """
        with pytest.raises(JSONRPCError) as exc_info:
            await handlers._handle_inspect_desktop({})

        assert exc_info.value.code in (-32001, -32602)

    @pytest.mark.asyncio
    async def test_inspect_desktop_with_window_id_calls_inspect_by_handle(
        self, handlers
    ):
        """inspectDesktop with windowId delegates to _inspect_by_handle."""
        expected = {"elements": [{"tag": "Button", "text": "OK"}], "total": 1}

        def fake_inspect_by_handle(handle: int) -> dict:
            assert handle == 12345
            return expected

        handlers._inspect_by_handle = fake_inspect_by_handle
        result = await handlers._handle_inspect_desktop({"windowId": 12345})

        assert result == expected

    @pytest.mark.asyncio
    async def test_list_windows_pywinauto_unavailable(self, handlers):
        """listWindows raises JSONRPCError when pywinauto is not installed."""
        import sys
        import unittest.mock as mock

        with mock.patch.dict(sys.modules, {"pywinauto": None}):
            with pytest.raises(JSONRPCError) as exc_info:
                await handlers._handle_list_windows({})

        assert exc_info.value.code == -32001

    @pytest.mark.asyncio
    async def test_list_windows_returns_window_list(self, handlers):
        """listWindows returns title/pid/handle for each visible window."""
        import unittest.mock as mock

        mock_win = mock.MagicMock()
        mock_win.window_text.return_value = "Notepad"
        mock_win.process_id.return_value = 1234
        mock_win.handle = 99
        mock_rect = mock.MagicMock()
        mock_rect.right = 800
        mock_rect.left = 0
        mock_rect.bottom = 600
        mock_rect.top = 0
        mock_win.rectangle.return_value = mock_rect

        mock_desktop_instance = mock.MagicMock()
        mock_desktop_instance.windows.return_value = [mock_win]
        mock_desktop_cls = mock.MagicMock(return_value=mock_desktop_instance)

        mock_pywinauto = mock.MagicMock()
        mock_pywinauto.Desktop = mock_desktop_cls

        import sys

        with mock.patch.dict(sys.modules, {"pywinauto": mock_pywinauto}):
            result = await handlers._handle_list_windows({})

        assert result["windows"] == [{"title": "Notepad", "pid": 1234, "handle": 99}]
