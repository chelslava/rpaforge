"""Lifecycle handlers: run, stop, pause, resume, shutdown, ping."""

from __future__ import annotations

import asyncio
import time
import uuid
from typing import TYPE_CHECKING, Any

from rpaforge.bridge.events import (
    ErrorEvent,
    LogEvent,
    ProcessFinishedEvent,
    ProcessStartedEvent,
    ProcessStoppedEvent,
)
from rpaforge.bridge.protocol import JSONRPCError, JSONRPCErrorCode

if TYPE_CHECKING:
    pass


def setup_lifecycle_handlers(cls: type) -> None:
    """Add lifecycle methods to BridgeHandlers class."""

    def _handle_ping(self, _params: dict) -> dict[str, Any]:
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
        from rpaforge.core.activity import list_libraries

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
            self._current_run_id = str(uuid.uuid4())

            self._emit(
                ProcessStartedEvent(
                    process_id=self._process_id,
                    name=params.get("name", "Unnamed"),
                    run_id=self._current_run_id,
                ).to_dict()
            )

            self._emit(
                LogEvent(
                    level="info",
                    message=f"Starting process: {self._process_id}",
                    run_id=self._current_run_id,
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
        diagram = params.get("diagram")

        if not diagram:
            raise JSONRPCError(
                code=JSONRPCErrorCode.INVALID_PARAMS,
                message="Missing required parameter: diagram",
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
            self._current_run_id = str(uuid.uuid4())

            self._emit(
                ProcessStartedEvent(
                    process_id=self._process_id,
                    name=process.name,
                    run_id=self._current_run_id,
                ).to_dict()
            )

            self._emit(
                LogEvent(
                    level="info",
                    message=f"Starting process: {self._process_id}",
                    run_id=self._current_run_id,
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
                run_id=self._current_run_id,
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
        self._runner.clear_callbacks()
        self._setup_runner_callbacks()
        self._apply_pending_breakpoints()

        return self._engine.run(process)

    def _run_source_code(self, source: str, sourcemap: dict | None = None):
        self._runner = self._engine._runner
        self._runner.clear_callbacks()
        self._setup_runner_callbacks()
        self._current_sourcemap = sourcemap or {}
        return self._engine.run_string(source)

    def _handle_stop_process(self, _params: dict) -> dict[str, Any]:
        if not self._process_id:
            return {"status": "no_process"}

        if not self._process_task or self._process_task.done():
            return {"status": "no_running_process"}

        self._cancel_requested = True

        if self._runner:
            self._runner.cancel()

        return {"status": "cancelling", "processId": self._process_id}

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

    async def _handle_shutdown(self, params: dict) -> dict[str, Any]:
        reason = params.get("reason", "user_request")

        if self._process_task and not self._process_task.done():
            self._cancel_requested = True
            if self._runner:
                self._runner.cancel()

        self._emit(
            LogEvent(
                level="info",
                message=f"Bridge shutdown initiated: {reason}",
                run_id=self._current_run_id,
            ).to_dict()
        )

        return {"status": "shutting_down", "reason": reason}

    cls._handle_ping = _handle_ping
    cls._get_status = _get_status
    cls._handle_get_capabilities = _handle_get_capabilities
    cls._handle_run_process = _handle_run_process
    cls._handle_run_diagram = _handle_run_diagram
    cls._run_process_async = _run_process_async
    cls._emit_stopped_if_needed = _emit_stopped_if_needed
    cls._run_process_sync = _run_process_sync
    cls._run_source_code = _run_source_code
    cls._handle_stop_process = _handle_stop_process
    cls._handle_pause_process = _handle_pause_process
    cls._handle_resume_process = _handle_resume_process
    cls._handle_shutdown = _handle_shutdown
