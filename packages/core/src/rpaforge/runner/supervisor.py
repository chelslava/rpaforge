"""Process supervisor managing execution lifecycle, signals, and resource quotas."""

from __future__ import annotations

import contextlib
import os
import signal
import threading
import time
from collections.abc import Callable
from dataclasses import dataclass
from typing import Any

import psutil

from rpaforge.cli.run import (
    LoadedDiagram,
    RunConfigurationError,
    RunExitCode,
    RunValidationError,
    apply_overrides,
)
from rpaforge.core.diagram_converter import DiagramConverter
from rpaforge.core.execution import (
    ActivityCall,
    ExecutionStatus,
)
from rpaforge.core.runner import StudioEngine
from rpaforge.core.validator import ValidationError as DiagramValidationError
from rpaforge.hitl.suspend import EVENT_APPROVAL_REQUESTED, EVENT_APPROVAL_RESOLVED
from rpaforge.runner.logging import EventLogger


class ResourceLimitError(RuntimeError):
    """Raised when process memory or CPU resources exceed configured quotas."""


@dataclass
class SupervisorConfig:
    """Configuration options for process supervision."""

    timeout: float | None = None
    max_memory_mb: int | None = None
    memory_poll_interval: float = 0.5
    graceful_drain_seconds: float = 5.0
    output_dir: str | None = None


class ProcessSupervisor:
    """Supervises workflow execution with resource quotas and signal handling."""

    def __init__(
        self,
        config: SupervisorConfig | None = None,
        logger: EventLogger | None = None,
        engine_factory: Callable[[], StudioEngine] = StudioEngine,
    ) -> None:
        self.config = config or SupervisorConfig()
        self.logger = logger or EventLogger()
        self._engine_factory = engine_factory
        self._engine: StudioEngine | None = None
        self._cancel_requested = threading.Event()
        self._resource_killed = threading.Event()
        self._resource_error_msg: str | None = None
        self._monitor_thread: threading.Thread | None = None
        self._stop_monitor = threading.Event()

    def _get_total_rss_mb(self) -> float:
        """Calculate total Resident Set Size (RSS) memory in MB for process tree."""
        try:
            current_proc = psutil.Process(os.getpid())
            total_bytes = current_proc.memory_info().rss
            for child in current_proc.children(recursive=True):
                with contextlib.suppress(psutil.NoSuchProcess, psutil.AccessDenied):
                    total_bytes += child.memory_info().rss
            return total_bytes / (1024 * 1024)
        except Exception:
            return 0.0

    def _start_memory_monitor(self) -> None:
        """Monitor RSS memory in background thread."""
        if not self.config.max_memory_mb or self.config.max_memory_mb <= 0:
            return

        def monitor_loop() -> None:
            limit_mb = self.config.max_memory_mb
            assert limit_mb is not None
            while not self._stop_monitor.is_set():
                rss = self._get_total_rss_mb()
                if rss > limit_mb:
                    msg = f"Memory limit exceeded: {rss:.1f} MB used (limit: {limit_mb} MB)"
                    self._resource_error_msg = msg
                    self._resource_killed.set()
                    self.logger.emit(
                        "resource_warning", message=msg, rss_mb=rss, limit_mb=limit_mb
                    )
                    if self._engine:
                        self._engine.cancel()
                    break
                time.sleep(self.config.memory_poll_interval)

        self._stop_monitor.clear()
        self._monitor_thread = threading.Thread(target=monitor_loop, daemon=True)
        self._monitor_thread.start()

    def _stop_memory_monitor(self) -> None:
        self._stop_monitor.set()
        if self._monitor_thread and self._monitor_thread.is_alive():
            self._monitor_thread.join(timeout=1.0)

    def execute(
        self,
        loaded: LoadedDiagram,
        values: list[str] | None = None,
        secret_envs: list[str] | None = None,
    ) -> tuple[RunExitCode, dict[str, Any]]:
        """Supervise the execution of a loaded diagram."""
        if self.config.timeout is not None and self.config.timeout <= 0:
            raise RunConfigurationError("--timeout must be greater than zero")

        try:
            process = DiagramConverter().convert(loaded.document)
        except (DiagramValidationError, KeyError, TypeError, ValueError) as error:
            raise RunValidationError(str(error)) from error

        apply_overrides(process, loaded.variables, values or [], secret_envs or [])

        engine = self._engine_factory()
        self._engine = engine
        self._cancel_requested.clear()
        self._resource_killed.clear()
        self._resource_error_msg = None

        def handle_signal(_signum: int | None = None, _frame: Any = None) -> None:
            self._cancel_requested.set()
            self.logger.emit(
                "log_message",
                level="WARNING",
                message="Termination signal received, cancelling execution...",
            )
            if self._engine:
                self._engine.cancel()

        previous_handlers: dict[signal.Signals, Any] = {}
        for signum in (signal.SIGINT, signal.SIGTERM):
            with contextlib.suppress(OSError, RuntimeError, ValueError):
                previous_handlers[signum] = signal.getsignal(signum)
                signal.signal(signum, handle_signal)

        # Wire execution event listeners to logger
        executor = getattr(engine, "executor", None)
        if executor and hasattr(executor, "add_listener"):

            def on_exec_event(
                event_type: str, data: Any = None, *args: Any, **kwargs: Any
            ) -> None:
                if event_type in ("start_activity", "activity_start"):
                    act = data if isinstance(data, ActivityCall) else None
                    self.logger.emit(
                        "activity_started",
                        activity=act.activity if act else "",
                        library=act.library if act else "",
                        node_id=act.node_id if act else "",
                    )
                elif event_type in ("end_activity", "activity_end"):
                    res = data if isinstance(data, dict) else {}
                    st = res.get("status")
                    st_str = "success"
                    if st == ExecutionStatus.FAIL:
                        st_str = "failed"
                    elif st == ExecutionStatus.CANCELLED:
                        st_str = "cancelled"
                    elif st == ExecutionStatus.SKIP:
                        st_str = "skipped"
                    self.logger.emit(
                        "activity_finished",
                        status=st_str,
                        duration_ms=res.get("elapsed_ms") or res.get("duration_ms", 0),
                        error=res.get("error"),
                        continued_on_error=res.get("continued_on_error", False),
                    )
                elif event_type == EVENT_APPROVAL_REQUESTED:
                    request = data if isinstance(data, dict) else {}
                    self.logger.emit(
                        "approval_requested",
                        token=str(request.get("id", "")),
                        question=str(request.get("question", "")),
                        node_id=str(request.get("node_id", "")),
                        process=str(request.get("process_name", "")),
                    )
                elif event_type == EVENT_APPROVAL_RESOLVED:
                    resolution = data if isinstance(data, dict) else {}
                    self.logger.emit(
                        "approval_resolved",
                        token=str(resolution.get("token", "")),
                        decision=str(resolution.get("decision", "")),
                    )

            executor.add_listener(on_exec_event)

        timer = (
            threading.Timer(self.config.timeout, handle_signal)
            if self.config.timeout
            else None
        )
        if timer:
            timer.daemon = True
            timer.start()

        self._start_memory_monitor()
        start_time = time.time()
        self.logger.emit(
            "process_started",
            process=process.name,
            run_id=engine.last_run_id or "pending",
        )

        try:
            result = engine.run(process)
        finally:
            if timer:
                timer.cancel()
            self._stop_memory_monitor()
            for signum, handler in previous_handlers.items():
                with contextlib.suppress(OSError, RuntimeError, ValueError):
                    signal.signal(signum, handler)
            engine.close()

        elapsed_ms = int((time.time() - start_time) * 1000)
        audit_path = engine.last_audit_path
        payload = {
            "status": result.status.value.lower(),
            "process": process.name,
            "run_id": engine.last_run_id,
            "audit_path": str(audit_path) if audit_path else None,
            "elapsed_ms": result.elapsed_ms if result.elapsed_ms else elapsed_ms,
            "message": result.message,
        }

        if self._resource_killed.is_set():
            payload["status"] = "resource_limit_exceeded"
            payload["error"] = self._resource_error_msg
            self.logger.emit(
                "process_finished",
                process=process.name,
                run_id=engine.last_run_id,
                status="resource_limit_exceeded",
                duration_ms=payload["elapsed_ms"],
                error=self._resource_error_msg,
                audit_path=str(audit_path) if audit_path else None,
            )
            return RunExitCode.CONFIGURATION_ERROR, payload

        if (
            self._cancel_requested.is_set()
            or result.status == ExecutionStatus.CANCELLED
        ):
            payload["status"] = "cancelled"
            self.logger.emit(
                "process_finished",
                process=process.name,
                run_id=engine.last_run_id,
                status="cancelled",
                duration_ms=payload["elapsed_ms"],
                audit_path=str(audit_path) if audit_path else None,
            )
            return RunExitCode.CANCELLED, payload

        if result.status != ExecutionStatus.PASS:
            self.logger.emit(
                "process_finished",
                process=process.name,
                run_id=engine.last_run_id,
                status="failed",
                duration_ms=payload["elapsed_ms"],
                error=result.message,
                audit_path=str(audit_path) if audit_path else None,
            )
            return RunExitCode.EXECUTION_FAILURE, payload

        self.logger.emit(
            "process_finished",
            process=process.name,
            run_id=engine.last_run_id,
            status="success",
            duration_ms=payload["elapsed_ms"],
            audit_path=str(audit_path) if audit_path else None,
        )
        return RunExitCode.SUCCESS, payload
