"""
RPAForge Process Runner.

Runner with debugging support (breakpoints, stepping, pause/resume).
"""

from __future__ import annotations

import logging
import threading
from collections.abc import Callable
from dataclasses import dataclass
from enum import Enum
from typing import TYPE_CHECKING, Any

from rpaforge.core.execution import (
    ActivityCall,
    ExecutionResult,
    ExecutionStatus,
    Process,
)
from rpaforge.core.executor import ProcessExecutor, StopExecution

if TYPE_CHECKING:
    pass

logger = logging.getLogger("rpaforge")

# Import safe evaluator
try:
    from rpaforge.core.safe_evaluator import safe_eval
except ImportError:
    # Fallback if safe_eval not available
    def safe_eval(condition: str, variables: dict[str, Any]) -> bool:
        """Fallback safe_eval that uses restricted eval."""
        if not condition:
            return False
        try:
            return bool(eval(condition, {"__builtins__": {}}, variables))
        except Exception:
            return False


class RunnerState(Enum):
    IDLE = "idle"
    RUNNING = "running"
    PAUSED = "paused"
    CANCELLING = "cancelling"
    STOPPED = "stopped"


@dataclass
class Breakpoint:
    """A breakpoint in execution."""

    id: str
    node_id: str
    line: int = 0
    enabled: bool = True
    condition: str | None = None
    hit_count: int = 0
    hit_condition: str | None = None


@dataclass
class CallFrame:
    """Call stack frame."""

    activity: str
    library: str
    line: int
    args: tuple[Any, ...]
    node_id: str = ""


class ProcessRunner:
    """Process runner with debugging support."""

    def __init__(self, executor: ProcessExecutor | None = None):
        self._executor = executor or ProcessExecutor()
        self._state = RunnerState.IDLE
        self._pause_event = threading.Event()
        self._pause_event.set()
        self._stop_requested = False
        self._step_mode: str | None = None
        self._step_depth = 0
        self._current_depth = 0
        self._breakpoints: dict[str, Breakpoint] = {}
        self._call_stack: list[CallFrame] = []
        self._on_pause_callbacks: list[Callable] = []
        self._on_resume_callbacks: list[Callable] = []
        self._on_step_callbacks: list[Callable] = []
        self._on_cancel_callbacks: list[Callable] = []
        self._on_stop_callbacks: list[Callable] = []
        self._current_process: Process | None = None
        self._current_node_id: str | None = None
        self._lock = threading.Lock()

        self._executor.add_listener(self._on_execution_event)

    @property
    def state(self) -> RunnerState:
        return self._state

    @property
    def is_running(self) -> bool:
        return self._state == RunnerState.RUNNING

    @property
    def is_paused(self) -> bool:
        return self._state == RunnerState.PAUSED

    @property
    def executor(self) -> ProcessExecutor:
        return self._executor

    def run(self, process: Process) -> ExecutionResult:
        with self._lock:
            if self._state != RunnerState.IDLE:
                raise RuntimeError("Runner is not idle")

            self._state = RunnerState.RUNNING
            self._stop_requested = False
            self._step_mode = None
            self._call_stack.clear()
            self._current_process = process
            self._pause_event.set()

        result = self._executor.run(process)

        with self._lock:
            self._state = RunnerState.IDLE
            self._current_process = None

        return result

    def stop(self) -> None:
        with self._lock:
            self._stop_requested = True
            self._pause_event.set()

    def cancel(self) -> None:
        with self._lock:
            if self._state not in (RunnerState.RUNNING, RunnerState.PAUSED):
                return
            self._state = RunnerState.CANCELLING
            self._stop_requested = True
            self._pause_event.set()
            self._notify_cancel()

    def pause(self) -> None:
        with self._lock:
            if self._state == RunnerState.RUNNING:
                self._state = RunnerState.PAUSED
                self._pause_event.clear()
                self._notify_pause()

    def resume(self) -> None:
        with self._lock:
            if self._state == RunnerState.PAUSED:
                self._state = RunnerState.RUNNING
                self._step_mode = None
                self._pause_event.set()
                self._notify_resume()

    def step_over(self) -> None:
        with self._lock:
            if self._state == RunnerState.PAUSED:
                self._state = RunnerState.RUNNING
                self._step_mode = "over"
                self._step_depth = self._current_depth
                self._pause_event.set()
                self._notify_resume()

    def step_into(self) -> None:
        with self._lock:
            if self._state == RunnerState.PAUSED:
                self._state = RunnerState.RUNNING
                self._step_mode = "into"
                self._pause_event.set()
                self._notify_resume()

    def step_out(self) -> None:
        with self._lock:
            if self._state == RunnerState.PAUSED:
                self._state = RunnerState.RUNNING
                self._step_mode = "out"
                self._step_depth = self._current_depth - 1
                self._pause_event.set()
                self._notify_resume()

    def add_breakpoint(
        self,
        node_id: str,
        line: int = 0,
        condition: str | None = None,
        hit_condition: str | None = None,
    ) -> Breakpoint:
        bp_id = f"bp_{node_id}_{line}"
        bp = Breakpoint(
            id=bp_id,
            node_id=node_id,
            line=line,
            condition=condition,
            hit_condition=hit_condition,
        )
        self._breakpoints[bp_id] = bp
        return bp

    def remove_breakpoint(self, bp_id: str) -> bool:
        if bp_id in self._breakpoints:
            del self._breakpoints[bp_id]
            return True
        return False

    def toggle_breakpoint(self, bp_id: str) -> bool | None:
        bp = self._breakpoints.get(bp_id)
        if bp:
            bp.enabled = not bp.enabled
            return bp.enabled
        return None

    def get_breakpoints(self) -> list[Breakpoint]:
        return list(self._breakpoints.values())

    def get_call_stack(self) -> list[CallFrame]:
        return list(self._call_stack)

    def get_current_frame(self) -> CallFrame | None:
        return self._call_stack[-1] if self._call_stack else None

    def get_current_node_id(self) -> str | None:
        return self._current_node_id

    def get_variables(self) -> dict[str, Any]:
        return self._executor.get_variables()

    def set_variable(self, name: str, value: Any) -> None:
        ctx = self._executor.context
        if ctx:
            ctx.set_variable(name, value)

    def on_pause(self, callback: Callable) -> None:
        self._on_pause_callbacks.append(callback)

    def on_resume(self, callback: Callable) -> None:
        self._on_resume_callbacks.append(callback)

    def on_step(self, callback: Callable) -> None:
        self._on_step_callbacks.append(callback)

    def on_cancel(self, callback: Callable) -> None:
        self._on_cancel_callbacks.append(callback)

    def on_stop(self, callback: Callable) -> None:
        self._on_stop_callbacks.append(callback)

    def _on_execution_event(self, event_type: str, *args: Any) -> None:
        if event_type == "start_activity":
            activity = args[0] if args else None
            if isinstance(activity, ActivityCall):
                self._handle_activity_start(activity)

        elif event_type == "end_activity":
            self._handle_activity_end()

    def _handle_activity_start(self, activity: ActivityCall) -> None:
        if self._stop_requested:
            with self._lock:
                if self._state == RunnerState.CANCELLING:
                    self._notify_cancel()
            raise StopExecution()

        self._current_node_id = activity.node_id
        self._current_depth = len(self._call_stack) + 1

        frame = CallFrame(
            activity=activity.activity,
            library=activity.library,
            line=activity.line,
            args=activity.args,
            node_id=activity.node_id,
        )
        self._call_stack.append(frame)

        for callback in self._on_step_callbacks:
            try:
                callback(frame)
            except Exception as e:
                logger.warning(f"Step callback error: {e}")

        bp = self._check_breakpoint(activity)
        if bp:
            self._pause_at_breakpoint(bp, activity)

        if self._step_mode == "into":
            with self._lock:
                self._state = RunnerState.PAUSED
                self._step_mode = None
                self._pause_event.clear()
                self._notify_pause()
                self._pause_event.wait()

        self._pause_event.wait()

    def _handle_activity_end(self) -> None:
        if self._call_stack:
            self._call_stack.pop()

        self._current_depth = len(self._call_stack)

        if (
            self._step_mode == "over" or self._step_mode == "out"
        ) and self._current_depth <= self._step_depth:
            with self._lock:
                self._state = RunnerState.PAUSED
                self._step_mode = None
                self._pause_event.clear()
                self._notify_pause()
                self._pause_event.wait()

    def _check_breakpoint(self, activity: ActivityCall) -> Breakpoint | None:
        for bp in self._breakpoints.values():
            if not bp.enabled:
                continue

            if bp.node_id and bp.node_id == activity.node_id:
                bp.hit_count += 1

                if bp.hit_condition and not self._check_hit_condition(bp):
                    continue

                if bp.condition and not self._check_condition(bp):
                    continue

                return bp

        return None

    def _check_hit_condition(self, bp: Breakpoint) -> bool:
        try:
            if bp.hit_condition.startswith(">="):
                return bp.hit_count >= int(bp.hit_condition[2:])
            elif bp.hit_condition.startswith("=="):
                return bp.hit_count == int(bp.hit_condition[2:])
            elif bp.hit_condition.startswith("%"):
                return bp.hit_count % int(bp.hit_condition[1:]) == 0
            else:
                return bp.hit_count == int(bp.hit_condition)
        except (ValueError, TypeError):
            return False

    def _check_condition(self, bp: Breakpoint) -> bool:
        if not bp.condition:
            return True
        try:
            variables = self.get_variables()
            return safe_eval(bp.condition, variables)
        except Exception:
            return False

    def _pause_at_breakpoint(self, _bp: Breakpoint, _activity: ActivityCall) -> None:
        with self._lock:
            self._state = RunnerState.PAUSED
            self._pause_event.clear()
            self._notify_pause()
            self._pause_event.wait()

    def _notify_pause(self) -> None:
        frame = self.get_current_frame()
        for callback in self._on_pause_callbacks:
            try:
                callback(frame, self._current_node_id)
            except Exception as e:
                logger.warning(f"Pause callback error: {e}")

    def _notify_resume(self) -> None:
        for callback in self._on_resume_callbacks:
            try:
                callback()
            except Exception as e:
                logger.warning(f"Resume callback error: {e}")

    def _notify_cancel(self) -> None:
        for callback in self._on_cancel_callbacks:
            try:
                callback()
            except Exception as e:
                logger.warning(f"Cancel callback error: {e}")

    def _notify_stop(self) -> None:
        for callback in self._on_stop_callbacks:
            try:
                callback()
            except Exception as e:
                logger.warning(f"Stop callback error: {e}")


class StudioEngine:
    """Main engine for RPAForge (compatibility layer with old API)."""

    def __init__(self, debugger: Any | None = None, output_dir: str | None = None):
        self._runner = ProcessRunner()
        self._debugger = debugger
        self._output_dir = output_dir
        self._is_running = False

    @property
    def executor(self) -> ProcessExecutor:
        return self._runner._executor

    @property
    def is_running(self) -> bool:
        return self._is_running

    @property
    def stop_requested(self) -> bool:
        return self._runner._stop_requested

    @property
    def state(self) -> RunnerState:
        return self._runner.state

    @property
    def debugger(self) -> Any | None:
        return self._debugger

    def create_process(self, name: str) -> Any:
        from rpaforge.core.execution import ProcessBuilder

        return ProcessBuilder(name)

    def run(self, process: Process, **_kwargs: Any) -> ExecutionResult:
        self._is_running = True
        try:
            return self._runner.run(process)
        finally:
            self._is_running = False

    def run_file(self, path: str, **kwargs: Any) -> ExecutionResult:
        with open(path, encoding="utf-8") as f:
            source = f.read()
        return self.run_string(source, **kwargs)

    def run_string(self, source: str, **_kwargs: Any) -> ExecutionResult:
        import io
        from contextlib import redirect_stderr, redirect_stdout

        stdout_capture = io.StringIO()
        stderr_capture = io.StringIO()

        result = ExecutionResult(
            status=ExecutionStatus.PASS,
            message="",
        )

        try:
            self._is_running = True
            namespace = {"__builtins__": __builtins__}

            with redirect_stdout(stdout_capture), redirect_stderr(stderr_capture):
                exec(source, namespace)

            output = stdout_capture.getvalue()
            if stderr_capture.getvalue():
                output += "\n" + stderr_capture.getvalue()
            if output:
                result.message = output

        except Exception as e:
            result.status = ExecutionStatus.FAIL
            result.message = str(e)
        finally:
            self._is_running = False

        return result

    def stop(self) -> None:
        self._runner.stop()

    def cancel(self) -> None:
        self._runner.cancel()

    def on_cancel(self, callback: Callable) -> None:
        self._runner.on_cancel(callback)

    def on_stop(self, callback: Callable) -> None:
        self._runner.on_stop(callback)

    def pause(self) -> None:
        self._runner.pause()

    def resume(self) -> None:
        self._runner.resume()
