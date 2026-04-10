"""
RPAForge Main Debugger.

Combines breakpoints, stepping, and variable watching into
a unified debugging interface.
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from typing import TYPE_CHECKING, Any

from rpaforge.debugger.breakpoints import Breakpoint, BreakpointManager
from rpaforge.debugger.stepper import StepMode, Stepper
from rpaforge.debugger.watcher import VariableWatcher

if TYPE_CHECKING:
    from collections.abc import Callable


class DebuggerState(Enum):
    """State of the debugger."""

    IDLE = "idle"  # Not running
    RUNNING = "running"  # Running normally
    PAUSED = "paused"  # Paused at breakpoint or step
    STEPPING = "stepping"  # Currently stepping


@dataclass
class CallFrame:
    """Represents a frame in the call stack."""

    keyword: str
    file: str
    line: int
    args: list[Any]
    source: str | None = None


class Debugger:
    """Main debugger class for RPAForge.

    This class provides a unified interface for debugging
    Robot Framework execution.

    Example:
        >>> debugger = Debugger()
        >>> debugger.add_breakpoint("process.robot", 10)
        >>> debugger.add_breakpoint("process.robot", 15, condition="${count} > 5")
        >>> debugger.start()
        >>> # ... execution runs ...
        >>> debugger.step_over()
        >>> debugger.get_variables()
    """

    def __init__(self):
        self._state = DebuggerState.IDLE
        self._breakpoints = BreakpointManager()
        self._stepper = Stepper()
        self._watcher = VariableWatcher()
        self._call_stack: list[CallFrame] = []
        self._current_frame: CallFrame | None = None
        self._current_file: str | None = None
        self._current_line: int = 0
        self._current_node_id: str | None = None
        self._call_depth: int = 0
        self._on_pause: Callable[[], None] | None = None
        self._on_resume: Callable[[], None] | None = None
        self._sourcemap: dict[int, str] = {}

    def set_sourcemap(self, sourcemap: dict[int, str]) -> None:
        """Set line-to-node sourcemap for current execution.

        :param sourcemap: Dict mapping line numbers to node IDs.
        """
        self._sourcemap = sourcemap

    def get_current_node_id(self) -> str | None:
        """Get the current executing node ID based on sourcemap."""
        return self._current_node_id

    @property
    def state(self) -> DebuggerState:
        """Get current debugger state."""
        return self._state

    @property
    def is_paused(self) -> bool:
        """Check if debugger is paused."""
        return self._state == DebuggerState.PAUSED

    @property
    def is_running(self) -> bool:
        """Check if debugger is running."""
        return self._state in (DebuggerState.RUNNING, DebuggerState.STEPPING)

    def start(self) -> None:
        """Start debugging session."""
        self._state = DebuggerState.RUNNING
        self._stepper.reset()
        self._watcher.clear_history()
        self._call_stack.clear()
        self._call_depth = 0

    def stop(self) -> None:
        """Stop debugging session."""
        self._state = DebuggerState.IDLE
        self._stepper.reset()

    def pause(self) -> None:
        """Pause execution."""
        if self._state == DebuggerState.RUNNING:
            self._state = DebuggerState.PAUSED
            self._stepper.pause()
            if self._on_pause:
                self._on_pause()

    def resume(self) -> None:
        """Resume execution."""
        if self._state == DebuggerState.PAUSED:
            self._state = DebuggerState.RUNNING
            self._stepper.resume()
            if self._on_resume:
                self._on_resume()

    def step_over(self) -> None:
        """Step over current line/keyword."""
        if self._state == DebuggerState.PAUSED:
            self._state = DebuggerState.STEPPING
            self._stepper.step_over()

    def step_into(self) -> None:
        """Step into current keyword."""
        if self._state == DebuggerState.PAUSED:
            self._state = DebuggerState.STEPPING
            self._stepper.step_into()

    def step_out(self) -> None:
        """Step out of current keyword."""
        if self._state == DebuggerState.PAUSED:
            self._state = DebuggerState.STEPPING
            self._stepper.step_out()

    def add_breakpoint(
        self,
        file: str,
        line: int,
        condition: str | None = None,
        hit_condition: str | None = None,
    ) -> Breakpoint:
        """Add a breakpoint.

        :param file: File path.
        :param line: Line number.
        :param condition: Optional condition expression.
        :param hit_condition: Optional hit count condition.
        :returns: The created breakpoint.
        """
        return self._breakpoints.add(file, line, condition, hit_condition)

    def remove_breakpoint(self, breakpoint_id: str) -> bool:
        """Remove a breakpoint.

        :param breakpoint_id: ID of the breakpoint.
        :returns: True if removed.
        """
        return self._breakpoints.remove(breakpoint_id)

    def toggle_breakpoint(self, breakpoint_id: str) -> bool:
        """Toggle a breakpoint's enabled state.

        :param breakpoint_id: ID of the breakpoint.
        :returns: New enabled state.
        """
        return self._breakpoints.toggle(breakpoint_id)

    def get_breakpoints(self) -> list[Breakpoint]:
        """Get all breakpoints.

        :returns: List of all breakpoints.
        """
        return self._breakpoints.all()

    def watch_variable(self, name: str) -> None:
        """Add a variable to the watch list.

        :param name: Variable name.
        """
        self._watcher.add_watch(name)

    def unwatch_variable(self, name: str) -> None:
        """Remove a variable from the watch list.

        :param name: Variable name.
        """
        self._watcher.remove_watch(name)

    def get_watched_variables(self) -> set[str]:
        """Get all watched variable names.

        :returns: Set of variable names.
        """
        return self._watcher.get_watches()

    def get_call_stack(self) -> list[CallFrame]:
        """Get the current call stack.

        :returns: List of call frames (most recent first).
        """
        return list(reversed(self._call_stack))

    def get_current_frame(self) -> CallFrame | None:
        """Get the current call frame.

        :returns: Current frame or None.
        """
        return self._current_frame

    def on_pause(self, callback: Callable[[], None]) -> None:
        """Set callback for when execution pauses.

        :param callback: Function to call on pause.
        """
        self._on_pause = callback

    def on_resume(self, callback: Callable[[], None]) -> None:
        """Set callback for when execution resumes.

        :param callback: Function to call on resume.
        """
        self._on_resume = callback

    def create_listener(self) -> DebuggerListener:
        """Create a Robot Framework listener for this debugger.

        :returns: A listener instance.
        """
        return DebuggerListener(self)

    def _on_keyword_start(
        self,
        name: str,
        file: str,
        line: int,
        args: list[Any],
    ) -> None:
        """Handle keyword start event (internal)."""
        self._current_file = file
        self._current_line = line
        self._current_node_id = self._sourcemap.get(line)
        self._call_depth += 1

        frame = CallFrame(
            keyword=name,
            file=file,
            line=line,
            args=args,
        )
        self._call_stack.append(frame)
        self._current_frame = frame

        if self._stepper.should_pause(self._call_depth, is_keyword_start=True):
            self._state = DebuggerState.PAUSED
            if self._on_pause:
                self._on_pause()

    def _on_keyword_end(self, _name: str) -> None:
        """Handle keyword end event (internal)."""
        self._call_depth -= 1
        if self._call_stack:
            self._call_stack.pop()
        self._current_frame = self._call_stack[-1] if self._call_stack else None

        if (
            self._stepper.mode == StepMode.STEP_OUT
            and self._call_depth <= self._stepper._step_depth
        ):
            self._state = DebuggerState.PAUSED
            if self._on_pause:
                self._on_pause()

    def _check_breakpoint(self, file: str, line: int, variables: dict) -> bool:
        """Check if should stop at breakpoint.

        :returns: True if should stop.
        """
        bp = self._breakpoints.check(file, line, variables)
        return bp is not None


class DebuggerListener:
    """Robot Framework listener that integrates with the debugger.

    This listener forwards execution events to the debugger.
    """

    ROBOT_LISTENER_API_VERSION = 3

    def __init__(self, debugger: Debugger):
        self._debugger = debugger

    def start_suite(self, data, result):
        pass

    def end_suite(self, data, result):
        pass

    def start_test(self, data, result):
        pass

    def end_test(self, data, result):
        pass

    def start_keyword(self, data, _result):
        source = getattr(data, "source", None)
        line = getattr(data, "lineno", 0)
        args = list(getattr(data, "args", []))

        self._debugger._on_keyword_start(
            name=data.name,
            file=str(source) if source else "",
            line=line,
            args=args,
        )

    def end_keyword(self, data, _result):
        self._debugger._on_keyword_end(data.name)

    def log_message(self, message):
        pass

    def message(self, message):
        pass
