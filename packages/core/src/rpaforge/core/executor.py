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
    get_library_class_name,
    get_library_module,
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
    TryCatchGroup,
)
from rpaforge.core.interfaces import (
    ExpressionEvaluator,
    LibraryProvider,
    TimeoutHandler,
)
from rpaforge.core.safe_evaluator import safe_eval
from rpaforge.hitl.approval import (
    ApprovalRejectedError,
    ApprovalStatus,
    ApprovalStore,
)
from rpaforge.hitl.suspend import (
    EVENT_APPROVAL_REQUESTED,
    EVENT_APPROVAL_RESOLVED,
    HITL_LIBRARY,
    decision_variables,
    request_or_adopt,
    wait_for_decision,
)

try:
    from rpaforge.core.subprocess_executor import (
        SubprocessCancelledError,
        SubprocessExecutor,
    )

    _USE_SUBPROCESS = True
except ImportError:
    _USE_SUBPROCESS = False
    SubprocessExecutor = None
    SubprocessCancelledError = RuntimeError

try:
    from rpaforge.core.library_runner import (
        LibraryRunner,
    )
    from rpaforge.core.library_runner import (
        SubprocessCancelledError as LibraryRunnerCancelledError,
    )

    _USE_LIBRARY_RUNNER = True
except ImportError:
    _USE_LIBRARY_RUNNER = False
    LibraryRunner = None
    LibraryRunnerCancelledError = RuntimeError

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


def _is_third_party_library(library_name: str) -> bool:
    if library_name in LIBRARY_REGISTRY:
        _, lib_meta = LIBRARY_REGISTRY[library_name]
        module_path = lib_meta.module or ""
        return not module_path.startswith("rpaforge_libraries.")
    return True


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
        hitl_store: ApprovalStore | None = None,
    ) -> None:
        self._library_provider = library_provider or DefaultLibraryProvider()
        self._timeout_handler = timeout_handler or ThreadingTimeoutHandler()
        self._evaluator = expression_evaluator or SafeExpressionEvaluator()
        self._libraries: dict[str, Any] = {}
        self._listeners: list[Callable] = []
        self._context: ExecutionContext | None = None
        self._lock = threading.Lock()
        self._circuit_lock = threading.Lock()
        self._subprocess_executor: SubprocessExecutor | None = None
        self._library_runner: LibraryRunner | None = None
        self._circuit_breakers: dict[str, CircuitBreakerState] = {}
        self._cancel_requested = False
        self._hitl_store: ApprovalStore | None = hitl_store
        self._hitl_outcomes: dict[int, tuple[str, str, str | None]] = {}

    @property
    def hitl_store(self) -> ApprovalStore:
        """Return the HITL approval store, creating the default one lazily."""
        if self._hitl_store is None:
            self._hitl_store = ApprovalStore()
        return self._hitl_store

    def register_library(self, name: str, instance: Any) -> None:
        self._libraries[name] = instance
        logger.debug(f"Registered library: {name}")

    def add_listener(self, callback: Callable) -> None:
        with self._lock:
            self._listeners.append(callback)

    def remove_listener(self, callback: Callable) -> None:
        with self._lock:
            if callback in self._listeners:
                self._listeners.remove(callback)

    def cancel(self) -> None:
        """Cancel the active activity and prevent subsequent activities."""
        self._cancel_requested = True
        for runner in (self._subprocess_executor, self._library_runner):
            if runner is not None:
                try:
                    runner.cancel()
                except Exception as exc:
                    logger.warning("Failed to cancel subprocess activity: %s", exc)

    def run(self, process: Process) -> ExecutionResult:
        start_time = perf_counter()
        self._cancel_requested = False
        self._hitl_outcomes.clear()
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

                if result["status"] in (
                    ExecutionStatus.FAIL,
                    ExecutionStatus.CANCELLED,
                ):
                    message = (
                        "Execution stopped by user"
                        if self._cancel_requested
                        else f"Task '{task.name}' failed: {result.get('error', '')}"
                    )
                    return ExecutionResult(
                        status=(
                            ExecutionStatus.CANCELLED
                            if self._cancel_requested
                            else ExecutionStatus.FAIL
                        ),
                        message=message,
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
                status=ExecutionStatus.CANCELLED,
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
                    if par_result["status"] in (
                        ExecutionStatus.FAIL,
                        ExecutionStatus.CANCELLED,
                    ):
                        result["status"] = par_result["status"]
                        result["error"] = par_result.get("error")
                        break
                elif isinstance(item, TryCatchGroup):
                    tc_result = self._run_try_catch_group(item)
                    result["activities"].append(tc_result)
                    if tc_result["status"] in (
                        ExecutionStatus.FAIL,
                        ExecutionStatus.CANCELLED,
                    ):
                        result["status"] = tc_result["status"]
                        result["error"] = tc_result.get("error")
                        break
                else:
                    act_result = self._run_activity(item)
                    result["activities"].append(act_result)
                    if act_result["status"] in (
                        ExecutionStatus.FAIL,
                        ExecutionStatus.CANCELLED,
                    ):
                        result["status"] = act_result["status"]
                        result["error"] = act_result.get("error")
                        break

        except StopExecution:
            result["status"] = ExecutionStatus.CANCELLED
            result["error"] = "Execution stopped"

        except Exception as e:
            result["status"] = ExecutionStatus.FAIL
            result["error"] = str(e)
            logger.error(f"Task '{task.name}' failed: {e}")

        finally:
            if task.teardown and not self._cancel_requested:
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
        fail_fast_event = threading.Event()

        def run_branch(index: int, activities: list[ActivityCall]) -> None:
            for act in activities:
                if group.fail_fast and fail_fast_event.is_set():
                    return
                try:
                    res = self._run_activity(act)
                    branch_results[index].append(res)
                    if res["status"] in (
                        ExecutionStatus.FAIL,
                        ExecutionStatus.CANCELLED,
                    ):
                        branch_errors[index] = Exception(
                            res.get("error", "branch failed")
                        )
                        if group.fail_fast:
                            fail_fast_event.set()
                        return
                except Exception as exc:
                    branch_errors[index] = exc
                    if group.fail_fast:
                        fail_fast_event.set()
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
        status = (
            ExecutionStatus.CANCELLED
            if self._cancel_requested
            else ExecutionStatus.FAIL
            if failed_branches
            else ExecutionStatus.PASS
        )
        error_msg = (
            "; ".join(f"branch {i}: {branch_errors[i]}" for i in failed_branches)
            if failed_branches
            else None
        )

        if status in (ExecutionStatus.FAIL, ExecutionStatus.CANCELLED):
            logger.error(f"ParallelGroup {group.node_id!r}: {error_msg}")

        return {
            "type": "parallel",
            "node_id": group.node_id,
            "status": status,
            "error": error_msg,
            "branches": branch_results,
            "elapsed_ms": int((perf_counter() - start_time) * 1000),
        }

    def _run_try_catch_group(self, group: TryCatchGroup) -> dict[str, Any]:
        """Execute a try/catch/finally group with proper error semantics.

        try_activities run first. If any fails, catch_activities run.
        finally_activities always run regardless of outcome.
        """
        start_time = perf_counter()
        try_failed = False
        error_msg = ""
        status = ExecutionStatus.PASS

        for item in group.try_activities:
            if isinstance(item, TryCatchGroup):
                res = self._run_try_catch_group(item)
            elif isinstance(item, ParallelGroup):
                res = self._run_parallel_group(item)
            else:
                res = self._run_activity(item)
            if res["status"] in (ExecutionStatus.FAIL, ExecutionStatus.CANCELLED):
                try_failed = True
                error_msg = res.get("error", "")
                break

        if try_failed and not self._cancel_requested:
            for item in group.catch_activities:
                if isinstance(item, TryCatchGroup):
                    res = self._run_try_catch_group(item)
                elif isinstance(item, ParallelGroup):
                    res = self._run_parallel_group(item)
                else:
                    res = self._run_activity(item)
                if res["status"] in (ExecutionStatus.FAIL, ExecutionStatus.CANCELLED):
                    status = res["status"]
                    error_msg = res.get("error", "")
                    break
        else:
            error_msg = ""

        if not self._cancel_requested:
            for item in group.finally_activities:
                if isinstance(item, TryCatchGroup):
                    self._run_try_catch_group(item)
                elif isinstance(item, ParallelGroup):
                    self._run_parallel_group(item)
                else:
                    self._run_activity(item)

        return {
            "type": "try_catch",
            "node_id": group.node_id,
            "status": status,
            "error": error_msg if status != ExecutionStatus.PASS else None,
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

                    if self._cancel_requested:
                        raise StopExecution()

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
            result["status"] = ExecutionStatus.CANCELLED
            result["error"] = "Execution stopped"
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
                f"after {retry_attempts - 1} retries"
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
                f"Activity '{activity.library}.{activity.activity}' failed after {retry_attempts - 1} retries: {e}\n"
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
        if self._cancel_requested:
            raise StopExecution()
        if library == "__bp__":
            return None  # breakpoint checkpoint — fires runner events but does nothing
        if library == HITL_LIBRARY:
            return self._execute_hitl_activity(activity_name, args, kwargs)
        _validate_library_name(library)
        _validate_activity_name(activity_name)

        lib_instance = self._libraries.get(library)

        if lib_instance is None:
            cls = self._library_provider.get_library(library)
            if cls is not None:
                lib_instance = self._library_provider.instantiate_library(cls)
                self._libraries[library] = lib_instance
            elif not _is_third_party_library(library):
                raise ExecutionError(f"Library '{library}' not found")

        method = None
        if lib_instance is not None:
            method = getattr(lib_instance, activity_name, None)
            if method is None:
                snake_case_name = activity_name.lower().replace(" ", "_")
                method = getattr(lib_instance, snake_case_name, None)

        is_third_party = _is_third_party_library(library)

        if not is_third_party and lib_instance is not None and method is not None:
            return self._execute_builtin_activity(
                method, library, activity_name, args, kwargs, timeout_ms
            )

        if is_third_party and method is not None and lib_instance is not None:
            return self._execute_builtin_activity(
                method, library, activity_name, args, kwargs, timeout_ms
            )

        if is_third_party:
            if (
                self._library_runner is None
                and _USE_LIBRARY_RUNNER
                and LibraryRunner is not None
            ):
                self._library_runner = LibraryRunner()
            if self._library_runner is None:
                raise ExecutionError(
                    f"Third-party library '{library}' requires LibraryRunner but it's not available"
                )
            lib_path = get_library_module(library) or f"rpaforge_libraries.{library}"
            class_name = get_library_class_name(library) or library
            try:
                return self._library_runner.execute_with_timeout(
                    lib_path,
                    class_name,
                    activity_name,
                    *args,
                    timeout_ms=timeout_ms,
                    **kwargs,
                )
            except LibraryRunnerCancelledError as exc:
                raise StopExecution() from exc

        raise ExecutionError(
            f"Activity '{activity_name}' not found in library '{library}'"
        )

    _HITL_ACTIVITY_NAMES = ("Request Approval", "request_approval")

    def _execute_hitl_activity(
        self,
        activity_name: str,
        args: tuple[Any, ...],
        kwargs: dict[str, Any],
    ) -> Any:
        """Execute the virtual ``__hitl__.Request Approval`` activity (issue #746).

        Suspends the process at this approval block:

        1. Persists an :class:`~rpaforge.hitl.approval.ApprovalRequest` whose
           opaque UUID token is the handle for ``rpaforge-runner approvals``.
        2. Emits the ``approval_requested`` executor event — translated by
           the runner supervisor into an NDJSON event carrying the token —
           and, via the same listener channel, causes a suspension checkpoint
           tagged with the token to be written.
        3. Blocks polling the store until the human decision arrives or the
           optional TTL expires.

        On approval, injects ``${approval_result}`` ("approved") and, when
        present, ``${approval_comment}`` into process variables and returns
        the token (captured by ``output_variable`` when set). On rejection or
        expiry, injects ``${approval_result}`` ("rejected") and raises
        :class:`ApprovalRejectedError`, deterministically routing execution to
        the fail/fallback branch per the ``Flow.throw_exception``
        error-handling pattern.
        """
        if activity_name not in self._HITL_ACTIVITY_NAMES:
            raise ExecutionError(f"Unknown HITL activity '{activity_name}'")

        current = self._context.current_activity if self._context else None

        cached = self._hitl_outcomes.get(id(current)) if current is not None else None
        if cached is not None:
            return self._replay_hitl_outcome(cached)

        question, payload, ttl_seconds = self._resolve_hitl_params(args, kwargs)
        node_id = current.node_id if current is not None else ""
        process_name = (
            self._context.process.name if self._context and self._context.process else ""
        )
        store = self.hitl_store
        request = request_or_adopt(
            store,
            question=question,
            payload=payload,
            ttl_seconds=ttl_seconds,
            process_name=process_name,
            node_id=node_id,
        )

        self._notify(EVENT_APPROVAL_REQUESTED, request.to_dict())

        decision = wait_for_decision(
            store,
            request,
            should_cancel=lambda: self._cancel_requested,
        )
        if decision is None or decision.status == ApprovalStatus.PENDING:
            if self._cancel_requested:
                raise StopExecution()
            raise ExecutionError(
                f"Approval request '{request.id}' disappeared while suspended"
            )

        if self._context is not None:
            for name, value in decision_variables(decision).items():
                self._context.set_variable(name, value)
        if current is not None:
            self._hitl_outcomes[id(current)] = (
                decision.id,
                decision.status.value,
                decision.comment,
            )

        self._notify(
            EVENT_APPROVAL_RESOLVED,
            {"token": decision.id, "decision": decision.status.value},
        )

        if decision.status == ApprovalStatus.APPROVED:
            return decision.id

        detail = "expired" if decision.status == ApprovalStatus.EXPIRED else "rejected"
        message = f"Approval request '{decision.id}' was {detail}"
        if decision.comment:
            message += f": {decision.comment}"
        raise ApprovalRejectedError(message)

    def _resolve_hitl_params(
        self,
        args: tuple[Any, ...],
        kwargs: dict[str, Any],
    ) -> tuple[str, dict[str, Any], float | None]:
        """Normalize approval parameters given positionally or by keyword."""
        question = str(kwargs.get("question", args[0] if len(args) > 0 else "") or "")
        raw_payload = kwargs.get("payload", args[1] if len(args) > 1 else None)
        payload = raw_payload if isinstance(raw_payload, dict) else {}
        raw_ttl = kwargs.get("ttl_seconds", args[2] if len(args) > 2 else None)
        ttl_seconds: float | None = None
        if raw_ttl is not None:
            try:
                ttl_seconds = float(raw_ttl)
            except (TypeError, ValueError) as e:
                raise ExecutionError(f"Invalid HITL ttl_seconds: {raw_ttl!r}") from e
        return question, payload, ttl_seconds

    def _replay_hitl_outcome(self, cached: tuple[str, str, str | None]) -> Any:
        """Replay a decided outcome when retries re-enter the same block."""
        token, status_value, comment = cached
        status = ApprovalStatus(status_value)
        if self._context is not None:
            variables: dict[str, Any] = {
                "approval_result": status.value
            }
            if comment:
                variables["approval_comment"] = comment
            for name, value in variables.items():
                self._context.set_variable(name, value)
        if status == ApprovalStatus.APPROVED:
            return token
        raise ApprovalRejectedError(
            f"Approval request '{token}' was {status.value}"
        )

    def _notify(self, event_type: str, *args: Any) -> None:
        with self._lock:
            listeners = list(self._listeners)
        for listener in listeners:
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
        if self._library_runner is not None:
            self._library_runner.close()
            self._library_runner = None

    def __enter__(self) -> ProcessExecutor:
        return self

    def __exit__(self, exc_type: Any, exc_val: Any, exc_tb: Any) -> None:
        self.close()

    def _execute_builtin_activity(
        self,
        method: Any,
        library: str,
        activity_name: str,
        args: tuple[Any, ...],
        kwargs: dict[str, Any],
        timeout_ms: int,
    ) -> Any:
        effective_timeout = timeout_ms

        if library in LIBRARY_REGISTRY:
            _, lib_meta = LIBRARY_REGISTRY[library]
            if lib_meta.is_stateful and timeout_ms > 0:
                logger.debug(
                    "Overriding timeout_ms=0 for stateful library '%s' "
                    "(state would be lost across subprocess boundary).",
                    library,
                )
                effective_timeout = 0
            else:
                effective_timeout = timeout_ms
        else:
            effective_timeout = timeout_ms

        if effective_timeout <= 0:
            return method(*args, **kwargs)

        if (
            self._subprocess_executor is None
            and _USE_SUBPROCESS
            and SubprocessExecutor is not None
        ):
            self._subprocess_executor = SubprocessExecutor()

        if self._subprocess_executor is not None:
            lib_path = get_library_module(library) or f"rpaforge_libraries.{library}"
            class_name = get_library_class_name(library) or library
            try:
                return self._subprocess_executor.execute_with_timeout(
                    lib_path,
                    class_name,
                    activity_name,
                    *args,
                    timeout_ms=effective_timeout,
                    **kwargs,
                )
            except SubprocessCancelledError as exc:
                raise StopExecution() from exc

        def _call(*a: Any) -> Any:
            return method(*a[: len(args)], **kwargs)

        return self._timeout_handler.execute_with_timeout(
            _call, args, effective_timeout
        )

    def get_variables(self) -> dict[str, Any]:
        if self._context:
            return dict(self._context.variables)
        return {}

    # Activities that always raise intentionally — circuit breaker must not track them
    _CIRCUIT_BREAKER_EXEMPT = {
        "Flow.throw_exception",
        "__hitl__.Request Approval",
        "__hitl__.request_approval",
    }

    def _get_circuit_key(self, activity: ActivityCall) -> str:
        return f"{activity.library}.{activity.activity}"

    def _check_circuit_breaker(self, activity: ActivityCall) -> tuple[bool, str | None]:
        if self._get_circuit_key(activity) in self._CIRCUIT_BREAKER_EXEMPT:
            return True, None
        with self._circuit_lock:
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
        if self._get_circuit_key(activity) in self._CIRCUIT_BREAKER_EXEMPT:
            return
        with self._circuit_lock:
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
