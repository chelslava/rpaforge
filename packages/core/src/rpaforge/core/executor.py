"""
RPAForge Process Executor.

Native Python execution engine without Robot Framework.
"""

from __future__ import annotations

import datetime
import logging
import re
import threading
import time
import traceback
from collections.abc import Callable
from dataclasses import dataclass, field
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


@dataclass
class ErrorContext:
    """Detailed error context for debugging."""

    message: str
    activity: ActivityCall | None = None
    library: str | None = None
    task_name: str | None = None
    process_name: str | None = None
    stack_trace: str = ""
    timestamp: str = ""
    node_id: str = ""
    line: int = 0
    resolved_args: tuple[Any, ...] = ()
    resolved_kwargs: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return {
            "message": self.message,
            "activity": self.activity.activity if self.activity else None,
            "library": self.library,
            "task_name": self.task_name,
            "process_name": self.process_name,
            "stack_trace": self.stack_trace,
            "timestamp": self.timestamp,
            "node_id": self.node_id,
            "line": self.line,
            "resolved_args": list(self.resolved_args) if self.resolved_args else [],
            "resolved_kwargs": self.resolved_kwargs,
        }


class ExecutionError(Exception):
    """Raised when activity execution fails."""

    def __init__(
        self,
        message: str,
        activity: ActivityCall | None = None,
        context: ErrorContext | None = None,
    ):
        super().__init__(message)
        self.activity = activity
        self.context = context

    @classmethod
    def from_exception(
        cls,
        exc: Exception,
        activity: ActivityCall | None = None,
        context: ExecutionContext | None = None,
    ) -> ExecutionError:
        """Create ExecutionError with full context from an exception."""
        import datetime

        error_context = ErrorContext(
            message=str(exc),
            activity=activity,
            library=activity.library if activity else None,
            task_name=context.task.name if context and context.task else None,
            process_name=context.process.name if context and context.process else None,
            stack_trace=traceback.format_exc(),
            timestamp=datetime.datetime.now().isoformat(),
            node_id=activity.node_id if activity else "",
            line=activity.line if activity else 0,
        )
        return cls(str(exc), activity=activity, context=error_context)


class TimeoutError(Exception):
    """Raised when activity execution times out."""

    def __init__(self, timeout_ms: int, activity: ActivityCall | None = None):
        super().__init__(f"Activity timed out after {timeout_ms}ms")
        self.timeout_ms = timeout_ms
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

        resolved_args: tuple[Any, ...] = ()
        resolved_kwargs: dict[str, Any] = {}
        retry_attempts = 0
        max_retries = activity.retry_count

        try:
            resolved_args = tuple(
                self._context.resolve_value(arg) for arg in activity.args
            )
            resolved_kwargs = {
                k: self._context.resolve_value(v) for k, v in activity.kwargs.items()
            }

            while True:
                try:
                    output = self._execute_activity(
                        activity.library,
                        activity.activity,
                        *resolved_args,
                        timeout_ms=activity.timeout_ms,
                        **resolved_kwargs,
                    )

                    result["output"] = output
                    result["elapsed_ms"] = int((perf_counter() - start_time) * 1000)
                    if retry_attempts > 0:
                        result["retry_attempts"] = retry_attempts

                    if activity.output_variable and output is not None:
                        var_name = activity.output_variable.strip("${}")
                        self._context.set_variable(var_name, output)
                        logger.debug(
                            f"Saved output to variable: {var_name} = {output!r}"
                        )

                    break

                except StopExecution:
                    raise

                except (TimeoutError, Exception) as e:
                    retry_attempts += 1

                    if retry_attempts <= max_retries:
                        delay_ms = int(
                            activity.retry_delay_ms
                            * (activity.retry_backoff ** (retry_attempts - 1))
                        )
                        logger.warning(
                            f"Activity '{activity.library}.{activity.activity}' failed "
                            f"(attempt {retry_attempts}/{max_retries}), "
                            f"retrying in {delay_ms}ms: {e}"
                        )
                        time.sleep(delay_ms / 1000.0)
                    else:
                        raise

        except StopExecution:
            raise

        except TimeoutError as e:
            result["status"] = ExecutionStatus.FAIL
            result["error"] = str(e)
            result["elapsed_ms"] = int((perf_counter() - start_time) * 1000)
            result["timed_out"] = True
            result["retry_attempts"] = retry_attempts

            error_context = ErrorContext(
                message=str(e),
                activity=activity,
                library=activity.library,
                task_name=self._context.task.name if self._context.task else None,
                process_name=(
                    self._context.process.name if self._context.process else None
                ),
                stack_trace=traceback.format_exc(),
                timestamp=datetime.datetime.now().isoformat(),
                node_id=activity.node_id,
                line=activity.line,
                resolved_args=resolved_args,
                resolved_kwargs=resolved_kwargs,
            )
            result["error_context"] = error_context.to_dict()

            logger.error(
                f"Activity '{activity.library}.{activity.activity}' timed out after {e.timeout_ms}ms "
                f"after {retry_attempts} retries"
            )

        except Exception as e:
            result["status"] = ExecutionStatus.FAIL
            result["error"] = str(e)
            result["elapsed_ms"] = int((perf_counter() - start_time) * 1000)
            result["retry_attempts"] = retry_attempts

            error_context = ErrorContext(
                message=str(e),
                activity=activity,
                library=activity.library,
                task_name=self._context.task.name if self._context.task else None,
                process_name=(
                    self._context.process.name if self._context.process else None
                ),
                stack_trace=traceback.format_exc(),
                timestamp=datetime.datetime.now().isoformat(),
                node_id=activity.node_id,
                line=activity.line,
                resolved_args=resolved_args,
                resolved_kwargs=resolved_kwargs,
            )
            result["error_context"] = error_context.to_dict()

            logger.error(
                f"Activity '{activity.library}.{activity.activity}' failed after {retry_attempts} retries: {e}\n"
                f"{traceback.format_exc()}"
            )

            if activity.continue_on_error:
                result["status"] = ExecutionStatus.PASS
                result["continued_on_error"] = True
                logger.warning(
                    f"Activity '{activity.library}.{activity.activity}' failed but continuing due to continue_on_error=True"
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
        timeout_ms: int = 0,
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

        if timeout_ms <= 0:
            return method(*args, **kwargs)

        result_container: list[Any] = []
        exception_container: list[Exception] = []

        def run_in_thread() -> None:
            try:
                result_container.append(method(*args, **kwargs))
            except Exception as e:
                exception_container.append(e)

        thread = threading.Thread(target=run_in_thread, daemon=True)
        thread.start()
        thread.join(timeout=timeout_ms / 1000.0)

        if thread.is_alive():
            raise TimeoutError(timeout_ms)

        if exception_container:
            raise exception_container[0]

        return result_container[0] if result_container else None

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
