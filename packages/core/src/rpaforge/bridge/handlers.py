"""
RPAForge Bridge Handlers.

Request handlers for JSON-RPC methods.
"""

from __future__ import annotations

import asyncio
import contextlib
import json
import shutil
import time
from typing import TYPE_CHECKING, Any

from rpaforge.bridge.events import (
    ErrorEvent,
    LogEvent,
    ProcessFinishedEvent,
    ProcessPausedEvent,
    ProcessResumedEvent,
    ProcessStartedEvent,
    ProcessStoppedEvent,
)
from rpaforge.bridge.protocol import JSONRPCError, JSONRPCErrorCode
from rpaforge.core.activity import list_activities, list_libraries

_RUFF_EXECUTABLE: str | None = shutil.which("ruff")

if TYPE_CHECKING:
    from collections.abc import Callable

    from rpaforge.core.runner import ProcessRunner, StudioEngine


class BridgeHandlers:
    """Handlers for JSON-RPC methods."""

    def __init__(
        self,
        engine: StudioEngine,
        emit_event: Callable[[dict], None] | None = None,
    ):
        self._engine = engine
        self._runner: ProcessRunner | None = None
        self._emit_event = emit_event
        self._process_task: asyncio.Task | None = None
        self._process_future: asyncio.Future | None = None
        self._process_id: str | None = None
        self._cancel_requested = False
        self._paused = False
        self._terminal_event_emitted = False
        self._start_time: float = 0.0
        self._current_sourcemap: dict = {}
        self._heartbeat_interval: float = 30.0
        self._last_heartbeat: float = time.time()
        self._lifecycle_lock = asyncio.Lock()
        self._pending_breakpoints: list[dict[str, Any]] = []
        self._ensure_activities_registered()

    def _ensure_activities_registered(self) -> None:
        """Register all available libraries with graceful handling for optional deps."""
        import logging

        logger = logging.getLogger("rpaforge.bridge")

        library_mappings = [
            ("DesktopUI", "rpaforge_libraries.DesktopUI", "Desktop UI automation"),
            ("Excel", "rpaforge_libraries.Excel", "Excel operations"),
            ("File", "rpaforge_libraries.File", "File operations"),
            ("Flow", "rpaforge_libraries.Flow", "Flow control"),
            ("HTTP", "rpaforge_libraries.HTTP", "HTTP requests"),
            ("String", "rpaforge_libraries.String", "String operations"),
            ("DateTime", "rpaforge_libraries.DateTime", "Date/time operations"),
            ("Variables", "rpaforge_libraries.Variables", "Variable operations"),
            ("WebUI", "rpaforge_libraries.WebUI", "Web automation"),
        ]

        for lib_name, lib_module, description in library_mappings:
            try:
                import importlib

                module = importlib.import_module(f"{lib_module}.library")
                lib_class = getattr(module, lib_name)
                self._engine.executor.register_library(lib_name, lib_class())
            except ImportError:
                logger.warning(
                    f"{lib_name} library not available ({description}). "
                    f"Install with: pip install rpaforge[{lib_name.lower()}]"
                )
            except AttributeError:
                logger.warning(f"{lib_name} class not found in {lib_module}")
            except Exception:
                logger.exception(f"Failed to register {lib_name}")

    def get_handlers(self) -> dict[str, Callable[[dict], Any]]:
        return {
            "ping": self._handle_ping,
            "getCapabilities": self._handle_get_capabilities,
            "runProcess": self._handle_run_process,
            "runDiagram": self._handle_run_diagram,
            "stopProcess": self._handle_stop_process,
            "pauseProcess": self._handle_pause_process,
            "resumeProcess": self._handle_resume_process,
            "setBreakpoint": self._handle_set_breakpoint,
            "removeBreakpoint": self._handle_remove_breakpoint,
            "toggleBreakpoint": self._handle_toggle_breakpoint,
            "getBreakpoints": self._handle_get_breakpoints,
            "stepOver": self._handle_step_over,
            "stepInto": self._handle_step_into,
            "stepOut": self._handle_step_out,
            "continue": self._handle_continue,
            "getVariables": self._handle_get_variables,
            "getCallStack": self._handle_get_call_stack,
            "getActivities": self._handle_get_activities,
            "generateCode": self._handle_generate_code,
            "formatCode": self._handle_format_code,
            "validateCode": self._handle_validate_code,
            "shutdown": self._handle_shutdown,
            "inspectPage": self._handle_inspect_page,
            "highlightElement": self._handle_highlight_element,
            "testSelector": self._handle_test_selector,
            "getXPathFromPoint": self._handle_get_xpath_from_point,
            "capturePageScreenshot": self._handle_capture_screenshot,
            "inspectDesktop": self._handle_inspect_desktop,
            "listWindows": self._handle_list_windows,
            "testDesktopSelector": self._handle_test_desktop_selector,
            "highlightDesktopElement": self._handle_highlight_desktop_element,
            "captureWebElement": self._handle_capture_web_element,
            "captureDesktopElement": self._handle_capture_desktop_element,
            "getMousePosition": self._handle_get_mouse_position,
        }

    def _emit(self, event_dict: dict) -> None:
        if self._emit_event:
            self._emit_event(event_dict)

    def _setup_runner_callbacks(self) -> None:
        if not self._runner:
            return

        def on_pause(frame, node_id):
            if self._cancel_requested:
                return
            self._paused = True
            self._emit(
                ProcessPausedEvent(
                    file="",
                    line=frame.line if frame else 0,
                    node_id=node_id or "",
                    reason="breakpoint",
                ).to_dict()
            )

        def on_resume():
            if self._cancel_requested:
                return
            self._paused = False
            self._emit(ProcessResumedEvent().to_dict())

        self._runner.on_pause(on_pause)
        self._runner.on_resume(on_resume)

        def on_cancel():
            self._emit(
                LogEvent(
                    level="info",
                    message="Process cancellation requested",
                ).to_dict()
            )

        self._runner.on_cancel(on_cancel)

    def _apply_pending_breakpoints(self) -> None:
        if not self._runner or not self._pending_breakpoints:
            return

        for bp_data in self._pending_breakpoints:
            with contextlib.suppress(Exception):
                self._runner.add_breakpoint(
                    node_id=bp_data.get("nodeId", ""),
                    line=bp_data.get("line", 0),
                    condition=bp_data.get("condition"),
                    hit_condition=bp_data.get("hitCondition"),
                )

        self._pending_breakpoints.clear()

    def _handle_ping(self, _params: dict) -> dict[str, Any]:
        """Respond to a heartbeat ping and update the last-heartbeat timestamp.

        Request: no required fields.
        Response: pong, timestamp, status, processId, isRunning, isPaused.
        """
        self._last_heartbeat = time.time()
        return {
            "pong": True,
            "timestamp": time.time(),
            "status": self._get_status(),
            "processId": self._process_id,
            "isRunning": self._process_task is not None
            and not self._process_task.done(),
            "isPaused": self._paused,
        }

    def _get_status(self) -> str:
        if self._process_task is None or self._process_task.done():
            return "idle"
        if self._paused:
            return "paused"
        return "running"

    def _handle_get_capabilities(self, _params: dict) -> dict[str, Any]:
        """Return engine version, supported features, and registered library names.

        Request: no required fields.
        Response: version, features dict, libraries list.
        """
        return {
            "version": "0.2.0",
            "features": {
                "debugger": True,
                "breakpoints": True,
                "stepping": True,
                "variableWatching": True,
                "nativePython": True,
            },
            "libraries": [lib.name for lib in list_libraries()],
        }

    async def _handle_run_process(self, params: dict) -> dict[str, Any]:
        """Start a process from a serialised process dict or Robot Framework source string.

        Request: process or source (required), name, sourcemap.
        Response: processId, status.
        Raises: JSONRPCError if process/source is missing or a process is already running.
        """
        process_data = params.get("process") or params.get("source")
        sourcemap = params.get("sourcemap")

        if not process_data:
            raise JSONRPCError(
                code=JSONRPCErrorCode.INVALID_PARAMS,
                message="Missing required parameter: process or source",
            )

        async with self._lifecycle_lock:
            if self._process_task and not self._process_task.done():
                raise JSONRPCError(
                    code=JSONRPCErrorCode.INVALID_PARAMS,
                    message="A process is already running or stopping",
                )

            self._start_time = time.time()
            self._process_id = f"process-{int(self._start_time * 1000)}"
            self._cancel_requested = False
            self._paused = False
            self._terminal_event_emitted = False

            self._emit(
                ProcessStartedEvent(
                    process_id=self._process_id,
                    name=params.get("name", "Unnamed"),
                ).to_dict()
            )

            self._emit(
                LogEvent(
                    level="info",
                    message=f"Starting process: {self._process_id}",
                ).to_dict()
            )

            self._process_task = asyncio.create_task(
                self._run_process_async(process_data, sourcemap)
            )

        return {
            "processId": self._process_id,
            "status": "running",
        }

    async def _handle_run_diagram(self, params: dict) -> dict[str, Any]:
        """Convert a visual diagram to a process and execute it.

        Request: diagram (required) — serialised diagram with nodes/edges/metadata.
        Response: processId, status.
        Raises: JSONRPCError if diagram is missing or a process is already running.
        """
        diagram = params.get("diagram")

        if not diagram:
            raise JSONRPCError(
                code=JSONRPCErrorCode.INVALID_PARAMS,
                message="Missing required parameter: diagram",
            )

        if self._process_task and not self._process_task.done():
            raise JSONRPCError(
                code=JSONRPCErrorCode.INVALID_PARAMS,
                message="A process is already running or stopping",
            )

        from rpaforge.core.validation import ValidationError as ValidationErr
        from rpaforge.core.validation import validate_diagram_size

        try:
            validate_diagram_size(diagram.get("nodes", []), diagram.get("edges", []))
        except ValidationErr as e:
            raise JSONRPCError(
                code=JSONRPCErrorCode.INVALID_PARAMS,
                message=str(e),
            ) from None

        from rpaforge.core.diagram_converter import DiagramConverter

        converter = DiagramConverter()
        process = converter.convert(diagram)

        process_data = {
            "name": process.name,
            "variables": process.variables,
            "tasks": [
                {
                    "name": task.name,
                    "activities": [
                        {
                            "library": act.library,
                            "activity": act.activity,
                            "args": list(act.args),
                            "kwargs": act.kwargs,
                            "line": act.line,
                            "nodeId": act.node_id,
                            "outputVariable": act.output_variable,
                        }
                        for act in task.activities
                    ],
                }
                for task in process.tasks
            ],
        }

        self._start_time = time.time()
        self._process_id = f"process-{int(self._start_time * 1000)}"
        self._cancel_requested = False
        self._paused = False
        self._terminal_event_emitted = False

        self._emit(
            ProcessStartedEvent(
                process_id=self._process_id,
                name=process.name,
            ).to_dict()
        )

        self._emit(
            LogEvent(
                level="info",
                message=f"Starting process: {self._process_id}",
            ).to_dict()
        )

        self._process_task = asyncio.create_task(
            self._run_process_async(process_data, None)
        )

        return {
            "processId": self._process_id,
            "status": "running",
        }

    async def _run_process_async(
        self, process_data: dict | str, sourcemap: dict | None
    ) -> None:
        try:
            loop = asyncio.get_event_loop()
            self._process_future = loop.run_in_executor(
                None, self._run_process_sync, process_data, sourcemap
            )
            result = await self._process_future

            if self._cancel_requested:
                return

            duration = time.time() - self._start_time
            status = "pass" if result.passed else "fail"

            self._emit(
                ProcessFinishedEvent(
                    status=status,
                    duration=duration,
                    message=result.message,
                ).to_dict()
            )
            self._terminal_event_emitted = True
        except asyncio.CancelledError:
            self._emit_stopped_if_needed("Process stopped by user")
        except Exception as e:
            if self._cancel_requested:
                self._emit_stopped_if_needed("Process stopped by user")
            else:
                self._emit(
                    ErrorEvent(
                        code=JSONRPCErrorCode.INTERNAL_ERROR,
                        message=str(e),
                    ).to_dict()
                )
        finally:
            async with self._lifecycle_lock:
                self._process_future = None
                self._process_task = None
                self._process_id = None
                self._cancel_requested = False
                self._paused = False
                self._terminal_event_emitted = False

    def _emit_stopped_if_needed(self, message: str) -> None:
        if self._terminal_event_emitted:
            return

        self._terminal_event_emitted = True
        self._emit(ProcessStoppedEvent(reason="user").to_dict())
        self._emit(
            LogEvent(
                level="info",
                message=message,
            ).to_dict()
        )

    def _run_process_sync(
        self, process_data: dict | str, sourcemap: dict | None = None
    ):
        if isinstance(process_data, str):
            return self._run_source_code(process_data, sourcemap)

        from rpaforge.core.execution import ActivityCall, Process, Task

        process = Process(name=process_data.get("name", "Process"))

        for var_name, var_value in process_data.get("variables", {}).items():
            process.set_variable(var_name, var_value)

        for task_data in process_data.get("tasks", []):
            task = Task(name=task_data.get("name", "Task"))

            for activity_data in task_data.get("activities", []):
                activity = ActivityCall(
                    library=activity_data.get("library", "DesktopUI"),
                    activity=activity_data.get("activity", ""),
                    args=tuple(activity_data.get("args", [])),
                    kwargs=activity_data.get("kwargs", {}),
                    line=activity_data.get("line", 0),
                    node_id=activity_data.get("nodeId", ""),
                    output_variable=activity_data.get("outputVariable", ""),
                )
                task.activities.append(activity)

            process.tasks.append(task)

        self._runner = self._engine._runner
        self._setup_runner_callbacks()
        self._apply_pending_breakpoints()

        return self._engine.run(process)

    def _run_source_code(self, source: str, sourcemap: dict | None = None):
        self._runner = self._engine._runner
        self._setup_runner_callbacks()
        self._current_sourcemap = sourcemap or {}
        return self._engine.run_string(source)

    def _handle_stop_process(self, _params: dict) -> dict[str, Any]:
        """Request cancellation of the currently running process.

        Request: no required fields.
        Response: status ('cancelling', 'no_process', or 'no_running_process'), processId.
        """
        if not self._process_id:
            return {"status": "no_process"}

        if not self._process_task or self._process_task.done():
            return {"status": "no_running_process"}

        self._cancel_requested = True

        if self._runner:
            self._runner.cancel()

        return {"status": "cancelling", "processId": self._process_id}

    def _handle_pause_process(self, _params: dict) -> dict[str, Any]:
        """Pause the currently running process.

        Request: no required fields.
        Response: status ('paused' or 'not_running').
        """
        if self._runner and self._runner.is_running:
            self._runner.pause()
            return {"status": "paused"}
        return {"status": "not_running"}

    def _handle_resume_process(self, _params: dict) -> dict[str, Any]:
        """Resume a paused process.

        Request: no required fields.
        Response: status ('running' or 'not_paused').
        """
        if self._runner and self._runner.is_paused:
            self._runner.resume()
            return {"status": "running"}
        return {"status": "not_paused"}

    def _handle_set_breakpoint(self, params: dict) -> dict[str, Any]:
        """Add a breakpoint at a node or line, queuing it if no runner is active.

        Request:
            {
                "nodeId": str,       # diagram node identifier
                "line": int,         # source line number (0 = unspecified)
                "condition": str,    # optional Python expression
                "hitCondition": str, # optional hit-count expression
            }

        Response:
            {
                "breakpointId": str,  # assigned ID ("pending-N" if queued)
                "nodeId": str,
                "line": int,
                "enabled": bool,
                "pending": bool,      # True only when queued before process start
            }

        Errors:
            - None raised; queues the breakpoint if the runner is not yet started.

        Example::
            request = {"nodeId": "node-1", "line": 10}
            response = {"breakpointId": "bp-1", "nodeId": "node-1", "line": 10, "enabled": True}
        """
        node_id = params.get("nodeId", "")
        line = params.get("line", 0)
        condition = params.get("condition")
        hit_condition = params.get("hitCondition")

        if not self._runner:
            bp_data = {
                "nodeId": node_id,
                "line": line,
                "condition": condition,
                "hitCondition": hit_condition,
            }
            self._pending_breakpoints.append(bp_data)

            return {
                "breakpointId": f"pending-{len(self._pending_breakpoints)}",
                "nodeId": node_id,
                "line": line,
                "enabled": True,
                "pending": True,
            }

        bp = self._runner.add_breakpoint(
            node_id=node_id,
            line=line,
            condition=condition,
            hit_condition=hit_condition,
        )

        return {
            "breakpointId": bp.id,
            "nodeId": bp.node_id,
            "line": bp.line,
            "enabled": bp.enabled,
        }

    def _handle_remove_breakpoint(self, params: dict) -> dict[str, Any]:
        """Remove a breakpoint by its ID.

        Request:
            {
                "breakpointId": str,  # ID returned by setBreakpoint
            }

        Response:
            {
                "removed": bool,  # True if found and removed, False otherwise
            }

        Errors:
            - None raised; returns removed=False when no runner is active.

        Example::
            request = {"breakpointId": "bp-1"}
            response = {"removed": True}
        """
        bp_id = params.get("breakpointId", "")
        if self._runner:
            removed = self._runner.remove_breakpoint(bp_id)
            return {"removed": removed}
        return {"removed": False}

    def _handle_toggle_breakpoint(self, params: dict) -> dict[str, Any]:
        """Toggle the enabled/disabled state of a breakpoint.

        Request:
            {
                "breakpointId": str,  # ID returned by setBreakpoint
            }

        Response:
            {
                "enabled": bool | None,  # new state, or None if no runner is active
            }

        Errors:
            - None raised; returns enabled=None when no runner is active.

        Example::
            request = {"breakpointId": "bp-1"}
            response = {"enabled": False}
        """
        bp_id = params.get("breakpointId", "")
        if self._runner:
            enabled = self._runner.toggle_breakpoint(bp_id)
            return {"enabled": enabled}
        return {"enabled": None}

    def _handle_get_breakpoints(self, _params: dict) -> dict[str, Any]:
        """Return all currently registered breakpoints.

        Request:
            {}

        Response:
            {
                "breakpoints": list[  # empty list when no runner is active
                    {
                        "id": str,
                        "nodeId": str,
                        "line": int,
                        "enabled": bool,
                        "condition": str | None,
                        "hitCount": int,
                    }
                ],
            }

        Errors:
            - None raised.

        Example::
            request = {}
            response = {"breakpoints": [{"id": "bp-1", "nodeId": "node-1", "line": 10, "enabled": True, "condition": None, "hitCount": 0}]}
        """
        if not self._runner:
            return {"breakpoints": []}

        breakpoints = [
            {
                "id": bp.id,
                "nodeId": bp.node_id,
                "line": bp.line,
                "enabled": bp.enabled,
                "condition": bp.condition,
                "hitCount": bp.hit_count,
            }
            for bp in self._runner.get_breakpoints()
        ]

        return {"breakpoints": breakpoints}

    def _handle_step_over(self, _params: dict) -> dict[str, Any]:
        """Advance execution by one activity, skipping into sub-diagrams.

        Request:
            {}

        Response:
            {
                "status": str,  # "stepping" or "not_paused"
            }

        Errors:
            - None raised; returns not_paused when runner is not in paused state.

        Example::
            request = {}
            response = {"status": "stepping"}
        """
        if self._runner and self._runner.is_paused:
            self._runner.step_over()
            return {"status": "stepping"}
        return {"status": "not_paused"}

    def _handle_step_into(self, _params: dict) -> dict[str, Any]:
        """Advance execution into a sub-diagram or the next activity.

        Request:
            {}

        Response:
            {
                "status": str,  # "stepping" or "not_paused"
            }

        Errors:
            - None raised; returns not_paused when runner is not in paused state.

        Example::
            request = {}
            response = {"status": "stepping"}
        """
        if self._runner and self._runner.is_paused:
            self._runner.step_into()
            return {"status": "stepping"}
        return {"status": "not_paused"}

    def _handle_step_out(self, _params: dict) -> dict[str, Any]:
        """Finish the current sub-diagram and pause at the caller.

        Request:
            {}

        Response:
            {
                "status": str,  # "stepping" or "not_paused"
            }

        Errors:
            - None raised; returns not_paused when runner is not in paused state.

        Example::
            request = {}
            response = {"status": "stepping"}
        """
        if self._runner and self._runner.is_paused:
            self._runner.step_out()
            return {"status": "stepping"}
        return {"status": "not_paused"}

    def _handle_continue(self, _params: dict) -> dict[str, Any]:
        """Resume a paused process and run until the next breakpoint or completion.

        Request:
            {}

        Response:
            {
                "status": str,  # "running" or "not_paused"
            }

        Errors:
            - None raised; returns not_paused when runner is not in paused state.

        Example::
            request = {}
            response = {"status": "running"}
        """
        if self._runner and self._runner.is_paused:
            self._runner.resume()
            return {"status": "running"}
        return {"status": "not_paused"}

    def _handle_get_variables(self, _params: dict) -> dict[str, Any]:
        """Return all current process variables with their values and types.

        Request:
            {}

        Response:
            {
                "variables": list[
                    {
                        "name": str,
                        "value": Any,
                        "type": str,  # Python type name
                    }
                ],  # empty list when no runner is active
            }

        Errors:
            - None raised.

        Example::
            request = {}
            response = {"variables": [{"name": "url", "value": "https://example.com", "type": "str"}]}
        """
        if self._runner:
            raw_vars = self._runner.get_variables()
            variables = [
                {
                    "name": name,
                    "value": value,
                    "type": type(value).__name__,
                }
                for name, value in raw_vars.items()
            ]
            return {"variables": variables}
        return {"variables": []}

    def _handle_get_call_stack(self, _params: dict) -> dict[str, Any]:
        """Return the current call stack of running activities.

        Request:
            {}

        Response:
            {
                "callStack": list[
                    {
                        "activity": str,
                        "library": str,
                        "line": int,
                        "nodeId": str,
                    }
                ],  # empty list when no runner is active
            }

        Errors:
            - None raised.

        Example::
            request = {}
            response = {"callStack": [{"activity": "Click", "library": "WebUI", "line": 5, "nodeId": "node-2"}]}
        """
        if not self._runner:
            return {"callStack": []}

        stack = [
            {
                "activity": frame.activity,
                "library": frame.library,
                "line": frame.line,
                "nodeId": frame.node_id,
            }
            for frame in self._runner.get_call_stack()
        ]

        return {"callStack": stack}

    def _handle_get_activities(self, _params: dict) -> dict[str, Any]:
        """Return metadata for all registered activities across all libraries.

        Request:
            {}

        Response:
            {
                "activities": list[
                    {
                        "id": str,           # "Library.activity_id"
                        "name": str,
                        "library": str,
                        "category": str,
                        "description": str,
                        "tags": list[str],
                        "type": str,         # "sync" | "async"
                        "timeout_ms": int,
                        "has_retry": bool,
                        "has_continue_on_error": bool,
                        "params": list,
                        "has_output": bool,
                        "output_description": str,
                    }
                ],
            }

        Errors:
            - None raised.

        Example::
            request = {}
            response = {"activities": [{"id": "WebUI.Click", "name": "Click", "library": "WebUI", ...}]}
        """
        activities = [
            {
                "id": f"{act.library}.{act.id}" if act.library else act.id,
                "name": act.name,
                "library": act.library,
                "category": act.category,
                "description": act.description,
                "tags": act.tags,
                "type": (
                    act.activity_type.value if hasattr(act, "activity_type") else "sync"
                ),
                "timeout_ms": act.timeout_ms,
                "has_retry": act.has_retry,
                "has_continue_on_error": act.has_continue_on_error,
                "params": act.params,
                "has_output": act.has_output,
                "output_description": act.output_description,
            }
            for act in list_activities()
        ]

        return {"activities": activities}

    def _handle_format_code(self, params: dict) -> dict[str, Any]:
        """Format Python source code using ruff.

        Request:
            {
                "code": str,  # Python source to format
            }

        Response:
            {
                "formatted_code": str,
                "changed": bool,  # True if formatting modified the source
            }

        Errors:
            - JSONRPCError(INTERNAL_ERROR): ruff timed out (>10 s) or is not installed.

        Example::
            request = {"code": "x=1"}
            response = {"formatted_code": "x = 1\n", "changed": True}
        """
        import logging
        import subprocess
        import tempfile

        logger = logging.getLogger("rpaforge.bridge")
        code = params.get("code", "")

        if not code:
            return {"formatted_code": "", "changed": False}

        from rpaforge.core.validation import ValidationError as ValidationErr
        from rpaforge.core.validation import validate_expression

        try:
            validate_expression(code, limit=51200)
        except ValidationErr as e:
            raise JSONRPCError(
                code=JSONRPCErrorCode.INVALID_PARAMS,
                message=str(e),
            ) from None

        try:
            with tempfile.NamedTemporaryFile(
                mode="w",
                suffix=".py",
                delete=False,
            ) as f:
                f.write(code)
                temp_path = f.name

            if _RUFF_EXECUTABLE is None:
                raise JSONRPCError(
                    code=JSONRPCErrorCode.INTERNAL_ERROR,
                    message="ruff is not installed or not found in PATH",
                )

            result = subprocess.run(
                [_RUFF_EXECUTABLE, "format", temp_path],
                capture_output=True,
                text=True,
                timeout=10,
            )

            with open(temp_path) as f:
                formatted_code = f.read()

            import os

            os.unlink(temp_path)

            if result.returncode != 0 and "error" in result.stderr.lower():
                logger.warning(f"Ruff format warning: {result.stderr}")

            changed = formatted_code != code

            return {
                "formatted_code": formatted_code,
                "changed": changed,
            }
        except subprocess.TimeoutExpired:
            raise JSONRPCError(
                code=JSONRPCErrorCode.INTERNAL_ERROR,
                message="Code formatting timed out",
            ) from None
        except FileNotFoundError:
            raise JSONRPCError(
                code=JSONRPCErrorCode.INTERNAL_ERROR,
                message="Ruff formatter not found. Install with: pip install ruff",
            ) from None
        except Exception as e:
            logger.error(f"Format error: {e}")
            raise JSONRPCError(
                code=JSONRPCErrorCode.INTERNAL_ERROR,
                message=f"Format error: {str(e)}",
            ) from None

    def _handle_validate_code(self, params: dict) -> dict[str, Any]:
        """Lint Python source code using ruff and return errors and warnings.

        Request:
            {
                "code": str,  # Python source to validate
            }

        Response:
            {
                "errors": list[
                    {
                        "line": int,
                        "column": int,
                        "endLine": int,
                        "endColumn": int,
                        "message": str,
                        "code": str,    # ruff rule code e.g. "E501"
                        "severity": str,
                    }
                ],
                "warnings": list,  # same shape as errors, severity != "error"
            }

        Errors:
            - JSONRPCError(INTERNAL_ERROR): ruff timed out (>10 s) or is not installed.

        Example::
            request = {"code": "import os\nimport sys\n"}
            response = {"errors": [], "warnings": [{"line": 1, "column": 1, "message": "...", "code": "F401", "severity": "warning"}]}
        """
        import logging
        import subprocess
        import tempfile

        logger = logging.getLogger("rpaforge.bridge")
        code = params.get("code", "")

        if not code:
            return {"errors": [], "warnings": []}

        from rpaforge.core.validation import ValidationError as ValidationErr
        from rpaforge.core.validation import validate_expression

        try:
            validate_expression(code, limit=51200)
        except ValidationErr as e:
            raise JSONRPCError(
                code=JSONRPCErrorCode.INVALID_PARAMS,
                message=str(e),
            ) from None

        try:
            with tempfile.NamedTemporaryFile(
                mode="w",
                suffix=".py",
                delete=False,
            ) as f:
                f.write(code)
                temp_path = f.name

            if _RUFF_EXECUTABLE is None:
                raise JSONRPCError(
                    code=JSONRPCErrorCode.INTERNAL_ERROR,
                    message="ruff is not installed or not found in PATH",
                )

            result = subprocess.run(
                [_RUFF_EXECUTABLE, "check", temp_path, "--output-format=json"],
                capture_output=True,
                text=True,
                timeout=10,
            )

            import os

            os.unlink(temp_path)

            errors = []
            warnings = []

            if result.stdout.strip():
                try:
                    diagnostics = json.loads(result.stdout)
                    for diag in diagnostics:
                        location = diag.get("location", {})
                        end_location = diag.get("end_location", {})
                        severity = diag.get("severity", "error")
                        code_info = diag.get("code", {})
                        message = diag.get("message", "")

                        if isinstance(code_info, dict):
                            code_str = f"{code_info.get('prefix', '')}{code_info.get('value', '')}"
                        elif isinstance(code_info, str):
                            code_str = code_info
                        else:
                            code_str = ""

                        error_entry = {
                            "line": location.get("line", 1),
                            "column": location.get("column", 0),
                            "endLine": end_location.get(
                                "line", location.get("line", 1)
                            ),
                            "endColumn": end_location.get("column", 0),
                            "message": message,
                            "code": code_str,
                            "severity": severity.lower(),
                        }

                        if severity.lower() == "error":
                            errors.append(error_entry)
                        else:
                            warnings.append(error_entry)
                except json.JSONDecodeError:
                    logger.warning(
                        f"Failed to parse ruff check output: {result.stdout}"
                    )

            return {"errors": errors, "warnings": warnings}
        except subprocess.TimeoutExpired:
            raise JSONRPCError(
                code=JSONRPCErrorCode.INTERNAL_ERROR,
                message="Code validation timed out",
            ) from None
        except FileNotFoundError:
            raise JSONRPCError(
                code=JSONRPCErrorCode.INTERNAL_ERROR,
                message="Ruff not found. Install with: pip install ruff",
            ) from None
        except Exception as e:
            logger.error(f"Validation error: {e}")
            raise JSONRPCError(
                code=JSONRPCErrorCode.INTERNAL_ERROR,
                message=f"Validation error: {str(e)}",
            ) from None

    def _handle_generate_code(self, params: dict) -> dict[str, Any]:
        """Generate Python source code from a visual diagram.

        Request:
            {
                "diagram": dict,       # main diagram with nodes/edges/metadata
                "subDiagrams": dict,   # optional map of sub-diagram ID → diagram
            }

        Response:
            {
                "code": str,           # generated Python source for the main diagram
                "sourcemap": dict,     # maps source lines to node IDs
                "language": str,       # always "python"
                "files": dict,         # only present when subDiagrams supplied; filename → source
            }

        Errors:
            - None raised directly; exceptions from DiagramConverter propagate as-is.

        Example::
            request = {"diagram": {"nodes": [...], "edges": [...]}}
            response = {"code": "from rpaforge...", "sourcemap": {}, "language": "python"}
        """
        from rpaforge.codegen.python_generator import PythonCodeGenerator

        diagram = params.get("diagram", {})
        sub_diagrams = params.get("subDiagrams", {})

        generator = PythonCodeGenerator()

        if sub_diagrams:
            files = generator.generate_project(diagram, sub_diagrams)
            main_code = files.get("main.py", "")
            _, sourcemap = generator.generate_with_sourcemap(diagram)
            return {
                "code": main_code,
                "files": files,
                "sourcemap": sourcemap,
                "language": "python",
            }

        code, sourcemap = generator.generate_with_sourcemap(diagram)

        return {
            "code": code,
            "sourcemap": sourcemap,
            "language": "python",
        }

    async def _handle_shutdown(self, params: dict) -> dict[str, Any]:
        """Initiate a graceful bridge shutdown, cancelling any running process.

        Request:
            {
                "reason": str,  # optional; default "user_request"
            }

        Response:
            {
                "status": str,   # always "shutting_down"
                "reason": str,
            }

        Errors:
            - None raised.

        Example::
            request = {"reason": "user_request"}
            response = {"status": "shutting_down", "reason": "user_request"}
        """
        reason = params.get("reason", "user_request")

        if self._process_task and not self._process_task.done():
            self._cancel_requested = True
            if self._runner:
                self._runner.cancel()

        self._emit(
            LogEvent(
                level="info",
                message=f"Bridge shutdown initiated: {reason}",
            ).to_dict()
        )

        return {"status": "shutting_down", "reason": reason}

    def _get_webui_instance(self):
        webui = self._engine.executor._libraries.get("WebUI")
        if webui is None:
            raise JSONRPCError(
                code=-32001, message="WebUI not initialized. Open a browser first."
            )
        return webui

    async def _handle_inspect_page(self, params: dict) -> dict:
        webui = self._get_webui_instance()
        include_frames = params.get("includeFrames", True)
        return webui.inspect_page(include_frames=include_frames)

    async def _handle_highlight_element(self, params: dict) -> dict:
        webui = self._get_webui_instance()
        webui.highlight_element(
            selector=params["selector"],
            color=params.get("color", "yellow"),
            duration=params.get("duration", 3000),
        )
        return {"success": True}

    async def _handle_test_selector(self, params: dict) -> dict:
        webui = self._get_webui_instance()
        return webui.test_selector(selector=params["selector"])

    async def _handle_get_xpath_from_point(self, params: dict) -> dict:
        webui = self._get_webui_instance()
        return webui.get_xpath_from_point(x=params["x"], y=params["y"])

    async def _handle_capture_screenshot(self, params: dict) -> dict:
        import base64

        webui = self._get_webui_instance()
        screenshot_bytes = webui._page.screenshot(
            full_page=params.get("fullPage", False)
        )
        return {"data": base64.b64encode(screenshot_bytes).decode(), "format": "png"}

    def _get_desktopui_instance(self):
        desktopui = self._engine.executor._libraries.get("DesktopUI")
        if desktopui is None:
            raise JSONRPCError(
                code=-32001,
                message="DesktopUI not initialized. Open an application first.",
            )
        return desktopui

    async def _handle_inspect_desktop(self, params: dict) -> dict:
        window_handle = params.get("windowId")
        if window_handle is not None:
            return self._inspect_by_handle(int(window_handle))
        desktopui = self._get_desktopui_instance()
        try:
            return desktopui.inspect_window()
        except ValueError as e:
            raise JSONRPCError(
                code=JSONRPCErrorCode.INVALID_PARAMS, message=str(e)
            ) from e

    def _inspect_by_handle(self, handle: int) -> dict:
        try:
            from pywinauto import Application

            from rpaforge_libraries.DesktopUI import DesktopUI

            app = Application(backend="uia").connect(handle=handle)
            win = app.window(handle=handle)
            temp_ui = DesktopUI()
            temp_ui._apps["__tmp__"] = app
            temp_ui._windows["__tmp__"] = win
            temp_ui._current_window_id = "__tmp__"
            return temp_ui.inspect_window()
        except ImportError as e:
            raise JSONRPCError(
                code=-32001,
                message="pywinauto is required. Install rpaforge-libraries[desktop]",
            ) from e
        except Exception as e:
            raise JSONRPCError(
                code=JSONRPCErrorCode.INVALID_PARAMS, message=str(e)
            ) from e

    async def _handle_list_windows(self, _params: dict) -> dict:
        try:
            from pywinauto import Desktop

            windows = []
            for win in Desktop(backend="uia").windows():
                try:
                    title = win.window_text()
                    if not title:
                        continue
                    rect = win.rectangle()
                    if (rect.right - rect.left) <= 0 or (rect.bottom - rect.top) <= 0:
                        continue
                    windows.append(
                        {
                            "title": title,
                            "pid": win.process_id(),
                            "handle": win.handle,
                        }
                    )
                except Exception:
                    continue
            return {"windows": windows}
        except ImportError as e:
            raise JSONRPCError(
                code=-32001,
                message="pywinauto is required. Install rpaforge-libraries[desktop]",
            ) from e

    async def _handle_test_desktop_selector(self, params: dict) -> dict:
        desktopui = self._get_desktopui_instance()
        return desktopui.test_desktop_selector(selector=params.get("selector", ""))

    async def _handle_highlight_desktop_element(self, params: dict) -> dict:
        desktopui = self._get_desktopui_instance()
        desktopui.highlight_desktop_element(selector=params.get("selector", ""))
        return {"success": True}

    def _run_in_executor(self, func, *args):
        """Run a blocking function in a thread pool to avoid greenlet conflicts."""
        import concurrent.futures

        with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
            future = pool.submit(func, *args)
            return future.result()

    async def _handle_capture_web_element(self, params: dict) -> dict:
        import logging

        logger = logging.getLogger("rpaforge.bridge")
        logger.debug("Capturing web element...")
        from rpaforge_libraries.Spy import get_element_at_point_web

        x = params.get("x", 0)
        y = params.get("y", 0)
        result = self._run_in_executor(get_element_at_point_web, x, y)
        logger.debug(f"Web element capture result: {result}")
        if result is None:
            raise JSONRPCError(
                code=-32002,
                message="No web element found at position. Make sure Chrome has remote debugging enabled (--remote-debugging-port=9222)",
            )
        return result

    async def _handle_capture_desktop_element(self, params: dict) -> dict:
        import logging

        logger = logging.getLogger("rpaforge.bridge")
        logger.debug("Capturing desktop element...")
        from rpaforge_libraries.Spy import get_element_at_point_desktop

        x = params.get("x", 0)
        y = params.get("y", 0)
        result = self._run_in_executor(get_element_at_point_desktop, x, y)
        logger.debug(f"Desktop element capture result: {result}")
        if result is None:
            raise JSONRPCError(
                code=-32003, message="No desktop element found at position"
            )
        return result

    async def _handle_get_mouse_position(self, _params: dict) -> dict:
        from rpaforge_libraries.Spy import get_mouse_position

        x, y = get_mouse_position()
        return {"x": x, "y": y}
