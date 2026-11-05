"""
RPAForge Process Runner.

Runner with debugging support (breakpoints, stepping, pause/resume).
"""

from __future__ import annotations

import contextlib
import logging
import threading
import time
import uuid
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from pathlib import Path
from typing import TYPE_CHECKING, Any

from rpaforge.config import get_runs_dir
from rpaforge.core.audit import RunRecord, StepRecord
from rpaforge.core.execution import (
    ActivityCall,
    ExecutionResult,
    ExecutionStatus,
    Process,
)
from rpaforge.core.executor import ProcessExecutor, StopExecution
from rpaforge.core.interfaces import Executor
from rpaforge.core.models import Breakpoint, CallFrame
from rpaforge.core.policy import Policy
from rpaforge.core.safe_evaluator import safe_eval
from rpaforge.core.validator import (
    ValidationError as ProcessValidationError,
)
from rpaforge.core.validator import (
    validate_process,
)
from rpaforge.hitl.suspend import EVENT_APPROVAL_REQUESTED, EVENT_APPROVAL_RESOLVED
from rpaforge.i18n import _ as _t

if TYPE_CHECKING:
    from rpaforge.core.checkpoint import CheckpointManager

logger = logging.getLogger("rpaforge")


class RunnerState(Enum):
    IDLE = "idle"
    RUNNING = "running"
    PAUSED = "paused"
    CANCELLING = "cancelling"
    STOPPED = "stopped"


class RewindNotAllowedError(RuntimeError):
    """Rewind/hot-reload refused — unattended run or missing checkpoint."""


class HotReloadRejectedError(RuntimeError):
    """Hot-reload rejected with typed reasons (issue #849).

    ``reasons`` carries human-readable explanations (validation errors,
    deleted paused node, ...) for the debugger UI.
    """

    def __init__(self, message: str, reasons: list[str] | None = None):
        super().__init__(message)
        self.reasons = reasons or [message]


@dataclass
class ResumeSpec:
    """Pending resume directives consumed by the next :meth:`run` call.

    Produced by :meth:`ProcessRunner.prepare_rewind` (``after_node_id`` —
    skip the executed prefix up to and including the checkpoint node) or
    :meth:`ProcessRunner.prepare_hot_reload` (``from_node_id`` — skip the
    prefix BEFORE the paused node and execute it with the edited plan).
    """

    variables: dict[str, Any] = field(default_factory=dict)
    after_node_id: str | None = None
    from_node_id: str | None = None
    activity_count: int = 0


@dataclass
class RewindPlan:
    """Summary returned by :meth:`ProcessRunner.prepare_rewind`."""

    checkpoint_id: str
    timestamp: str
    resume_after_node_id: str
    activity_count: int
    variables: dict[str, Any] = field(default_factory=dict)


@dataclass
class HotReloadSummary:
    """Diff summary returned by :meth:`ProcessRunner.prepare_hot_reload`."""

    paused_node_id: str
    added_nodes: list[str] = field(default_factory=list)
    removed_nodes: list[str] = field(default_factory=list)
    modified_nodes: list[str] = field(default_factory=list)
    changed_params: dict[str, list[str]] = field(default_factory=dict)


def _flatten_activities(process: Process) -> list[ActivityCall]:
    """Execution-order flat list of activity calls (incl. group children)."""
    ordered: list[ActivityCall] = []

    def walk(activity: Any) -> None:
        if isinstance(activity, ActivityCall):
            ordered.append(activity)
            return
        children = getattr(activity, "activities", None)
        if children:
            for child in children:
                walk(child)
        for attr in ("try_activities", "catch_activities", "finally_activities"):
            nested = getattr(activity, attr, None)
            if nested:
                for child in nested:
                    walk(child)

    for task in process.tasks:
        for activity in task.activities:
            walk(activity)
    return ordered


def _diff_params(old_call: ActivityCall, new_call: ActivityCall) -> list[str]:
    """Names of parameters whose values differ between two activity calls."""
    changes: list[str] = []
    old_kwargs = dict(old_call.kwargs or {})
    new_kwargs = dict(new_call.kwargs or {})
    for name in sorted(set(old_kwargs) | set(new_kwargs)):
        if old_kwargs.get(name, _MISSING) != new_kwargs.get(name, _MISSING):
            changes.append(name)
    if tuple(old_call.args or ()) != tuple(new_call.args or ()):
        changes.append("<positional>")
    return changes


_MISSING = object()


class ProcessRunner:
    """Process runner with debugging support."""

    def __init__(
        self,
        executor: Executor | None = None,
        checkpoint_manager: CheckpointManager | None = None,
        checkpoint_frequency: int = 10,
        policy: Policy | None = None,
    ):
        from rpaforge.core.checkpoint import CheckpointManager

        self._executor: Executor = executor or ProcessExecutor(policy=policy)
        self._policy = policy
        #: Pending resume directives (rewind / hot-reload, issue #849);
        #: consumed by the next :meth:`run` call.
        self._resume_spec: ResumeSpec | None = None
        #: True for daemon/serve-driven runs — rewind/hot-reload refused.
        self.unattended = False
        self._checkpoint_manager = checkpoint_manager or CheckpointManager(
            frequency=checkpoint_frequency
        )
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
        self._activity_count = 0
        self._lock = threading.Lock()
        self._current_run: RunRecord | None = None
        self._last_run_id: str | None = None
        self._last_audit_path: Path | None = None
        self._step_start_time: float | None = None

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
    def executor(self) -> Executor:
        return self._executor

    @property
    def last_run_id(self) -> str | None:
        """Return the identifier of the most recently finalized run."""
        return self._last_run_id

    @property
    def last_audit_path(self) -> Path | None:
        """Return the audit file written for the most recently finalized run."""
        return self._last_audit_path

    def run(self, process: Process) -> ExecutionResult:
        with self._lock:
            if self._state != RunnerState.IDLE:
                raise RuntimeError(_t("engine.runner_is_not_idle"))

            validation_result = validate_process(process)
            if not validation_result.is_valid:
                error_messages = [e.message for e in validation_result.errors]
                raise ProcessValidationError(
                    f"Process validation failed: {'; '.join(error_messages)}"
                )

            if self._policy is not None and hasattr(self._executor, "set_policy"):
                self._executor.set_policy(self._policy)

            spec = self._resume_spec
            self._resume_spec = None
            resume_after: str | None = None
            resume_from: str | None = None
            if spec is not None:
                for name, value in spec.variables.items():
                    process.set_variable(name, value)
                resume_after = spec.after_node_id
                resume_from = spec.from_node_id

            self._state = RunnerState.RUNNING
            self._stop_requested = False
            self._step_mode = None
            self._call_stack.clear()
            self._current_process = process
            self._activity_count = spec.activity_count if spec is not None else 0
            self._pause_event.set()
            self._init_audit_run(process)

        result = self._executor.run(
            process,
            resume_after_node_id=resume_after,
            resume_from_node_id=resume_from,
        )

        with self._lock:
            self._state = RunnerState.IDLE
            self._current_process = None
            self._finalize_audit_run(result)

        return result

    def stop(self) -> None:
        with self._lock:
            self._stop_requested = True
            self._pause_event.set()

    def cancel(self) -> None:
        should_cancel = False
        with self._lock:
            if self._state not in (RunnerState.RUNNING, RunnerState.PAUSED):
                return
            self._state = RunnerState.CANCELLING
            self._stop_requested = True
            self._pause_event.set()
            should_cancel = True

        if should_cancel:
            # Interrupt a timeout-protected activity immediately.  The
            # executor owns the worker/process tree, while the runner owns
            # lifecycle state and callbacks.
            self._executor.cancel()
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

    def clear_checkpoint(self) -> bool:
        return self._checkpoint_manager.clear()

    def has_checkpoint(self) -> bool:
        return self._checkpoint_manager.has_checkpoint()

    def get_checkpoint_info(self) -> dict[str, Any] | None:
        return self._checkpoint_manager.get_checkpoint_info()

    def get_checkpoint_data(self) -> Any:
        return self._checkpoint_manager.load()

    def list_checkpoints(self) -> list[dict[str, Any]]:
        """All kept checkpoints, newest first (debugger picker, issue #849)."""
        return [
            {
                "checkpoint_id": cp.checkpoint_id,
                "timestamp": cp.timestamp,
                "current_node_id": cp.current_node_id,
                "current_task_name": cp.current_task_name,
                "activity_count": cp.activity_count,
                "variable_count": len(cp.variables),
                "state": cp.state,
            }
            for cp in self._checkpoint_manager.list_checkpoints()
        ]

    def register_mcp_servers(self, config_path: str) -> list[str]:
        """Connect MCP servers from a manifest and register their tools.

        Tools become a synthetic ``MCP:<server>`` library on the executor
        (issue #853) callable from the agentic-loop. Requires the ``[mcp]``
        extra when servers are declared.
        """
        from rpaforge.mcp.library import register_mcp_libraries

        return register_mcp_libraries(self._executor, config_path)

    def prepare_rewind(
        self,
        checkpoint_id: str,
        variable_corrections: dict[str, Any] | None = None,
    ) -> RewindPlan:
        """Prepare a rewind to a checkpoint (issue #849).

        Stores a :class:`ResumeSpec` consumed by the NEXT ``run()`` call:
        variables restored from the checkpoint (optionally corrected), the
        executed prefix skipped up to and including the checkpoint's node.
        The caller (Studio) stops/cancels the current run, then re-issues
        the run with the original diagram — clean stop + controlled resume.

        Refused for unattended runs; unknown checkpoint IDs raise
        :class:`RewindNotAllowedError`.
        """
        if self.unattended:
            raise RewindNotAllowedError(
                "rewind is refused for unattended runs (daemon/serve)"
            )
        checkpoint = self._checkpoint_manager.load_by_id(checkpoint_id)
        if checkpoint is None:
            raise RewindNotAllowedError(f"checkpoint '{checkpoint_id}' not found")

        variables = dict(checkpoint.variables)
        variables.update(variable_corrections or {})
        self._resume_spec = ResumeSpec(
            variables=variables,
            after_node_id=checkpoint.current_node_id,
            activity_count=checkpoint.activity_count,
        )
        return RewindPlan(
            checkpoint_id=checkpoint.checkpoint_id,
            timestamp=checkpoint.timestamp,
            resume_after_node_id=checkpoint.current_node_id,
            activity_count=checkpoint.activity_count,
            variables=variables,
        )

    def prepare_hot_reload(self, document: dict[str, Any]) -> HotReloadSummary:
        """Validate an edited diagram for Apply & continue (issue #849).

        Requires a paused interactive debug session. Computes the diff
        between the old and new remaining plan (from the paused node
        onward), rejects the reload when the paused node was deleted or
        the diagram is invalid, and stores a :class:`ResumeSpec` so the
        next ``run()`` of the edited diagram executes from the paused node
        with the live variable state.

        Refused for unattended runs.
        """
        if self.unattended:
            raise RewindNotAllowedError(
                "hot reload is refused for unattended runs (daemon/serve)"
            )
        with self._lock:
            state = self._state
        if state != RunnerState.PAUSED:
            raise HotReloadRejectedError(
                "hot reload requires a paused debug session",
                reasons=[f"runner state is '{state.value}'"],
            )

        from rpaforge.core.diagram_converter import DiagramConverter
        from rpaforge.core.validator import (
            ValidationError as DiagramValidationError,
        )

        try:
            new_process = DiagramConverter().convert(document)
        except (DiagramValidationError, KeyError, TypeError, ValueError) as exc:
            raise HotReloadRejectedError(
                f"edited diagram is invalid: {exc}", reasons=[str(exc)]
            ) from exc

        paused_node = self._current_node_id or ""
        if not paused_node:
            raise HotReloadRejectedError(
                "no paused node recorded",
                reasons=["the debugger has no paused activity"],
            )

        old_flat = (
            _flatten_activities(self._current_process) if self._current_process else []
        )
        new_flat = _flatten_activities(new_process)
        old_ids = [a.node_id for a in old_flat]
        new_ids = [a.node_id for a in new_flat]
        if paused_node not in new_ids:
            raise HotReloadRejectedError(
                f"paused node '{paused_node}' was deleted — stop the run instead",
                reasons=[
                    f"paused node '{paused_node}' is missing from the edited diagram"
                ],
            )

        old_idx = old_ids.index(paused_node)
        new_idx = new_ids.index(paused_node)
        old_remaining = old_flat[old_idx:]
        new_remaining = new_flat[new_idx:]

        old_remaining_ids = [a.node_id for a in old_remaining]
        new_remaining_ids = [a.node_id for a in new_remaining]
        added = [nid for nid in new_remaining_ids if nid not in old_remaining_ids]
        removed = [nid for nid in old_remaining_ids if nid not in new_remaining_ids]
        modified: list[str] = []
        changed_params: dict[str, list[str]] = {}
        for call in new_remaining:
            if call.node_id not in old_remaining_ids:
                continue
            old_call = next(a for a in old_remaining if a.node_id == call.node_id)
            param_changes = _diff_params(old_call, call)
            if param_changes:
                modified.append(call.node_id)
                changed_params[call.node_id] = param_changes

        self._resume_spec = ResumeSpec(
            variables=dict(self.get_variables()),
            from_node_id=paused_node,
            activity_count=self._activity_count,
        )
        return HotReloadSummary(
            paused_node_id=paused_node,
            added_nodes=added,
            removed_nodes=removed,
            modified_nodes=modified,
            changed_params=changed_params,
        )

    @property
    def checkpoint_frequency(self) -> int:
        return self._checkpoint_manager.frequency

    @checkpoint_frequency.setter
    def checkpoint_frequency(self, value: int) -> None:
        self._checkpoint_manager.frequency = value

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

    def clear_callbacks(self) -> None:
        """Clear all registered event callbacks. Call before each new process run."""
        self._on_pause_callbacks.clear()
        self._on_resume_callbacks.clear()
        self._on_step_callbacks.clear()
        self._on_cancel_callbacks.clear()
        self._on_stop_callbacks.clear()

    def _on_execution_event(self, event_type: str, *args: Any) -> None:
        if event_type == "start_activity":
            activity = args[0] if args else None
            if isinstance(activity, ActivityCall):
                self._handle_activity_start(activity)

        elif event_type == "end_activity":
            result = args[1] if len(args) > 1 and isinstance(args[1], dict) else None
            self._handle_activity_end(result)

        elif event_type == EVENT_APPROVAL_REQUESTED:
            request = args[0] if args and isinstance(args[0], dict) else {}
            token = str(request.get("id", ""))
            if token:
                self._save_checkpoint(state="paused", approval_token=token)

        elif event_type == EVENT_APPROVAL_RESOLVED:
            payload = args[0] if args and isinstance(args[0], dict) else {}
            if str(payload.get("token", "")):
                self._save_checkpoint()

    def _handle_activity_start(self, activity: ActivityCall) -> None:
        if self._stop_requested:
            raise StopExecution()

        self._current_node_id = activity.node_id
        self._current_depth = len(self._call_stack) + 1

        # Start tracking time for audit logging
        self._step_start_time = time.time()

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

    def _handle_activity_end(self, result: dict[str, Any] | None = None) -> None:
        if self._call_stack:
            frame = self._call_stack.pop()
            # Record step completion for audit log.
            if self._step_start_time is not None:
                duration_ms = int((time.time() - self._step_start_time) * 1000)
                node_id = frame.node_id or ""
                result = result or {}
                execution_status = result.get("status")
                if execution_status == ExecutionStatus.FAIL:
                    status = "failed"
                elif execution_status == ExecutionStatus.CANCELLED:
                    status = "cancelled"
                elif execution_status == ExecutionStatus.SKIP:
                    status = "skipped"
                else:
                    status = "success"
                self._record_activity_step(
                    ActivityCall(
                        library=frame.library,
                        activity=frame.activity,
                        node_id=node_id,
                    ),
                    duration_ms=duration_ms,
                    status=status,
                    output=result.get("output"),
                    error=result.get("error"),
                    continued_on_error=bool(result.get("continued_on_error")),
                )
                self._step_start_time = None

        self._current_depth = len(self._call_stack)
        self._activity_count += 1

        if self._checkpoint_manager.should_checkpoint(self._activity_count):
            self._save_checkpoint()

        if (
            self._step_mode == "over" or self._step_mode == "out"
        ) and self._current_depth <= self._step_depth:
            with self._lock:
                self._state = RunnerState.PAUSED
                self._step_mode = None
                self._pause_event.clear()
                self._notify_pause()
            self._pause_event.wait()

    def _save_checkpoint(
        self,
        *,
        state: str | None = None,
        approval_token: str = "",
    ) -> None:
        process_name = self._current_process.name if self._current_process else ""
        task_name = (
            self._executor.context.task.name
            if self._executor.context and self._executor.context.task
            else ""
        )
        self._checkpoint_manager.save(
            process_name=process_name,
            current_node_id=self._current_node_id or "",
            current_task_name=task_name,
            state=state or self._state.value,
            variables=self.get_variables(),
            call_stack=self._call_stack,
            breakpoints=self._breakpoints,
            activity_count=self._activity_count,
            approval_token=approval_token,
        )

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

    def _init_audit_run(self, process: Process) -> None:
        """Initialize audit run record."""
        run_id = str(uuid.uuid4())
        now = datetime.now(timezone.utc).isoformat()
        self._current_run = RunRecord(
            run_id=run_id,
            process_name=process.name,
            started_at=now,
        )
        self._last_run_id = run_id
        self._last_audit_path = None
        self._step_start_time = None

    def _finalize_audit_run(self, result: ExecutionResult) -> None:
        """Finalize and save audit run record."""
        if not self._current_run:
            return

        now = datetime.now(timezone.utc).isoformat()
        self._current_run.finished_at = now

        # Map execution result status to audit status
        if result.status == ExecutionStatus.PASS:
            self._current_run.status = "success"
        elif result.status == ExecutionStatus.FAIL:
            self._current_run.status = "failed"
        else:
            self._current_run.status = "cancelled"

        # Save to disk
        try:
            runs_dir = get_runs_dir()
            self._last_audit_path = self._current_run.save(runs_dir)
            self._cleanup_old_runs(runs_dir, keep=50)
        except Exception as e:
            logger.warning(f"Failed to save audit run: {e}")

        self._current_run = None

    def _record_activity_step(
        self,
        activity: ActivityCall,
        duration_ms: int,
        status: str,
        output: Any | None = None,
        error: str | None = None,
        continued_on_error: bool = False,
    ) -> None:
        """Record a single activity step in the audit log."""
        if not self._current_run:
            return

        from datetime import datetime, timezone

        now = datetime.now(timezone.utc).isoformat()
        variables: dict[str, Any] = {}
        with contextlib.suppress(Exception):
            if (
                hasattr(self._executor, "context")
                and self._executor.context
                and hasattr(self._executor.context, "variables")
            ):
                variables = dict(self._executor.context.variables)

        step = StepRecord(
            activity=f"{activity.library}.{activity.activity}"
            if activity.library
            else activity.activity,
            node_id=activity.node_id,
            started_at=now,
            duration_ms=duration_ms,
            status=status,
            inputs={},
            output=output,
            error=error,
            continued_on_error=continued_on_error,
            variable_snapshot=variables,
        )
        self._current_run.steps.append(step)

    def _cleanup_old_runs(self, runs_dir: Path, keep: int = 50) -> None:
        """Keep only the last N run records."""
        if not runs_dir.exists():
            return

        json_files = sorted(runs_dir.glob("*.json"), key=lambda p: p.stat().st_mtime)
        if len(json_files) > keep:
            # Remove oldest files
            to_remove = json_files[:-keep]
            for filepath in to_remove:
                try:
                    filepath.unlink()
                    logger.debug(f"Cleaned up old run: {filepath.name}")
                except Exception as e:
                    logger.warning(f"Failed to cleanup run {filepath.name}: {e}")

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

    def __init__(
        self,
        executor: Executor | None = None,
        debugger: Any | None = None,
        output_dir: str | None = None,
        checkpoint_frequency: int = 10,
        policy: Policy | None = None,
    ):
        self._runner = ProcessRunner(
            executor=executor,
            checkpoint_frequency=checkpoint_frequency,
            policy=policy,
        )
        self._debugger = debugger
        self._output_dir = output_dir
        self._is_running = False

    @property
    def executor(self) -> Executor:
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
        raise NotImplementedError(
            "run_string is disabled for security reasons: exec() with full builtins "
            "poses an RCE risk. Use diagram-based process execution instead."
        )

    def stop(self) -> None:
        self._runner.stop()

    def cancel(self) -> None:
        """Cancel the active process and its owned workers."""
        self._runner.cancel()

    @property
    def last_run_id(self) -> str | None:
        """Return the identifier of the most recently finalized run."""
        return self._runner.last_run_id

    @property
    def last_audit_path(self) -> Path | None:
        """Return the audit file written for the most recently finalized run."""
        return self._runner.last_audit_path

    def close(self) -> None:
        """Release executor resources owned by the engine."""
        close = getattr(self._runner.executor, "close", None)
        if callable(close):
            close()

    def clear_checkpoint(self) -> bool:
        return self._runner.clear_checkpoint()

    def has_checkpoint(self) -> bool:
        return self._runner.has_checkpoint()

    def get_checkpoint_info(self) -> dict[str, Any] | None:
        return self._runner.get_checkpoint_info()

    def get_checkpoint_data(self) -> Any:
        return self._runner.get_checkpoint_data()

    @property
    def checkpoint_frequency(self) -> int:
        return self._runner.checkpoint_frequency

    @checkpoint_frequency.setter
    def checkpoint_frequency(self, value: int) -> None:
        self._runner.checkpoint_frequency = value

    def on_cancel(self, callback: Callable) -> None:
        self._runner.on_cancel(callback)

    def on_stop(self, callback: Callable) -> None:
        self._runner.on_stop(callback)

    def pause(self) -> None:
        self._runner.pause()

    def resume(self) -> None:
        self._runner.resume()
