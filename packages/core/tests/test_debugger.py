"""Tests for RPAForge Debugger."""


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
