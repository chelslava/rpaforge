"""
RPAForge Process Executor.

Native Python execution engine without Robot Framework.
"""

from __future__ import annotations

import logging
import re
import threading
import traceback
from collections.abc import Callable
from dataclasses import dataclass
from time import perf_counter
from typing import TYPE_CHECKING, Any

from rpaforge.core.activity import (
    LIBRARY_REGISTRY,
)
from rpaforge.core.execution import (
    ActivityCall,
    ExecutionResult,
    ExecutionStatus,
    Process,
    Task,
)

if TYPE_CHECKING:
    pass

logger = logging.getLogger("rpaforge")


class ExecutionError(Exception):
    """Raised when activity execution fails."""

    def __init__(self, message: str, activity: ActivityCall | None = None):
        super().__init__(message)
        self.activity = activity


class StopExecution(Exception):
    """Raised to stop execution gracefully."""

    pass


@dataclass
class ExecutionContext:
    """Runtime execution context."""

    variables: dict[str, Any]
    process: Process | None = None
    task: Task | None = None
    current_activity: ActivityCall | None = None
    call_stack: list[ActivityCall] = None

    def __post_init__(self):
        if self.call_stack is None:
            self.call_stack = []

    def get_variable(self, name: str, default: Any = None) -> Any:
        var_name = name.strip("${}")
        return self.variables.get(var_name, default)

    def set_variable(self, name: str, value: Any) -> None:
        var_name = name.strip("${}")
        self.variables[var_name] = value

    def resolve_value(self, value: Any) -> Any:
        if isinstance(value, str) and "${" in value:
            return self._resolve_variables(value)
        if isinstance(value, (list, tuple)):
            return [self.resolve_value(v) for v in value]
        if isinstance(value, dict):
            return {k: self.resolve_value(v) for k, v in value.items()}
        return value

    def _resolve_variables(self, text: str) -> Any:
        pattern = r"\$\{([^}]+)\}"

        def replace_var(match: re.Match) -> str:
            var_name = match.group(1)
            value = self.get_variable(var_name, match.group(0))
            return str(value) if not isinstance(value, str) else value

        result = re.sub(pattern, replace_var, text)

        if re.fullmatch(pattern, text):
            var_name = re.match(pattern, text).group(1)
            return self.get_variable(var_name, text)

        return result


class ProcessExecutor:
    """Native Python executor for RPAForge processes."""

    def __init__(self):
        self._libraries: dict[str, Any] = {}
        self._listeners: list[Callable] = []
        self._context: ExecutionContext | None = None
        self._lock = threading.Lock()

    def register_library(self, name: str, instance: Any) -> None:
        self._libraries[name] = instance
        logger.debug(f"Registered library: {name}")

    def add_listener(self, callback: Callable) -> None:
        self._listeners.append(callback)

    def remove_listener(self, callback: Callable) -> None:
        if callback in self._listeners:
            self._listeners.remove(callback)

    def run(self, process: Process) -> ExecutionResult:
        start_time = perf_counter()
        self._context = ExecutionContext(
            variables=dict(process.variables),
            process=process,
        )

        self._notify("start_process", process.name)

        task_results = []

        try:
            for task in process.tasks:
                result = self._run_task(task)
                task_results.append(result)

                if result["status"] == ExecutionStatus.FAIL:
                    return ExecutionResult(
                        status=ExecutionStatus.FAIL,
                        message=f"Task '{task.name}' failed: {result.get('error', '')}",
                        variables=self._context.variables,
                        elapsed_ms=int((perf_counter() - start_time) * 1000),
                        task_results=task_results,
                    )

            elapsed = int((perf_counter() - start_time) * 1000)
            return ExecutionResult(
                status=ExecutionStatus.PASS,
                variables=self._context.variables,
                elapsed_ms=elapsed,
                task_results=task_results,
            )

        except StopExecution:
            return ExecutionResult(
                status=ExecutionStatus.FAIL,
                message="Execution stopped by user",
                variables=self._context.variables,
                elapsed_ms=int((perf_counter() - start_time) * 1000),
                task_results=task_results,
            )

        except Exception as e:
            logger.error(f"Process execution failed: {e}")
            return ExecutionResult(
                status=ExecutionStatus.FAIL,
                message=str(e),
                variables=self._context.variables,
                elapsed_ms=int((perf_counter() - start_time) * 1000),
                task_results=task_results,
            )

        finally:
            self._notify("end_process", process.name)
            self._context = None

    def _run_task(self, task: Task) -> dict[str, Any]:
        start_time = perf_counter()
        self._context.task = task
        self._notify("start_task", task.name)

        result = {
            "name": task.name,
            "status": ExecutionStatus.PASS,
            "activities": [],
        }

        try:
            if task.setup:
                self._run_activity(task.setup)

            for activity in task.activities:
                act_result = self._run_activity(activity)
                result["activities"].append(act_result)

                if act_result["status"] == ExecutionStatus.FAIL:
                    result["status"] = ExecutionStatus.FAIL
                    result["error"] = act_result.get("error")
                    break

        except StopExecution:
            result["status"] = ExecutionStatus.FAIL
            result["error"] = "Execution stopped"

        except Exception as e:
            result["status"] = ExecutionStatus.FAIL
            result["error"] = str(e)
            logger.error(f"Task '{task.name}' failed: {e}")

        finally:
            if task.teardown:
                try:
                    self._run_activity(task.teardown)
                except Exception as e:
                    logger.warning(f"Teardown failed: {e}")

            result["elapsed_ms"] = int((perf_counter() - start_time) * 1000)
            self._notify("end_task", task.name)
            self._context.task = None

        return result

    def _run_activity(self, activity: ActivityCall) -> dict[str, Any]:
        start_time = perf_counter()
        self._context.current_activity = activity
        self._context.call_stack.append(activity)

        self._notify("start_activity", activity)

        result = {
            "activity": activity.activity,
            "library": activity.library,
            "status": ExecutionStatus.PASS,
        }

        try:
            resolved_args = [self._context.resolve_value(arg) for arg in activity.args]
            resolved_kwargs = {
                k: self._context.resolve_value(v) for k, v in activity.kwargs.items()
            }

            output = self._execute_activity(
                activity.library,
                activity.activity,
                *resolved_args,
                **resolved_kwargs,
            )

            result["output"] = output
            result["elapsed_ms"] = int((perf_counter() - start_time) * 1000)

        except StopExecution:
            raise

        except Exception as e:
            result["status"] = ExecutionStatus.FAIL
            result["error"] = str(e)
            result["elapsed_ms"] = int((perf_counter() - start_time) * 1000)
            logger.error(
                f"Activity '{activity.library}.{activity.activity}' failed: {e}\n"
                f"{traceback.format_exc()}"
            )

        finally:
            self._context.call_stack.pop()
            self._context.current_activity = None
            self._notify("end_activity", activity, result)

        return result

    def _execute_activity(
        self,
        library: str,
        activity_name: str,
        *args: Any,
        **kwargs: Any,
    ) -> Any:
        lib_instance = self._libraries.get(library)

        if lib_instance is None:
            cls, _ = LIBRARY_REGISTRY.get(library, (None, None))
            if cls is not None:
                lib_instance = cls()
                self._libraries[library] = lib_instance
            else:
                raise ExecutionError(f"Library '{library}' not found")

        method = getattr(lib_instance, activity_name, None)

        if method is None:
            method = getattr(lib_instance, activity_name.replace(" ", "_"), None)

        if method is None or not callable(method):
            raise ExecutionError(
                f"Activity '{activity_name}' not found in library '{library}'"
            )

        return method(*args, **kwargs)

    def _notify(self, event_type: str, *args: Any) -> None:
        for listener in self._listeners:
            try:
                listener(event_type, *args)
            except Exception as e:
                logger.warning(f"Listener error: {e}")

    @property
    def context(self) -> ExecutionContext | None:
        return self._context

    def get_variables(self) -> dict[str, Any]:
        if self._context:
            return dict(self._context.variables)
        return {}
