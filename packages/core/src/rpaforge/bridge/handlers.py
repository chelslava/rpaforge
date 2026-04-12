"""
RPAForge Bridge Handlers.

Request handlers for JSON-RPC methods.
"""

from __future__ import annotations

import asyncio
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

if TYPE_CHECKING:
    from collections.abc import Callable

    from rpaforge import StudioEngine
    from rpaforge.debugger import Debugger


class BridgeHandlers:
    """Handlers for JSON-RPC methods.

    This class provides handlers for all supported IPC methods.
    """

    def __init__(
        self,
        engine: StudioEngine,
        debugger: Debugger | None = None,
        emit_event: Callable[[dict], None] | None = None,
    ):
        self._engine = engine
        self._debugger = debugger
        self._emit_event = emit_event
        self._process_task: asyncio.Task | None = None
        self._process_future: asyncio.Future | None = None
        self._process_id: str | None = None
        self._cancel_requested = False
        self._paused = False
        self._terminal_event_emitted = False
        self._start_time: float = 0.0
        self._ensure_activities_registered()

    def _ensure_activities_registered(self) -> None:
        """Ensure all activities are registered from libraries."""
        from rpaforge.engine.activity_registry import discover_all_libraries

        discover_all_libraries()

    def get_handlers(self) -> dict[str, Callable[[dict], Any]]:
        """Get all method handlers.

        :returns: Dictionary of method name to handler.
        """
        return {
            "ping": self._handle_ping,
            "getCapabilities": self._handle_get_capabilities,
            "runProcess": self._handle_run_process,
            "runFile": self._handle_run_file,
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
        }

    def _emit(self, event_dict: dict) -> None:
        """Emit an event if callback is set."""
        if self._emit_event:
            self._emit_event(event_dict)

    def _setup_debugger_callbacks(self) -> None:
        """Setup debugger callbacks to emit events on pause/resume."""
        if not self._debugger:
            return

        def on_pause():
            if self._cancel_requested:
                return
            self._paused = True
            self._emit(
                ProcessPausedEvent(
                    file=self._debugger._current_file,
                    line=self._debugger._current_line,
                    node_id=self._debugger.get_current_node_id(),
                    reason="breakpoint",
                ).to_dict()
            )

        def on_resume():
            if self._cancel_requested:
                return
            self._paused = False
            self._emit(ProcessResumedEvent().to_dict())

        self._debugger.on_pause(on_pause)
        self._debugger.on_resume(on_resume)

    def _handle_ping(self, _params: dict) -> dict[str, Any]:
        """Handle ping request.

        :returns: Pong response.
        """
        return {"pong": True, "timestamp": time.time()}

    def _handle_get_capabilities(self, _params: dict) -> dict[str, Any]:
        """Handle get capabilities request.

        :returns: Server capabilities.
        """
        return {
            "version": "0.1.0",
            "features": {
                "debugger": self._debugger is not None,
                "breakpoints": True,
                "stepping": True,
                "variableWatching": True,
            },
            "libraries": ["DesktopUI", "WebUI", "BuiltIn"],
        }

    async def _handle_run_process(self, params: dict) -> dict[str, Any]:
        """Handle run process request.

        :param params: Request parameters with 'source' key.
        :returns: Process start info.
        """
        import asyncio

        source = params.get("source")
        sourcemap = params.get("sourcemap")

        import json
        import sys

        sys.stderr.write(
            json.dumps(
                {
                    "log": "debug",
                    "message": f"[Handlers] runProcess called with sourcemap={sourcemap}, type={type(sourcemap)}",
                }
            )
            + "\n"
        )
        sys.stderr.flush()

        if not source:
            raise JSONRPCError(
                code=JSONRPCErrorCode.INVALID_PARAMS,
                message="Missing required parameter: source",
            )

        if self._process_task and not self._process_task.done():
            raise JSONRPCError(
                code=JSONRPCErrorCode.INVALID_PARAMS,
                message="A process is already running or stopping",
            )

        self._emit(
            LogEvent(
                level="debug",
                message=f"runProcess: source length={len(source)}, preview={source[:100]!r}",
            ).to_dict()
        )

        try:
            self._emit(
                LogEvent(
                    level="debug",
                    message=f"Source encoding check: {source.encode('utf-8')[:200]}",
                ).to_dict()
            )
        except Exception as e:
            self._emit(
                LogEvent(
                    level="error",
                    message=f"Source encoding error: {e}",
                ).to_dict()
            )

        if self._debugger and sourcemap:
            import json
            import sys

            sys.stderr.write(
                json.dumps(
                    {
                        "log": "debug",
                        "message": f"[Handlers] Setting sourcemap with {len(sourcemap)} entries: {sourcemap}",
                    }
                )
                + "\n"
            )
            sys.stderr.flush()
            self._debugger.set_sourcemap({int(k): v for k, v in sourcemap.items()})
            self._setup_debugger_callbacks()

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

        self._process_task = asyncio.create_task(self._run_process_async(source))

        return {
            "processId": self._process_id,
            "status": "running",
        }

    async def _run_process_async(self, source: str) -> None:
        """Run process asynchronously and emit events on completion.

        :param source: Robot Framework source code.
        """
        try:
            loop = asyncio.get_event_loop()
            self._process_future = loop.run_in_executor(
                None, self._run_process_sync, source
            )
            result = await self._process_future

            if self._cancel_requested:
                return

            duration = time.time() - self._start_time
            status = "pass" if result.suite.status == "PASS" else "fail"

            self._emit(
                ProcessFinishedEvent(
                    status=status,
                    duration=duration,
                    message=(
                        result.suite.message
                        if hasattr(result.suite, "message")
                        else None
                    ),
                ).to_dict()
            )
            self._terminal_event_emitted = True
        except asyncio.CancelledError:
            self._emit_stopped_if_needed("Process stopped by user")
        except Exception as e:
            from robot.errors import ExecutionFailed

            if self._cancel_requested or (
                isinstance(e, ExecutionFailed) and "stopped by user" in str(e).lower()
            ):
                self._emit_stopped_if_needed("Process stopped by user")
            else:
                self._emit(
                    ErrorEvent(
                        code=JSONRPCErrorCode.INTERNAL_ERROR,
                        message=str(e),
                    ).to_dict()
                )
        finally:
            self._process_future = None
            self._process_task = None
            self._process_id = None
            self._cancel_requested = False
            self._paused = False
            self._terminal_event_emitted = False

    def _emit_stopped_if_needed(self, message: str) -> None:
        """Emit a single stopped terminal event for the active process."""
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

    def _run_process_sync(self, source: str):
        """Run process synchronously in executor.

        :param source: Robot Framework source code.
        :returns: Execution result.
        """
        return self._engine.run_string(source)

    def _handle_run_file(self, params: dict) -> dict[str, Any]:
        """Handle run file request.

        :param params: Request parameters with 'path' key.
        :returns: Process start info.
        """
        path = params.get("path")
        if not path:
            raise JSONRPCError(
                code=JSONRPCErrorCode.INVALID_PARAMS,
                message="Missing required parameter: path",
            )

        self._start_time = time.time()
        process_id = f"process-{int(self._start_time * 1000)}"

        self._emit(
            ProcessStartedEvent(
                process_id=process_id,
                name=path,
            ).to_dict()
        )

        try:
            result = self._engine.run_file(path)

            duration = time.time() - self._start_time
            status = "pass" if result.suite.status == "PASS" else "fail"

            self._emit(
                ProcessFinishedEvent(
                    status=status,
                    duration=duration,
                ).to_dict()
            )

            return {
                "processId": process_id,
                "status": status,
                "duration": duration,
            }
        except Exception as e:
            raise JSONRPCError(
                code=JSONRPCErrorCode.INTERNAL_ERROR,
                message=f"File execution failed: {e}",
            ) from None

    def _handle_stop_process(self, _params: dict) -> dict[str, Any]:
        """Handle stop process request.

        :returns: Stop confirmation.
        """
        if not self._process_task or self._process_task.done():
            return {"stopped": False, "error": "No active process"}

        if self._cancel_requested:
            return {"stopped": True, "status": "stopping"}

        self._cancel_requested = True
        self._paused = False
        self._engine.stop()
        self._emit_stopped_if_needed("Process stop requested")

        return {"stopped": True, "status": "stopping"}

    def _handle_pause_process(self, _params: dict) -> dict[str, Any]:
        """Handle pause process request.

        :returns: Pause confirmation.
        """
        if not self._process_task or self._process_task.done():
            return {"paused": False, "error": "No active process"}

        if self._cancel_requested:
            return {"paused": False, "error": "Process is stopping"}

        if self._debugger:
            self._debugger.pause()
            self._paused = True
            self._emit(
                LogEvent(
                    level="info",
                    message="Process paused",
                ).to_dict()
            )
            return {"paused": True}
        return {
            "paused": False,
            "error": "Pause is only supported during debugger-backed execution",
        }

    def _handle_resume_process(self, _params: dict) -> dict[str, Any]:
        """Handle resume process request.

        :returns: Resume confirmation.
        """
        if not self._process_task or self._process_task.done():
            return {"resumed": False, "error": "No active process"}

        if self._cancel_requested:
            return {"resumed": False, "error": "Process is stopping"}

        if not self._paused:
            return {"resumed": False, "error": "Process is not paused"}

        if self._debugger:
            self._debugger.resume()
            self._paused = False
            self._emit(
                LogEvent(
                    level="info",
                    message="Process resumed",
                ).to_dict()
            )
            return {"resumed": True}
        return {
            "resumed": False,
            "error": "Resume is only supported during debugger-backed execution",
        }

    def _handle_set_breakpoint(self, params: dict) -> dict[str, Any]:
        """Handle set breakpoint request.

        :param params: Request parameters with 'file', 'line', optional 'condition'.
        :returns: Created breakpoint info.
        """
        if not self._debugger:
            raise JSONRPCError(
                code=JSONRPCErrorCode.INVALID_PARAMS,
                message="No debugger available",
            )

        file = params.get("file")
        line = params.get("line")
        condition = params.get("condition")
        hit_condition = params.get("hitCondition")

        if not file or line is None:
            raise JSONRPCError(
                code=JSONRPCErrorCode.INVALID_PARAMS,
                message="Missing required parameters: file, line",
            )

        bp = self._debugger.add_breakpoint(
            file=file,
            line=int(line),
            condition=condition,
            hit_condition=hit_condition,
        )

        return {
            "id": bp.id,
            "file": bp.file,
            "line": bp.line,
            "condition": bp.condition,
            "hitCondition": bp.hit_condition,
            "enabled": bp.enabled,
        }

    def _handle_remove_breakpoint(self, params: dict) -> dict[str, Any]:
        """Handle remove breakpoint request.

        :param params: Request parameters with 'id'.
        :returns: Removal confirmation.
        """
        if not self._debugger:
            raise JSONRPCError(
                code=JSONRPCErrorCode.INVALID_PARAMS,
                message="No debugger available",
            )

        breakpoint_id = params.get("id")
        if not breakpoint_id:
            raise JSONRPCError(
                code=JSONRPCErrorCode.INVALID_PARAMS,
                message="Missing required parameter: id",
            )

        removed = self._debugger.remove_breakpoint(breakpoint_id)
        return {"removed": removed}

    def _handle_toggle_breakpoint(self, params: dict) -> dict[str, Any]:
        """Handle toggle breakpoint request.

        :param params: Request parameters with 'id'.
        :returns: Toggle result.
        """
        if not self._debugger:
            raise JSONRPCError(
                code=JSONRPCErrorCode.INVALID_PARAMS,
                message="No debugger available",
            )

        breakpoint_id = params.get("id")
        if not breakpoint_id:
            raise JSONRPCError(
                code=JSONRPCErrorCode.INVALID_PARAMS,
                message="Missing required parameter: id",
            )

        enabled = self._debugger.toggle_breakpoint(breakpoint_id)
        return {"id": breakpoint_id, "enabled": enabled}

    def _handle_get_breakpoints(self, _params: dict) -> dict[str, Any]:
        """Handle get breakpoints request.

        :returns: List of breakpoints.
        """
        if not self._debugger:
            return {"breakpoints": []}

        breakpoints = self._debugger.get_breakpoints()
        return {
            "breakpoints": [
                {
                    "id": bp.id,
                    "file": bp.file,
                    "line": bp.line,
                    "condition": bp.condition,
                    "hitCondition": bp.hit_condition,
                    "enabled": bp.enabled,
                }
                for bp in breakpoints
            ]
        }

    def _handle_step_over(self, _params: dict) -> dict[str, Any]:
        """Handle step over request.

        :returns: Step result.
        """
        if self._debugger:
            self._debugger.step_over()
            return {"stepped": True, "mode": "over"}
        return {"stepped": False, "error": "No debugger available"}

    def _handle_step_into(self, _params: dict) -> dict[str, Any]:
        """Handle step into request.

        :returns: Step result.
        """
        if self._debugger:
            self._debugger.step_into()
            return {"stepped": True, "mode": "into"}
        return {"stepped": False, "error": "No debugger available"}

    def _handle_step_out(self, _params: dict) -> dict[str, Any]:
        """Handle step out request.

        :returns: Step result.
        """
        if self._debugger:
            self._debugger.step_out()
            return {"stepped": True, "mode": "out"}
        return {"stepped": False, "error": "No debugger available"}

    def _handle_continue(self, _params: dict) -> dict[str, Any]:
        """Handle continue request (resume execution).

        :returns: Continue result.
        """
        if self._debugger:
            self._debugger.resume()
            return {"continued": True}
        return {"continued": False, "error": "No debugger available"}

    def _handle_get_variables(self, _params: dict) -> dict[str, Any]:
        """Handle get variables request.

        :returns: Current variables.
        """
        if not self._debugger:
            return {"variables": []}

        values = self._debugger.get_all_watched_values()
        variables = [
            {
                "name": name,
                "value": value,
                "type": type(value).__name__,
            }
            for name, value in values.items()
        ]

        return {"variables": variables}

    def _handle_get_call_stack(self, _params: dict) -> dict[str, Any]:
        """Handle get call stack request.

        :returns: Current call stack.
        """
        if not self._debugger:
            return {"callStack": []}

        stack = self._debugger.get_call_stack()
        return {
            "callStack": [
                {
                    "keyword": frame.keyword,
                    "file": frame.file,
                    "line": frame.line,
                    "args": frame.args,
                }
                for frame in stack
            ]
        }

    def _handle_get_activities(self, _params: dict) -> dict[str, Any]:
        """Handle get activities request.

        :returns: List of available activities from SDK registry.
        """
        from rpaforge.sdk import list_activities

        sdk_activities = list_activities()
        activities = []

        for meta in sdk_activities:
            activity_dict = meta.to_dict()
            activities.append(activity_dict)

        return {"activities": activities}

    def _handle_generate_code(self, params: dict) -> dict[str, Any]:
        """Handle generate code request.

        :param params: Request parameters with 'diagram' key containing nodes/edges.
        :returns: Generated Robot Framework code.
        """
        from rpaforge.codegen import CodeGenerator

        diagram = params.get("diagram")
        if not diagram:
            raise JSONRPCError(
                code=JSONRPCErrorCode.INVALID_PARAMS,
                message="Missing required parameter: diagram",
            )

        generator = CodeGenerator()
        code, sourcemap = generator.generate_with_sourcemap(diagram)

        return {"code": code, "language": "robot", "sourcemap": sourcemap}
