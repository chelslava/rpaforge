"""Integration tests for debugger — breakpoints, stepping, pause/resume."""

from __future__ import annotations

import pytest

from rpaforge.core.runner import ProcessRunner, RunnerState


class TestBreakpointManagement:
    """Add, remove, toggle breakpoints via ProcessRunner."""

    def test_add_breakpoint_returns_breakpoint(self):
        runner = ProcessRunner()

        bp = runner.add_breakpoint("node-1", line=5)

        assert bp.node_id == "node-1"
        assert bp.line == 5
        assert bp.enabled is True
        assert bp.hit_count == 0

    def test_add_breakpoint_with_condition(self):
        runner = ProcessRunner()

        bp = runner.add_breakpoint("node-2", line=10, condition="x > 0")

        assert bp.condition == "x > 0"

    def test_add_breakpoint_with_hit_condition(self):
        runner = ProcessRunner()

        bp = runner.add_breakpoint("node-3", hit_condition=">=3")

        assert bp.hit_condition == ">=3"

    def test_remove_existing_breakpoint_returns_true(self):
        runner = ProcessRunner()
        bp = runner.add_breakpoint("node-1")

        removed = runner.remove_breakpoint(bp.id)

        assert removed is True

    def test_remove_missing_breakpoint_returns_false(self):
        runner = ProcessRunner()

        removed = runner.remove_breakpoint("bp_nonexistent")

        assert removed is False

    def test_toggle_disables_enabled_breakpoint(self):
        runner = ProcessRunner()
        bp = runner.add_breakpoint("node-1")
        assert bp.enabled is True

        result = runner.toggle_breakpoint(bp.id)

        assert result is False
        assert bp.enabled is False

    def test_toggle_enables_disabled_breakpoint(self):
        runner = ProcessRunner()
        bp = runner.add_breakpoint("node-1")
        runner.toggle_breakpoint(bp.id)

        result = runner.toggle_breakpoint(bp.id)

        assert result is True
        assert bp.enabled is True

    def test_toggle_missing_breakpoint_returns_none(self):
        runner = ProcessRunner()

        result = runner.toggle_breakpoint("bp_missing")

        assert result is None

    def test_get_breakpoints_returns_list(self):
        runner = ProcessRunner()
        runner.add_breakpoint("node-1")
        runner.add_breakpoint("node-2")

        bps = runner.get_breakpoints()

        assert len(bps) == 2
        node_ids = {bp.node_id for bp in bps}
        assert node_ids == {"node-1", "node-2"}

    def test_get_breakpoints_empty_initially(self):
        runner = ProcessRunner()

        assert runner.get_breakpoints() == []

    def test_remove_breakpoint_removes_from_list(self):
        runner = ProcessRunner()
        bp1 = runner.add_breakpoint("node-1")
        bp2 = runner.add_breakpoint("node-2")

        runner.remove_breakpoint(bp1.id)

        remaining = [bp.node_id for bp in runner.get_breakpoints()]
        assert "node-1" not in remaining
        assert "node-2" in remaining
        _ = bp2


class TestBreakpointHandlers:
    """BridgeHandlers breakpoint methods with/without active runner."""

    @pytest.fixture
    def handlers(self):
        from rpaforge import StudioEngine
        from rpaforge.bridge.handlers import BridgeHandlers

        return BridgeHandlers(StudioEngine())

    def test_set_breakpoint_without_runner_creates_pending(self, handlers):
        result = handlers._handle_set_breakpoint({"nodeId": "n1", "line": 5})

        assert "breakpointId" in result
        assert result.get("pending") is True
        assert len(handlers._pending_breakpoints) == 1

    def test_multiple_pending_breakpoints_accumulate(self, handlers):
        handlers._handle_set_breakpoint({"nodeId": "n1", "line": 1})
        handlers._handle_set_breakpoint({"nodeId": "n2", "line": 2})

        assert len(handlers._pending_breakpoints) == 2

    def test_remove_breakpoint_without_runner_returns_not_removed(self, handlers):
        result = handlers._handle_remove_breakpoint({"breakpointId": "bp_x"})

        assert result["removed"] is False

    def test_toggle_breakpoint_without_runner_returns_none(self, handlers):
        result = handlers._handle_toggle_breakpoint({"breakpointId": "bp_x"})

        assert result["enabled"] is None

    def test_get_breakpoints_without_runner_empty(self, handlers):
        result = handlers._handle_get_breakpoints({})

        assert result["breakpoints"] == []

    def test_set_breakpoint_with_runner_stores_on_runner(self, handlers):
        runner = ProcessRunner()
        handlers._runner = runner

        result = handlers._handle_set_breakpoint({"nodeId": "node-99", "line": 7})

        assert "breakpointId" in result
        assert result.get("pending") is not True
        assert len(runner.get_breakpoints()) == 1

    def test_remove_breakpoint_with_runner(self, handlers):
        runner = ProcessRunner()
        bp = runner.add_breakpoint("node-1")
        handlers._runner = runner

        result = handlers._handle_remove_breakpoint({"breakpointId": bp.id})

        assert result["removed"] is True

    def test_get_breakpoints_with_runner(self, handlers):
        runner = ProcessRunner()
        runner.add_breakpoint("node-1", line=3)
        handlers._runner = runner

        result = handlers._handle_get_breakpoints({})

        bps = result["breakpoints"]
        assert len(bps) == 1
        assert bps[0]["nodeId"] == "node-1"
        assert bps[0]["line"] == 3
        assert bps[0]["enabled"] is True


class TestSteppingHandlers:
    """Step-over / step-into / step-out return correct status."""

    @pytest.fixture
    def handlers_with_paused_runner(self):
        from rpaforge import StudioEngine
        from rpaforge.bridge.handlers import BridgeHandlers

        handlers = BridgeHandlers(StudioEngine())
        runner = ProcessRunner()
        runner._state = RunnerState.PAUSED
        runner._pause_event.clear()
        handlers._runner = runner
        return handlers, runner

    def test_step_over_when_paused(self, handlers_with_paused_runner):
        handlers, runner = handlers_with_paused_runner

        result = handlers._handle_step_over({})

        assert result["status"] == "stepping"
        assert runner.state == RunnerState.RUNNING
        assert runner._step_mode == "over"

    def test_step_into_when_paused(self, handlers_with_paused_runner):
        handlers, runner = handlers_with_paused_runner

        result = handlers._handle_step_into({})

        assert result["status"] == "stepping"
        assert runner.state == RunnerState.RUNNING
        assert runner._step_mode == "into"

    def test_step_out_when_paused(self, handlers_with_paused_runner):
        handlers, runner = handlers_with_paused_runner

        result = handlers._handle_step_out({})

        assert result["status"] == "stepping"
        assert runner.state == RunnerState.RUNNING
        assert runner._step_mode == "out"

    def test_step_over_when_not_paused_returns_not_paused(self):
        from rpaforge import StudioEngine
        from rpaforge.bridge.handlers import BridgeHandlers

        handlers = BridgeHandlers(StudioEngine())

        result = handlers._handle_step_over({})

        assert result["status"] == "not_paused"

    def test_step_into_when_not_paused_returns_not_paused(self):
        from rpaforge import StudioEngine
        from rpaforge.bridge.handlers import BridgeHandlers

        handlers = BridgeHandlers(StudioEngine())

        result = handlers._handle_step_into({})

        assert result["status"] == "not_paused"

    def test_continue_when_paused_resumes(self, handlers_with_paused_runner):
        handlers, runner = handlers_with_paused_runner

        result = handlers._handle_continue({})

        assert result["status"] == "running"
        assert runner.state == RunnerState.RUNNING

    def test_continue_when_not_paused_returns_not_paused(self):
        from rpaforge import StudioEngine
        from rpaforge.bridge.handlers import BridgeHandlers

        handlers = BridgeHandlers(StudioEngine())

        result = handlers._handle_continue({})

        assert result["status"] == "not_paused"


class TestPauseResumeCallbacks:
    """Pause/resume callbacks are invoked correctly."""

    def test_pause_triggers_pause_callback(self):
        runner = ProcessRunner()
        runner._state = RunnerState.RUNNING
        paused = []
        runner.on_pause(lambda _frame, node: paused.append(node))

        runner.pause()

        assert len(paused) == 1

    def test_resume_triggers_resume_callback(self):
        runner = ProcessRunner()
        runner._state = RunnerState.PAUSED
        runner._pause_event.clear()
        resumed = []
        runner.on_resume(lambda: resumed.append(True))

        runner.resume()

        assert resumed == [True]

    def test_resume_from_idle_does_not_fire_callback(self):
        runner = ProcessRunner()
        resumed = []
        runner.on_resume(lambda: resumed.append(True))

        runner.resume()

        assert resumed == []

    def test_pause_from_idle_does_not_fire_callback(self):
        runner = ProcessRunner()
        paused = []
        runner.on_pause(lambda _frame, _node: paused.append(True))

        runner.pause()

        assert paused == []

    def test_runner_is_paused_property(self):
        runner = ProcessRunner()
        runner._state = RunnerState.PAUSED

        assert runner.is_paused is True
        assert runner.is_running is False

    def test_runner_is_running_property(self):
        runner = ProcessRunner()
        runner._state = RunnerState.RUNNING

        assert runner.is_running is True
        assert runner.is_paused is False
