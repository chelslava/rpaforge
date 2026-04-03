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
    ProcessStartedEvent,
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
        self._start_time: float = 0.0

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
        }

    def _emit(self, event_dict: dict) -> None:
        """Emit an event if callback is set."""
        if self._emit_event:
            self._emit_event(event_dict)

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

    def _handle_run_process(self, params: dict) -> dict[str, Any]:
        """Handle run process request.

        :param params: Request parameters with 'source' key.
        :returns: Process start info.
        """
        source = params.get("source")
        if not source:
            raise JSONRPCError(
                code=JSONRPCErrorCode.INVALID_PARAMS,
                message="Missing required parameter: source",
            )

        self._start_time = time.time()
        process_id = f"process-{int(self._start_time * 1000)}"

        self._emit(
            ProcessStartedEvent(
                process_id=process_id,
                name=params.get("name", "Unnamed"),
            ).to_dict()
        )

        self._emit(
            LogEvent(
                level="info",
                message=f"Starting process: {process_id}",
            ).to_dict()
        )

        try:
            result = self._engine.run_string(source)

            duration = time.time() - self._start_time
            status = "pass" if result.suite.status == "PASS" else "fail"

            self._emit(
                ProcessFinishedEvent(
                    status=status,
                    duration=duration,
                    message=result.suite.message
                    if hasattr(result.suite, "message")
                    else None,
                ).to_dict()
            )

            return {
                "processId": process_id,
                "status": status,
                "duration": duration,
            }
        except Exception as e:
            self._emit(
                ErrorEvent(
                    code=JSONRPCErrorCode.INTERNAL_ERROR,
                    message=str(e),
                ).to_dict()
            )
            raise JSONRPCError(
                code=JSONRPCErrorCode.INTERNAL_ERROR,
                message=f"Process execution failed: {e}",
            ) from None

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
        self._engine.stop()
        self._emit(
            LogEvent(
                level="info",
                message="Process stopped",
            ).to_dict()
        )
        return {"stopped": True}

    def _handle_pause_process(self, _params: dict) -> dict[str, Any]:
        """Handle pause process request.

        :returns: Pause confirmation.
        """
        if self._debugger:
            self._debugger.pause()
            self._emit(
                LogEvent(
                    level="info",
                    message="Process paused",
                ).to_dict()
            )
            return {"paused": True}
        return {"paused": False, "error": "No debugger available"}

    def _handle_resume_process(self, _params: dict) -> dict[str, Any]:
        """Handle resume process request.

        :returns: Resume confirmation.
        """
        if self._debugger:
            self._debugger.resume()
            self._emit(
                LogEvent(
                    level="info",
                    message="Process resumed",
                ).to_dict()
            )
            return {"resumed": True}
        return {"resumed": False, "error": "No debugger available"}

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

        watched = self._debugger.get_watched_variables()
        variables = []
        for name in watched:
            value = self._debugger._watcher.get_last_value(name)
            variables.append(
                {
                    "name": name,
                    "value": value,
                    "type": type(value).__name__,
                }
            )

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

        :returns: List of available activities/keywords.
        """
        activities = [
            {
                "name": "Click Element",
                "library": "DesktopUI",
                "category": "interaction",
                "description": "Click on a UI element",
                "arguments": [
                    {"name": "selector", "type": "string", "required": True},
                    {
                        "name": "clickType",
                        "type": "string",
                        "required": False,
                        "default": "single",
                    },
                ],
            },
            {
                "name": "Input Text",
                "library": "DesktopUI",
                "category": "interaction",
                "description": "Input text into an element",
                "arguments": [
                    {"name": "selector", "type": "string", "required": True},
                    {"name": "text", "type": "string", "required": True},
                ],
            },
            {
                "name": "Open Browser",
                "library": "WebUI",
                "category": "browser",
                "description": "Open a web browser",
                "arguments": [
                    {
                        "name": "browser",
                        "type": "string",
                        "required": False,
                        "default": "chromium",
                    },
                    {
                        "name": "headless",
                        "type": "boolean",
                        "required": False,
                        "default": False,
                    },
                ],
            },
            {
                "name": "Go To",
                "library": "WebUI",
                "category": "navigation",
                "description": "Navigate to a URL",
                "arguments": [
                    {"name": "url", "type": "string", "required": True},
                ],
            },
            {
                "name": "Set Variable",
                "library": "BuiltIn",
                "category": "variables",
                "description": "Set a variable value",
                "arguments": [
                    {"name": "name", "type": "string", "required": True},
                    {"name": "value", "type": "any", "required": True},
                ],
            },
            {
                "name": "Log",
                "library": "BuiltIn",
                "category": "logging",
                "description": "Log a message",
                "arguments": [
                    {"name": "message", "type": "string", "required": True},
                    {
                        "name": "level",
                        "type": "string",
                        "required": False,
                        "default": "INFO",
                    },
                ],
            },
        ]

        return {"activities": activities}
