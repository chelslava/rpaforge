"""Integration tests for bridge lifecycle — ready signal, disconnect, shutdown cleanup."""

from __future__ import annotations

import asyncio

import pytest

from rpaforge.bridge.events import EventType


class TestBridgeHandlersInit:
    """BridgeHandlers initializes in a ready/idle state."""

    @pytest.fixture
    def handlers(self):
        from rpaforge import StudioEngine
        from rpaforge.bridge.handlers import BridgeHandlers

        engine = StudioEngine()
        return BridgeHandlers(engine)

    def test_ping_reports_idle_on_startup(self, handlers):
        result = handlers._handle_ping({})

        assert result["pong"] is True
        assert result["status"] == "idle"
        assert result["isRunning"] is False
        assert result["isPaused"] is False

    def test_no_active_process_on_init(self, handlers):
        assert handlers._process_id is None
        assert handlers._process_task is None
        assert handlers._cancel_requested is False
        assert handlers._paused is False

    def test_stop_process_when_idle_returns_no_process(self, handlers):
        result = handlers._handle_stop_process({})

        assert result["status"] == "no_process"

    def test_pause_process_when_idle_returns_not_running(self, handlers):
        result = handlers._handle_pause_process({})

        assert result["status"] == "not_running"

    def test_resume_process_when_idle_returns_not_paused(self, handlers):
        result = handlers._handle_resume_process({})

        assert result["status"] == "not_paused"

    def test_get_variables_no_runner(self, handlers):
        result = handlers._handle_get_variables({})

        assert "variables" in result
        assert result["variables"] == []

    def test_get_call_stack_no_runner(self, handlers):
        result = handlers._handle_get_call_stack({})

        assert "callStack" in result
        assert result["callStack"] == []

    def test_get_breakpoints_no_runner(self, handlers):
        result = handlers._handle_get_breakpoints({})

        assert result["breakpoints"] == []


class TestBridgeDisconnect:
    """Bridge emits correct events on shutdown / disconnect."""

    def _make_handlers(self):
        from rpaforge import StudioEngine
        from rpaforge.bridge.handlers import BridgeHandlers

        emitted: list[dict] = []
        engine = StudioEngine()
        handlers = BridgeHandlers(engine, emit_event=emitted.append)
        return handlers, emitted

    def test_shutdown_emits_log_event(self):
        handlers, emitted = self._make_handlers()

        result = asyncio.run(handlers._handle_shutdown({"reason": "test"}))

        assert result["status"] == "shutting_down"
        assert result["reason"] == "test"
        log_events = [e for e in emitted if e.get("type") == EventType.LOG.value]
        assert any("shutdown" in e.get("message", "").lower() for e in log_events)

    def test_shutdown_default_reason(self):
        handlers, emitted = self._make_handlers()

        result = asyncio.run(handlers._handle_shutdown({}))

        assert result["reason"] == "user_request"

    def test_shutdown_when_no_process_running(self):
        handlers, emitted = self._make_handlers()

        result = asyncio.run(handlers._handle_shutdown({"reason": "disconnect"}))

        assert result["status"] == "shutting_down"
        assert handlers._cancel_requested is False

    def test_stop_process_sets_cancel_flag_when_running(self):
        handlers, _ = self._make_handlers()
        handlers._process_id = "proc-1"

        class _FakeTask:
            def done(self):
                return False

            def cancel(self):
                pass

        handlers._process_task = _FakeTask()
        handlers._cancel_requested = False

        handlers._handle_stop_process({})

        assert handlers._cancel_requested is True


class TestBridgeEventEmission:
    """Bridge emits typed events at lifecycle transitions."""

    def test_process_started_event_shape(self):
        from rpaforge.bridge.events import ProcessStartedEvent

        event = ProcessStartedEvent(process_id="proc-1", name="My Process")
        data = event.to_dict()

        assert data["type"] == EventType.PROCESS_STARTED.value
        assert data["processId"] == "proc-1"
        assert data["name"] == "My Process"
        assert "timestamp" in data

    def test_process_finished_event_shape(self):
        from rpaforge.bridge.events import ProcessFinishedEvent

        event = ProcessFinishedEvent(status="pass", duration=1.5)
        data = event.to_dict()

        assert data["type"] == EventType.PROCESS_FINISHED.value
        assert data["status"] == "pass"
        assert data["duration"] == 1.5

    def test_process_stopped_event_shape(self):
        from rpaforge.bridge.events import ProcessStoppedEvent

        event = ProcessStoppedEvent(reason="user")
        data = event.to_dict()

        assert data["type"] == EventType.PROCESS_STOPPED.value
        assert data["reason"] == "user"

    def test_log_event_includes_level_and_message(self):
        from rpaforge.bridge.events import LogEvent

        event = LogEvent(level="error", message="Something failed", source="engine")
        data = event.to_dict()

        assert data["type"] == EventType.LOG.value
        assert data["level"] == "error"
        assert data["message"] == "Something failed"
        assert data["source"] == "engine"

    def test_paused_event_includes_node_id(self):
        from rpaforge.bridge.events import ProcessPausedEvent

        event = ProcessPausedEvent(
            file="main.py", line=10, node_id="node-42", reason="breakpoint"
        )
        data = event.to_dict()

        assert data["type"] == EventType.PROCESS_PAUSED.value
        assert data["nodeId"] == "node-42"
        assert data["reason"] == "breakpoint"

    def test_resumed_event_type(self):
        from rpaforge.bridge.events import ProcessResumedEvent

        event = ProcessResumedEvent()
        data = event.to_dict()

        assert data["type"] == EventType.PROCESS_RESUMED.value
