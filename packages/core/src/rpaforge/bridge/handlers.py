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
from rpaforge.core.activity import list_activities, list_libraries

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
        self._ensure_activities_registered()

    def _ensure_activities_registered(self) -> None:
        from rpaforge_libraries.DesktopUI.library import DesktopUI
        from rpaforge_libraries.WebUI.library import WebUI

        self._engine.executor.register_library("DesktopUI", DesktopUI())
        self._engine.executor.register_library("WebUI", WebUI())

    def get_handlers(self) -> dict[str, Callable[[dict], Any]]:
        return {
            "ping": self._handle_ping,
            "getCapabilities": self._handle_get_capabilities,
            "runProcess": self._handle_run_process,
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

    def _handle_ping(self, _params: dict) -> dict[str, Any]:
        return {"pong": True, "timestamp": time.time()}

    def _handle_get_capabilities(self, _params: dict) -> dict[str, Any]:
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
        process_data = params.get("process") or params.get("source")
        sourcemap = params.get("sourcemap")

        if not process_data:
            raise JSONRPCError(
                code=JSONRPCErrorCode.INVALID_PARAMS,
                message="Missing required parameter: process or source",
            )

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
                )
                task.activities.append(activity)

            process.tasks.append(task)

        self._runner = self._engine._runner
        self._setup_runner_callbacks()

        return self._engine.run(process)

    def _run_source_code(self, source: str, sourcemap: dict | None = None):
        self._runner = self._engine._runner
        self._setup_runner_callbacks()
        self._current_sourcemap = sourcemap or {}
        return self._engine.run_string(source)

    def _handle_stop_process(self, _params: dict) -> dict[str, Any]:
        if not self._process_id:
            return {"status": "no_process"}

        self._cancel_requested = True

        if self._runner:
            self._runner.stop()

        return {"status": "stopping"}

    def _handle_pause_process(self, _params: dict) -> dict[str, Any]:
        if self._runner and self._runner.is_running:
            self._runner.pause()
            return {"status": "paused"}
        return {"status": "not_running"}

    def _handle_resume_process(self, _params: dict) -> dict[str, Any]:
        if self._runner and self._runner.is_paused:
            self._runner.resume()
            return {"status": "running"}
        return {"status": "not_paused"}

    def _handle_set_breakpoint(self, params: dict) -> dict[str, Any]:
        if not self._runner:
            return {"error": "no_runner"}

        node_id = params.get("nodeId", "")
        line = params.get("line", 0)
        condition = params.get("condition")
        hit_condition = params.get("hitCondition")

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
        bp_id = params.get("breakpointId", "")
        if self._runner:
            removed = self._runner.remove_breakpoint(bp_id)
            return {"removed": removed}
        return {"removed": False}

    def _handle_toggle_breakpoint(self, params: dict) -> dict[str, Any]:
        bp_id = params.get("breakpointId", "")
        if self._runner:
            enabled = self._runner.toggle_breakpoint(bp_id)
            return {"enabled": enabled}
        return {"enabled": None}

    def _handle_get_breakpoints(self, _params: dict) -> dict[str, Any]:
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
        if self._runner and self._runner.is_paused:
            self._runner.step_over()
            return {"status": "stepping"}
        return {"status": "not_paused"}

    def _handle_step_into(self, _params: dict) -> dict[str, Any]:
        if self._runner and self._runner.is_paused:
            self._runner.step_into()
            return {"status": "stepping"}
        return {"status": "not_paused"}

    def _handle_step_out(self, _params: dict) -> dict[str, Any]:
        if self._runner and self._runner.is_paused:
            self._runner.step_out()
            return {"status": "stepping"}
        return {"status": "not_paused"}

    def _handle_continue(self, _params: dict) -> dict[str, Any]:
        if self._runner and self._runner.is_paused:
            self._runner.resume()
            return {"status": "running"}
        return {"status": "not_paused"}

    def _handle_get_variables(self, _params: dict) -> dict[str, Any]:
        if self._runner:
            return {"variables": self._runner.get_variables()}
        return {"variables": {}}

    def _handle_get_call_stack(self, _params: dict) -> dict[str, Any]:
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
            }
            for act in list_activities()
        ]

        return {"activities": activities}

    def _handle_generate_code(self, params: dict) -> dict[str, Any]:
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
