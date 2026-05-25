"""
RPAForge Process Executor.

Native Python execution engine without Robot Framework.
"""

from __future__ import annotations

import concurrent.futures
import datetime
import logging
import re
import threading
import time
import traceback
from collections.abc import Callable
from dataclasses import dataclass, field
from enum import Enum
from time import perf_counter
from typing import TYPE_CHECKING, Any

from rpaforge.core.activity import (
    LIBRARY_REGISTRY,
)

if TYPE_CHECKING:
    from rpaforge.core.execution import (
        ActivityCall,
        ExecutionContext,
        ExecutionResult,
        ParallelGroup,
        Process,
        Task,
    )
    from rpaforge.core.interfaces import (
        ExpressionEvaluator,
        LibraryProvider,
        TimeoutHandler,
    )

from rpaforge.core.execution import (
    ActivityCall,
    ExecutionContext,
    ExecutionResult,
    ExecutionStatus,
    ParallelGroup,
    Process,
    Task,
)
from rpaforge.core.interfaces import (
    ExpressionEvaluator,
    LibraryProvider,
    TimeoutHandler,
)
from rpaforge.core.safe_evaluator import safe_eval

try:
    from rpaforge.core.subprocess_executor import SubprocessExecutor

    _USE_SUBPROCESS = True
except ImportError:
    _USE_SUBPROCESS = False
    SubprocessExecutor = None

logger = logging.getLogger("rpaforge")

_LIBRARY_NAME_PATTERN = re.compile(
    r"^[a-zA-Z_][a-zA-Z0-9_]*(\.[a-zA-Z_][a-zA-Z0-9_]*)*$"
)
_ACTIVITY_NAME_PATTERN = re.compile(r"^[a-zA-Z_][a-zA-Z0-9 _]*$")


def _validate_library_name(library: str) -> None:
    if not _LIBRARY_NAME_PATTERN.match(library):
        raise ExecutionError(f"Invalid library name: {library}")


def _validate_activity_name(activity: str) -> None:
    if not _ACTIVITY_NAME_PATTERN.match(activity):
        raise ExecutionError(f"Invalid activity name: {activity}")


class DefaultLibraryProvider:
    """Default implementation using the global LIBRARY_REGISTRY."""

    def get_library(self, name: str) -> type | None:
        entry = LIBRARY_REGISTRY.get(name)
        if entry is None:
            return None
        cls, _ = entry
        return cls

    def instantiate_library(self, cls: type) -> Any:
        return cls()


class ThreadingTimeoutHandler:
    """Timeout execution using SubprocessExecutor or threading fallback."""

    def execute_with_timeout(
        self,
        func: Callable[..., Any],
        args: tuple[Any, ...],
        timeout_ms: int,
    ) -> Any:
        result_container: list[Any] = []
        exception_container: list[Exception] = []
        _thread_lock = threading.Lock()

        def run_in_thread() -> None:
            try:
                output = func(*args)
                with _thread_lock:
                    result_container.append(output)
            except Exception as e:
                with _thread_lock:
                    exception_container.append(e)

        thread = threading.Thread(target=run_in_thread, daemon=True)
        thread.start()
        thread.join(timeout=timeout_ms / 1000.0)

        with _thread_lock:
            timed_out = thread.is_alive()
            has_result = bool(result_container)
            res = result_container[0] if has_result else None

        if timed_out:
            # Python threads cannot be forcibly stopped; the thread continues
            # running as a daemon until the process exits.  Use SubprocessExecutor
            # (enabled automatically when psutil is installed) for true isolation
            # and guaranteed enforcement of timeouts.
            logger.warning(
                "ThreadingTimeoutHandler: thread still alive after %dms — "
                "resources held by the activity (windows, sockets, file handles) "
                "will NOT be released until process exit.  Install psutil to "
                "enable SubprocessExecutor, which enforces hard timeouts.",
                timeout_ms,
            )
            raise TimeoutError(timeout_ms)
        if exception_container:
            raise exception_container[0]
        return res


class SafeExpressionEvaluator:
    """Expression evaluator backed by safe_eval."""

    def evaluate(self, expression: str, variables: dict[str, Any]) -> Any:
        return safe_eval(expression, variables)


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


class CircuitState(Enum):
    """Circuit breaker states for activity reliability."""

    CLOSED = "closed"  # Normal operation, attempts allowed
    OPEN = "open"
    HALF_OPEN = "half_open"


@dataclass
class CircuitBreakerState:
    """State tracking for circuit breaker pattern."""

    failures: int = 0
    last_failure_time: float = 0.0
    state: CircuitState = CircuitState.CLOSED
    state_changed_at: float = 0.0


class ProcessExecutor:
    """Native Python executor for RPAForge processes."""

    def __init__(
        self,
        library_provider: LibraryProvider | None = None,
        timeout_handler: TimeoutHandler | None = None,
        expression_evaluator: ExpressionEvaluator | None = None,
    ) -> None:
        self._library_provider = library_provider or DefaultLibraryProvider()
        self._timeout_handler = timeout_handler or ThreadingTimeoutHandler()
        self._evaluator = expression_evaluator or SafeExpressionEvaluator()
        self._libraries: dict[str, Any] = {}
        self._listeners: list[Callable] = []
        self._context: ExecutionContext | None = None
        self._lock = threading.Lock()
        self._subprocess_executor: SubprocessExecutor | None = (
            SubprocessExecutor()
            if _USE_SUBPROCESS and SubprocessExecutor is not None
            else None
        )
        self._circuit_breakers: dict[str, CircuitBreakerState] = {}

    def register_library(self, name: str, instance: Any) -> None:
        self._libraries[name] = instance
        logger.debug(f"Registered library: {name}")

    def add_listener(self, callback: Callable) -> None:
        self._listeners.append(callback)

    def remove_listener(self, callback: Callable) -> None:
        if callback in self._listeners:
            self._listeners.remove(callback)

    def cancel(self) -> None:
        pass

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

            for item in task.activities:
                if isinstance(item, ParallelGroup):
                    par_result = self._run_parallel_group(item)
                    result["activities"].append(par_result)
                    if par_result["status"] == ExecutionStatus.FAIL:
                        result["status"] = ExecutionStatus.FAIL
                        result["error"] = par_result.get("error")
                        break
                else:
                    act_result = self._run_activity(item)
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

    def _run_parallel_group(self, group: ParallelGroup) -> dict[str, Any]:
        """Execute all branches of a ParallelGroup concurrently.

        Each branch runs in its own thread.  Results are collected after all
        threads finish (or after the first failure when fail_fast=True).
        """
        start_time = perf_counter()
        branch_results: list[list[dict[str, Any]]] = [[] for _ in group.branches]
        branch_errors: list[Exception | None] = [None] * len(group.branches)

        def run_branch(index: int, activities: list[ActivityCall]) -> None:
            for act in activities:
                try:
                    res = self._run_activity(act)
                    branch_results[index].append(res)
                    if res["status"] == ExecutionStatus.FAIL:
                        branch_errors[index] = Exception(
                            res.get("error", "branch failed")
                        )
                        return
                except Exception as exc:
                    branch_errors[index] = exc
                    return

        with concurrent.futures.ThreadPoolExecutor(
            max_workers=len(group.branches), thread_name_prefix="parallel_branch"
        ) as pool:
            futures = {
                pool.submit(run_branch, i, branch): i
                for i, branch in enumerate(group.branches)
            }
            concurrent.futures.wait(futures)

        failed_branches = [i for i, err in enumerate(branch_errors) if err is not None]
        status = ExecutionStatus.FAIL if failed_branches else ExecutionStatus.PASS
        error_msg = (
            "; ".join(f"branch {i}: {branch_errors[i]}" for i in failed_branches)
            if failed_branches
            else None
        )

        if status == ExecutionStatus.FAIL:
            logger.error(f"ParallelGroup {group.node_id!r}: {error_msg}")

        return {
            "type": "parallel",
            "node_id": group.node_id,
            "status": status,
            "error": error_msg,
            "branches": branch_results,
            "elapsed_ms": int((perf_counter() - start_time) * 1000),
        }

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

            allowed, circuit_status = self._check_circuit_breaker(activity)
            if not allowed:
                raise ExecutionError(
                    f"Circuit breaker {circuit_status} for {activity.library}.{activity.activity}"
                )

            if circuit_status:
                logger.info(
                    f"Circuit breaker {circuit_status} for {activity.library}.{activity.activity}"
                )

            while True:
                try:
                    output = self._execute_activity(
                        activity.library,
                        activity.activity,
                        *resolved_args,
                        timeout_ms=activity.timeout_ms,
                        **resolved_kwargs,
                    )

                    self._update_circuit_breaker(activity, success=True)

                    result["output"] = output
                    result["elapsed_ms"] = int((perf_counter() - start_time) * 1000)
                    if retry_attempts > 0:
                        result["retry_attempts"] = retry_attempts

                    if activity.output_variable and output is not None:
                        self._context.set_variable(activity.output_variable, output)

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
                        time.sleep(max(delay_ms / 1000.0, 0.001))
                    else:
                        self._update_circuit_breaker(activity, success=False)
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
        _validate_library_name(library)
        _validate_activity_name(activity_name)

        lib_instance = self._libraries.get(library)

        if lib_instance is None:
            cls = self._library_provider.get_library(library)
            if cls is not None:
                lib_instance = self._library_provider.instantiate_library(cls)
                self._libraries[library] = lib_instance
            else:
                raise ExecutionError(f"Library '{library}' not found")

        method = getattr(lib_instance, activity_name, None)

        if method is None:
            # Convert "Log Message" → "log_message"
            snake_case_name = activity_name.lower().replace(" ", "_")
            method = getattr(lib_instance, snake_case_name, None)

        if method is None or not callable(method):
            raise ExecutionError(
                f"Activity '{activity_name}' not found in library '{library}'"
            )

        if timeout_ms <= 0:
            return method(*args, **kwargs)

        # Use subprocess executor if available for safe timeout handling
        if self._subprocess_executor is not None:
            lib_path = f"rpaforge_libraries.{library}"
            return self._subprocess_executor.execute_with_timeout(
                lib_path,
                activity_name,
                *args,
                timeout_ms=timeout_ms,
                **kwargs,
            )

        def _call(*a: Any) -> Any:
            return method(*a[: len(args)], **kwargs)

        return self._timeout_handler.execute_with_timeout(_call, args, timeout_ms)

    def _notify(self, event_type: str, *args: Any) -> None:
        for listener in self._listeners:
            try:
                listener(event_type, *args)
            except Exception as e:
                logger.warning(f"Listener error: {e}")

    @property
    def context(self) -> ExecutionContext | None:
        return self._context

    def close(self) -> None:
        """Close the executor and release subprocess pool resources."""
        if self._subprocess_executor is not None:
            self._subprocess_executor.close()
            self._subprocess_executor = None

    def __enter__(self) -> ProcessExecutor:
        return self

    def __exit__(self, exc_type: Any, exc_val: Any, exc_tb: Any) -> None:
        self.close()

    def get_variables(self) -> dict[str, Any]:
        if self._context:
            return dict(self._context.variables)
        return {}

    def _get_circuit_key(self, activity: ActivityCall) -> str:
        return f"{activity.library}.{activity.activity}"

    def _check_circuit_breaker(self, activity: ActivityCall) -> tuple[bool, str | None]:
        circuit_key = self._get_circuit_key(activity)
        if circuit_key not in self._circuit_breakers:
            return True, None

        state = self._circuit_breakers[circuit_key]
        now = time.time()

        if state.state == CircuitState.OPEN:
            if now - state.state_changed_at >= 60.0:
                state.state = CircuitState.HALF_OPEN
                state.state_changed_at = now
                logger.info(
                    f"Circuit breaker HALF_OPEN for {circuit_key}: testing recovery"
                )
                return True, "HALF_OPEN (testing recovery)"
            return False, "OPEN (circuit tripped)"

        if state.state == CircuitState.HALF_OPEN:
            return True, "HALF_OPEN (recovery test)"

        return True, None

    def _update_circuit_breaker(self, activity: ActivityCall, success: bool) -> None:
        circuit_key = self._get_circuit_key(activity)
        if circuit_key not in self._circuit_breakers:
            self._circuit_breakers[circuit_key] = CircuitBreakerState()

        state = self._circuit_breakers[circuit_key]
        now = time.time()

        if success:
            if state.state == CircuitState.HALF_OPEN:
                state.state = CircuitState.CLOSED
                state.failures = 0
                state.state_changed_at = now
                logger.info(
                    f"Circuit breaker CLOSED for {circuit_key}: service recovered"
                )
            elif state.state == CircuitState.CLOSED:
                state.failures = 0
        else:
            state.failures += 1
            state.last_failure_time = now

            if state.state == CircuitState.HALF_OPEN:
                state.state = CircuitState.OPEN
                state.state_changed_at = now
                logger.warning(
                    f"Circuit breaker OPEN for {circuit_key}: recovery test failed"
                )
            elif state.state == CircuitState.CLOSED and state.failures >= 3:
                state.state = CircuitState.OPEN
                state.state_changed_at = now
                logger.warning(
                    f"Circuit breaker OPEN for {circuit_key}: {state.failures} consecutive failures"
                )
