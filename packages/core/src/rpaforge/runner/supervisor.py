"""Process supervisor managing execution lifecycle, signals, and resource quotas."""

from __future__ import annotations

import contextlib
import os
import signal
import threading
import time
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path
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
from rpaforge.core.policy import Policy
from rpaforge.core.runner import StudioEngine
from rpaforge.core.validator import ValidationError as DiagramValidationError
from rpaforge.hitl.suspend import EVENT_APPROVAL_REQUESTED, EVENT_APPROVAL_RESOLVED
from rpaforge.observability import otel
from rpaforge.runner.logging import EventLogger, TeeEventLogger


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
        logger: EventLogger | TeeEventLogger | None = None,
        engine_factory: Callable[..., StudioEngine] = StudioEngine,
        policy: Policy | None = None,
    ) -> None:
        self.config = config or SupervisorConfig()
        self.logger = logger or EventLogger()
        self._engine_factory = engine_factory
        #: Default permission policy for executed processes (issue #844);
        #: may be overridden per-run via :meth:`execute`.
        self._policy = policy
        self._engine: StudioEngine | None = None
        self._cancel_requested = threading.Event()
        self._resource_killed = threading.Event()
        self._resource_error_msg: str | None = None
        self._monitor_thread: threading.Thread | None = None
        self._stop_monitor = threading.Event()

    def request_cancel(self, reason: str = "cancel requested") -> None:
        """Cooperatively cancel the running process from another thread.

        The daemon's cancel watcher (issue #857) calls this when the HTTP
        control plane flags the owning queue item; it mirrors the signal
        path: mark cancellation and interrupt the engine. Safe to call at
        any point of the run lifecycle — before the engine starts only the
        flag is set, and :meth:`execute` checks it on completion.
        """
        self._cancel_requested.set()
        self.logger.emit(
            "log_message",
            level="WARNING",
            message=f"Cooperative cancellation requested ({reason})",
        )
        engine = self._engine
        if engine is not None:
            engine.cancel()

    def _register_mcp_servers(self, engine: StudioEngine, source: Path) -> None:
        """Register MCP servers declared for this run (issue #853).

        Manifest resolution: ``RPAFORGE_MCP_CONFIG`` env first, then
        ``.rpaforge/mcp.json`` next to the diagram/project. A missing or
        unresolvable manifest means no MCP tools; a BROKEN manifest fails
        the run (fail-closed). Requires the ``[mcp]`` extra only when
        servers are actually declared.
        """
        from rpaforge.mcp.config import resolve_mcp_config_path

        config_path = resolve_mcp_config_path(source)
        if config_path is None:
            return
        register = getattr(engine, "register_mcp_servers", None)
        if register is None:
            self.logger.emit(
                "log_message",
                level="WARNING",
                message="MCP manifest found but the engine does not support MCP",
            )
            return
        try:
            registered = register(str(config_path))
        except Exception as exc:
            raise RunConfigurationError(f"MCP registration failed: {exc}") from exc
        if registered:
            self.logger.emit(
                "log_message",
                level="INFO",
                message=f"MCP servers registered: {', '.join(registered)}",
            )

    def _get_total_rss_mb(self) -> float:
        """Calculate total Resident Set Size (RSS) memory in MB for process tree."""
        try:
            current_proc = psutil.Process(os.getpid())
            total_bytes = current_proc.memory_info().rss
            for child in current_proc.children(recursive=True):
                with contextlib.suppress(psutil.NoSuchProcess, psutil.AccessDenied):
                    total_bytes += child.memory_info().rss
            return float(total_bytes / (1024 * 1024))
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
        policy: Policy | None = None,
    ) -> tuple[RunExitCode, dict[str, Any]]:
        """Supervise the execution of a loaded diagram.

        ``policy`` (issue #844) overrides the supervisor-level default; when
        no policy is configured a warning is logged because the process runs
        with full operator permissions.
        """
        if self.config.timeout is not None and self.config.timeout <= 0:
            raise RunConfigurationError("--timeout must be greater than zero")

        try:
            process = DiagramConverter().convert(loaded.document)
        except (DiagramValidationError, KeyError, TypeError, ValueError) as error:
            raise RunValidationError(str(error)) from error

        apply_overrides(process, loaded.variables, values or [], secret_envs or [])

        if self._cancel_requested.is_set():
            # A cooperative cancel arrived before the engine started (daemon
            # cancel watcher, issue #857): skip execution entirely instead of
            # losing the signal to the flag reset below.
            self.logger.emit(
                "process_finished",
                process=process.name,
                run_id=None,
                status="cancelled",
                duration_ms=0,
            )
            return RunExitCode.CANCELLED, {
                "status": "cancelled",
                "process": process.name,
                "run_id": None,
                "audit_path": None,
                "elapsed_ms": 0,
                "message": "cancelled before start",
            }

        effective_policy = policy if policy is not None else self._policy
        otel.configure_from_env()
        engine = self._engine_factory(policy=effective_policy)
        self._register_mcp_servers(engine, loaded.source)
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

        # Wire execution event listeners to logger + OpenTelemetry (issue #846)
        executor = getattr(engine, "executor", None)

        def otel_sweep() -> None:
            return None

        if executor and hasattr(executor, "add_listener"):
            #: Per-thread open span context managers keyed by span name —
            #: end events close the matching span, out-of-order events (task
            #: skipped on cancel) leave it to the post-run sweep below.
            otel_open: dict[int, dict[str, Any]] = {}

            def _otel_open(name: str, attributes: dict[str, Any]) -> None:
                cm = otel.start_cm_span(name, attributes)
                otel_open.setdefault(threading.get_ident(), {})[name] = cm

            def _otel_close(name: str, error: str | None = None) -> None:
                cm = otel_open.get(threading.get_ident(), {}).pop(name, None)
                if cm is not None:
                    otel.exit_cm_span(cm, error=error)

            def _otel_sweep() -> None:
                for open_spans in list(otel_open.values()):
                    for cm in open_spans.values():
                        otel.exit_cm_span(cm)

            otel_sweep = _otel_sweep

            def on_exec_event(
                event_type: str, data: Any = None, *args: Any, **kwargs: Any
            ) -> None:
                if event_type in ("start_process", "process_start"):
                    _otel_open("process.run", {"rpaforge.process": str(data or "")})
                elif event_type in ("start_task", "task_start"):
                    _otel_open("task.run", {"rpaforge.task": str(data or "")})
                elif event_type in ("end_task", "task_end"):
                    _otel_close("task.run")
                elif event_type in ("end_process", "process_end"):
                    _otel_close("process.run")
                elif event_type in ("start_activity", "activity_start"):
                    act = data if isinstance(data, ActivityCall) else None
                    self.logger.emit(
                        "activity_started",
                        activity=act.activity if act else "",
                        library=act.library if act else "",
                        node_id=act.node_id if act else "",
                    )
                    if act is not None:
                        _otel_open(
                            "activity.execute",
                            {
                                "rpaforge.library": act.library,
                                "rpaforge.activity": act.activity,
                                "rpaforge.node_id": act.node_id,
                            },
                        )
                elif event_type in ("end_activity", "activity_end"):
                    # end_activity notifies as (activity, result): pick the
                    # dict-shaped argument (previously status/error were lost).
                    res = next((a for a in (data, *args) if isinstance(a, dict)), {})
                    st = res.get("status")
                    act = next(
                        (a for a in (data, *args) if isinstance(a, ActivityCall)),
                        None,
                    )
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
                    violation = res.get("policy_violation")
                    if isinstance(violation, dict):
                        self.logger.emit("policy_violation", **violation)
                    # OTel: close the activity span and sample metrics.
                    _otel_close("activity.execute", error=res.get("error"))
                    if st == ExecutionStatus.FAIL:
                        otel.record_activity_failure(
                            act.library if act else "",
                            act.activity if act else "",
                        )
                    elif st == ExecutionStatus.PASS:
                        otel.record_activity_duration(
                            float(res.get("elapsed_ms") or res.get("duration_ms", 0)),
                            act.library if act else "",
                            act.activity if act else "",
                            status="pass",
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
                elif event_type in ("activity_cancelled", "activity_abandoned"):
                    # Cooperative-cancellation outcomes (issue #863): a
                    # threaded activity that honoured its token (cancelled)
                    # or one that outlived the abandon grace and had its
                    # live instance dropped (abandoned).
                    payload = data if isinstance(data, dict) else {}
                    self.logger.emit(event_type, **payload)
                    otel.record_activity_interrupted(
                        str(payload.get("library", "")),
                        str(payload.get("activity", "")),
                        outcome=(
                            "abandoned"
                            if event_type == "activity_abandoned"
                            else "cancelled"
                        ),
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
        if effective_policy is not None:
            self.logger.emit(
                "policy_loaded",
                path=effective_policy.source_path or "<inline>",
                sections=[
                    name
                    for name in (
                        "filesystem",
                        "network",
                        "process",
                        "environment",
                    )
                    if getattr(effective_policy, name) is not None
                ],
            )
        else:
            self.logger.emit(
                "log_message",
                level="WARNING",
                message=(
                    "No permission policy configured (RPAFORGE_POLICY unset) — "
                    "the process runs with full operator permissions"
                ),
            )
        self.logger.emit(
            "process_started",
            process=process.name,
            run_id=engine.last_run_id or "pending",
        )

        try:
            result = engine.run(process)
        finally:
            otel_sweep()
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
            return RunExitCode.RESOURCE_LIMIT_EXCEEDED, payload

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
