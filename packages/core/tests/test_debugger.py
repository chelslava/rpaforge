"""Tests for RPAForge Debugger."""

import threading
import time

from rpaforge import StudioEngine
from rpaforge.debugger import (
    Breakpoint,
    BreakpointManager,
    Debugger,
    DebuggerState,
    StepMode,
    Stepper,
    VariableWatcher,
)


class TestBreakpoint:
    """Tests for Breakpoint class."""

    def test_create_line_breakpoint(self):
        """Test creating a simple line breakpoint."""
        bp = Breakpoint(file="test.robot", line=10)
        assert bp.file == "test.robot"
        assert bp.line == 10
        assert bp.enabled
        assert bp.condition is None

    def test_breakpoint_type_detection(self):
        """Test breakpoint type detection."""
        bp_line = Breakpoint(file="test.robot", line=10)
        assert bp_line.type.name == "LINE"

        bp_cond = Breakpoint(file="test.robot", line=10, condition="${x} > 5")
        assert bp_cond.type.name == "CONDITIONAL"

        bp_hit = Breakpoint(file="test.robot", line=10, hit_condition=">3")
        assert bp_hit.type.name == "HIT_COUNT"

    def test_conditional_breakpoint(self):
        """Test conditional breakpoint evaluation."""
        bp = Breakpoint(file="test.robot", line=10, condition="x > 5")
        assert bp.should_stop({"x": 10})
        assert not bp.should_stop({"x": 3})

    def test_hit_count_breakpoint(self):
        """Test hit count breakpoint."""
        bp = Breakpoint(file="test.robot", line=10, hit_condition=">2")

        assert not bp.should_stop({})  # hit 1
        assert not bp.should_stop({})  # hit 2
        assert bp.should_stop({})  # hit 3

    def test_disabled_breakpoint(self):
        """Test disabled breakpoint never stops."""
        bp = Breakpoint(file="test.robot", line=10, enabled=False)
        assert not bp.should_stop({})


class TestBreakpointManager:
    """Tests for BreakpointManager class."""

    def test_add_breakpoint(self):
        """Test adding breakpoints."""
        manager = BreakpointManager()
        bp = manager.add("test.robot", 10)
        assert bp is not None
        assert len(manager.all()) == 1

    def test_remove_breakpoint(self):
        """Test removing breakpoints."""
        manager = BreakpointManager()
        bp = manager.add("test.robot", 10)
        assert manager.remove(bp.id)
        assert len(manager.all()) == 0

    def test_get_for_file(self):
        """Test getting breakpoints for a file."""
        manager = BreakpointManager()
        manager.add("test.robot", 10)
        manager.add("test.robot", 20)
        manager.add("other.robot", 5)

        bps = manager.get_for_file("test.robot")
        assert len(bps) == 2

    def test_toggle_breakpoint(self):
        """Test toggling breakpoint state."""
        manager = BreakpointManager()
        bp = manager.add("test.robot", 10)

        manager.toggle(bp.id)
        assert not bp.enabled

        manager.toggle(bp.id)
        assert bp.enabled


class TestStepper:
    """Tests for Stepper class."""

    def test_initial_state(self):
        """Test initial stepper state."""
        stepper = Stepper()
        assert stepper.mode == StepMode.CONTINUE
        assert not stepper.is_paused

    def test_pause_and_resume(self):
        """Test pause and resume."""
        stepper = Stepper()
        stepper.pause()
        assert stepper.is_paused

        stepper.resume()
        assert not stepper.is_paused

    def test_step_over(self):
        """Test step over mode."""
        stepper = Stepper()
        stepper.step_over()
        assert stepper.mode == StepMode.STEP_OVER

    def test_step_into(self):
        """Test step into mode."""
        stepper = Stepper()
        stepper.step_into()
        assert stepper.mode == StepMode.STEP_INTO

    def test_step_out(self):
        """Test step out mode."""
        stepper = Stepper()
        stepper.step_out()
        assert stepper.mode == StepMode.STEP_OUT


class TestVariableWatcher:
    """Tests for VariableWatcher class."""

    def test_add_watch(self):
        """Test adding variable watches."""
        watcher = VariableWatcher()
        watcher.add_watch("${test_var}")
        assert "test_var" in watcher.get_watches()

    def test_remove_watch(self):
        """Test removing variable watches."""
        watcher = VariableWatcher()
        watcher.add_watch("${test_var}")
        watcher.remove_watch("test_var")
        assert "test_var" not in watcher.get_watches()

    def test_check_changes(self):
        """Test checking for variable changes."""
        watcher = VariableWatcher()
        watcher.add_watch("counter")

        changes = watcher.check({"counter": 1})
        assert len(changes) == 1
        assert changes[0].new_value == 1

        changes = watcher.check({"counter": 2})
        assert len(changes) == 1
        assert changes[0].new_value == 2


class TestDebugger:
    """Tests for Debugger class."""

    def test_initial_state(self):
        """Test initial debugger state."""
        debugger = Debugger()
        assert debugger.state == DebuggerState.IDLE

    def test_start_stop(self):
        """Test starting and stopping debugger."""
        debugger = Debugger()
        debugger.start()
        assert debugger.state == DebuggerState.RUNNING

        debugger.stop()
        assert debugger.state == DebuggerState.IDLE

    def test_pause_resume(self):
        """Test pause and resume."""
        debugger = Debugger()
        debugger.start()

        debugger.pause()
        assert debugger.state == DebuggerState.PAUSED
        assert debugger.is_paused

        debugger.resume()
        assert debugger.state == DebuggerState.RUNNING

    def test_add_breakpoint(self):
        """Test adding breakpoints to debugger."""
        debugger = Debugger()
        bp = debugger.add_breakpoint("test.robot", 10)
        assert bp is not None
        assert len(debugger.get_breakpoints()) == 1

    def test_watch_variable(self):
        """Test watching variables."""
        debugger = Debugger()
        debugger.watch_variable("${my_var}")
        assert "my_var" in debugger.get_watched_variables()

    def test_call_stack(self):
        """Test call stack management."""
        debugger = Debugger()
        debugger.start()

        debugger._on_keyword_start("Keyword1", "test.robot", 10, [])
        debugger._on_keyword_start("Keyword2", "test.robot", 20, [])

        stack = debugger.get_call_stack()
        assert len(stack) == 2

        debugger._on_keyword_end("Keyword2")
        stack = debugger.get_call_stack()
        assert len(stack) == 1

    def test_create_listener(self):
        """Test creating a Robot Framework listener."""
        debugger = Debugger()
        listener = debugger.create_listener()
        assert listener is not None
        assert hasattr(listener, "ROBOT_LISTENER_API_VERSION")

    def test_get_variable_value_public_api(self):
        """Test getting variable values through public API."""
        debugger = Debugger()
        debugger.watch_variable("my_var")

        assert debugger.get_variable_value("my_var") is None
        assert debugger.get_variable_value("${my_var}") is None

        debugger._watcher._previous_values["my_var"] = "test_value"
        assert debugger.get_variable_value("my_var") == "test_value"

    def test_get_all_watched_values(self):
        """Test getting all watched variable values."""
        debugger = Debugger()
        debugger.watch_variable("var1")
        debugger.watch_variable("var2")

        debugger._watcher._previous_values["var1"] = "value1"
        debugger._watcher._previous_values["var2"] = "value2"

        values = debugger.get_all_watched_values()
        assert values == {"var1": "value1", "var2": "value2"}


class TestDebuggerEndToEnd:
    """End-to-end tests for debugger with actual execution."""

    def test_debugger_lifecycle_with_engine(self):
        """Test debugger start/stop is called during engine execution."""
        debugger = Debugger()
        engine = StudioEngine(debugger=debugger)

        assert debugger.state == DebuggerState.IDLE

        result = engine.run_string("""
*** Tasks ***
Test Task
    Log    Hello
""")

        assert result.suite.status == "PASS"
        assert debugger.state == DebuggerState.IDLE

    def test_breakpoint_hits_during_execution(self):
        """Test that breakpoint causes pause during execution."""
        debugger = Debugger()
        debugger.set_sourcemap({5: "node_1"})

        bp = debugger.add_breakpoint("node_1", 0)
        bp.enabled = True

        pause_count = [0]
        result_holder = [None]

        def on_pause():
            pause_count[0] += 1
            threading.Thread(target=debugger.resume, daemon=True).start()

        debugger.on_pause(on_pause)

        engine = StudioEngine(debugger=debugger)

        def run():
            result_holder[0] = engine.run_string("""
*** Tasks ***
Test Task
    Log    Step 1
    Log    Step 2
    Log    Step 3
""")

        thread = threading.Thread(target=run, daemon=True)
        thread.start()
        thread.join(timeout=10)

        assert thread.is_alive() is False, "Execution should complete after resume"
        assert result_holder[0] is not None
        assert result_holder[0].suite.status == "PASS"
        assert pause_count[0] >= 1

    def test_callback_setup_via_handlers(self):
        """Test that bridge handlers can setup debugger callbacks."""
        from rpaforge.bridge import BridgeHandlers

        debugger = Debugger()
        engine = StudioEngine.__new__(StudioEngine)
        engine._debugger = debugger
        engine._output_dir = None
        engine._is_running = False
        engine._current_suite = None

        events_emitted = []

        def emit_event(event):
            events_emitted.append(event)

        handlers = BridgeHandlers(
            engine=engine,
            debugger=debugger,
            emit_event=emit_event,
        )

        debugger.set_sourcemap({5: "test_node"})
        handlers._setup_debugger_callbacks()

        debugger.start()

        bp = debugger._breakpoints.add("test_node", 0)
        bp.enabled = True

        def call_keyword():
            time.sleep(0.1)
            debugger.resume()

        threading.Thread(target=call_keyword, daemon=True).start()
        debugger._on_keyword_start("TestKeyword", "test.robot", 5, [])

        pause_events = [e for e in events_emitted if e.get("type") == "processPaused"]
        assert len(pause_events) >= 1
