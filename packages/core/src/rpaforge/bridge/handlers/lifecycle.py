"""Lifecycle handlers: run, stop, pause, resume, shutdown, ping."""

from __future__ import annotations

import asyncio
import time
import uuid
from typing import Any

from rpaforge.bridge.events import (
    ErrorEvent,
    LogEvent,
    ProcessFinishedEvent,
    ProcessStartedEvent,
    ProcessStoppedEvent,
)
from rpaforge.bridge.protocol import JSONRPCError, JSONRPCErrorCode


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

    def _check_stateful_libraries(self, diagram: dict) -> list[str]:
        """Check a diagram for stateful libraries and return names of those found."""
        from rpaforge.core.activity import LIBRARY_REGISTRY

        stateful_libs: set[str] = set()
        tasks = diagram.get("tasks", [])
        for task in tasks:
            activities = task.get("activities", [])
            for activity in activities:
                library_name = activity.get("library", "")
                if library_name and library_name in LIBRARY_REGISTRY:
                    _, lib_meta = LIBRARY_REGISTRY[library_name]
                    if lib_meta.is_stateful:
                        stateful_libs.add(library_name)

        return sorted(stateful_libs)

    def _handle_get_capabilities(self, _params: dict) -> dict[str, Any]:
        from rpaforge.bridge.handlers.shared import get_capabilities

        return get_capabilities()

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
        process = await asyncio.to_thread(converter.convert, diagram)

        def serialize_activity(act: Any) -> dict[str, Any]:
            from rpaforge.core.execution import (
                ActivityCall,
                ParallelGroup,
                TryCatchGroup,
            )

            if isinstance(act, ActivityCall):
                return {
                    "library": act.library,
                    "activity": act.activity,
                    "args": list(act.args),
                    "kwargs": act.kwargs,
                    "line": act.line,
                    "nodeId": act.node_id,
                    "outputVariable": act.output_variable,
                }
            elif isinstance(act, ParallelGroup):
                return {
                    "type": "parallel",
                    "nodeId": act.node_id,
                    "activities": [serialize_activity(a) for a in act.activities],
                }
            elif isinstance(act, TryCatchGroup):
                return {
                    "type": "try_catch",
                    "nodeId": act.node_id,
                    "tryActivities": [
                        serialize_activity(a) for a in act.try_activities
                    ],
                    "catchActivities": [
                        serialize_activity(a) for a in act.catch_activities
                    ],
                    "finallyActivities": [
                        serialize_activity(a) for a in act.finally_activities
                    ],
                }
            return {}

        process_data = {
            "name": process.name,
            "variables": process.variables,
            "tasks": [
                {
                    "name": task.name,
                    "activities": [serialize_activity(act) for act in task.activities],
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

    def _handle_check_stateful_libraries(self, params: dict) -> dict[str, Any]:
        diagram = params.get("diagram")

        if not diagram:
            raise JSONRPCError(
                code=JSONRPCErrorCode.INVALID_PARAMS,
                message="Missing required parameter: diagram",
            )

        libraries = self._check_stateful_libraries(diagram)
        return {"libraries": libraries}

    async def _handle_validate_diagram(self, params: dict) -> dict[str, Any]:
        diagram = params.get("diagram")

        if not diagram:
            raise JSONRPCError(
                code=JSONRPCErrorCode.INVALID_PARAMS,
                message="Missing required parameter: diagram",
            )

        self._emit(
            {
                "type": "validationProgress",
                "progress": 0,
                "status": "validating",
                "message": "Parsing diagram structure...",
            }
        )

        from rpaforge.core.validator import validate_diagram

        validation = await asyncio.to_thread(validate_diagram, diagram)

        self._emit(
            {
                "type": "validationProgress",
                "progress": 100,
                "status": "completed",
                "message": "Diagram validation completed",
            }
        )

        def serialize_error(error: Any) -> dict[str, str]:
            payload = {"message": error.message, "code": error.error_type}
            if error.node_id:
                payload["nodeId"] = error.node_id
            if error.edge_id:
                payload["edgeId"] = error.edge_id
            return payload

        return {
            "valid": validation.is_valid,
            "errors": [serialize_error(error) for error in validation.errors],
            "warnings": [{"message": warning} for warning in validation.warnings],
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
            raise JSONRPCError(
                code=JSONRPCErrorCode.INVALID_PARAMS,
                message="Source code execution is disabled. Use diagram-based process execution instead.",
            )

        from rpaforge.core.execution import (
            ActivityCall,
            ParallelGroup,
            Process,
            Task,
            TryCatchGroup,
        )

        def deserialize_activity(activity_data: dict) -> Any:
            activity_type = activity_data.get("type")

            if activity_type == "parallel":
                return ParallelGroup(
                    activities=[
                        deserialize_activity(a)
                        for a in activity_data.get("activities", [])
                    ],
                    node_id=activity_data.get("nodeId", ""),
                )
            elif activity_type == "try_catch":
                return TryCatchGroup(
                    try_activities=[
                        deserialize_activity(a)
                        for a in activity_data.get("tryActivities", [])
                    ],
                    catch_activities=[
                        deserialize_activity(a)
                        for a in activity_data.get("catchActivities", [])
                    ],
                    finally_activities=[
                        deserialize_activity(a)
                        for a in activity_data.get("finallyActivities", [])
                    ],
                    node_id=activity_data.get("nodeId", ""),
                )
            else:
                return ActivityCall(
                    library=activity_data.get("library", "DesktopUI"),
                    activity=activity_data.get("activity", ""),
                    args=tuple(activity_data.get("args", [])),
                    kwargs=activity_data.get("kwargs", {}),
                    line=activity_data.get("line", 0),
                    node_id=activity_data.get("nodeId", ""),
                    output_variable=activity_data.get("outputVariable", ""),
                )

        process = Process(name=process_data.get("name", "Process"))

        for var_name, var_value in process_data.get("variables", {}).items():
            process.set_variable(var_name, var_value)

        for task_data in process_data.get("tasks", []):
            task = Task(name=task_data.get("name", "Task"))

            for activity_data in task_data.get("activities", []):
                activity = deserialize_activity(activity_data)
                task.activities.append(activity)

            process.tasks.append(task)

        self._runner = self._engine._runner
        self._runner.clear_callbacks()
        self._setup_runner_callbacks()
        self._apply_pending_breakpoints()

        return self._engine.run(process)

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
    cls._check_stateful_libraries = _check_stateful_libraries
    cls._handle_get_capabilities = _handle_get_capabilities
    cls._handle_run_process = _handle_run_process
    cls._handle_run_diagram = _handle_run_diagram
    cls._handle_check_stateful_libraries = _handle_check_stateful_libraries
    cls._handle_validate_diagram = _handle_validate_diagram
    cls._run_process_async = _run_process_async
    cls._emit_stopped_if_needed = _emit_stopped_if_needed
    cls._run_process_sync = _run_process_sync
    cls._handle_stop_process = _handle_stop_process
    cls._handle_pause_process = _handle_pause_process
    cls._handle_resume_process = _handle_resume_process
    cls._handle_shutdown = _handle_shutdown
