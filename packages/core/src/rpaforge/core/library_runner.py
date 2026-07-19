"""
Library runner with sandboxed execution for third-party RPA libraries.

This module provides subprocess isolation for third-party library execution
with AST-based import validation to prevent arbitrary code execution.
"""

from __future__ import annotations

import contextlib
import logging
import multiprocessing
import multiprocessing.context as mp_context
import os
import sys
import threading
import time
from multiprocessing.pool import Pool as MultiprocessingPool
from typing import Any

from rpaforge.core.library_sandbox import (
    SandboxViolationError,
    validate_module_package,
)
from rpaforge.i18n import _ as _t

try:
    import psutil

    _PSUTIL_AVAILABLE = True
except ImportError:
    _PSUTIL_AVAILABLE = False
    psutil = None

logger = logging.getLogger(__name__)


class SubprocessCancelledError(Exception):
    """Raised when an in-flight third-party activity is cancelled."""


DEFAULT_POOL_KEEPALIVE_SECONDS = 60
MIN_WORKERS = 1
MAX_WORKERS_LIMIT = int(
    os.environ.get("RPAFORGE_MAX_WORKERS_LIMIT", str(multiprocessing.cpu_count() * 4))
)


class LibraryRunner:
    """
    Runner that executes third-party libraries in subprocess with sandbox validation.

    This class wraps multiprocessing.Pool with import validation for
    third-party library code to prevent arbitrary code execution through
    malicious libraries.

    The runner performs AST-based import checking before dispatching any
    third-party library code to a subprocess worker.
    """

    def __init__(
        self,
        max_workers: int | None = None,
        keepalive_seconds: int = DEFAULT_POOL_KEEPALIVE_SECONDS,
    ):
        if max_workers is None:
            max_workers = multiprocessing.cpu_count()
        elif max_workers < MIN_WORKERS:
            raise ValueError(
                _t(
                    "engine.maxworkers_must_be_at_least_got",
                    min=MIN_WORKERS,
                    got=max_workers,
                )
            )
        elif max_workers > MAX_WORKERS_LIMIT:
            raise ValueError(
                _t(
                    "engine.maxworkers_cannot_exceed_got",
                    max=MAX_WORKERS_LIMIT,
                    got=max_workers,
                )
            )
        self._max_workers = max_workers
        self._keepalive_seconds = keepalive_seconds
        self._pool: MultiprocessingPool | None = None
        self._pool_lock = threading.Lock()
        self._last_use_time: float = 0
        self._closed = False
        self._active_tasks = 0
        self._manager = multiprocessing.Manager()
        self._cancel_generation = 0
        self._active_worker_pids: dict[int, Any] = {}
        self._active_lock = threading.Lock()

    def _get_pool(self) -> MultiprocessingPool:
        import time

        with self._pool_lock:
            if self._closed:
                raise RuntimeError(_t("engine.executor_is_closed"))
            if self._pool is None:
                ctx: mp_context.BaseContext
                if sys.platform.startswith("win"):
                    ctx = multiprocessing.get_context("spawn")
                else:
                    try:
                        ctx = multiprocessing.get_context("fork")
                    except RuntimeError:
                        ctx = multiprocessing.get_context("spawn")
                self._pool = ctx.Pool(processes=self._max_workers)
            self._last_use_time = time.monotonic()
            return self._pool

    def _execute_in_subprocess(
        self,
        library_path: str,
        class_name: str,
        activity_name: str,
        args: tuple[Any, ...],
        kwargs: dict[str, Any],
        worker_pid: multiprocessing.managers.ValueProxy | None = None,
    ) -> Any:
        import importlib

        if worker_pid is not None:
            worker_pid.value = os.getpid()

        lib_module = importlib.import_module(library_path)
        lib_class = getattr(lib_module, class_name)
        obj = lib_class()

        parts = activity_name.split(".")

        for part in parts:
            if not part.isidentifier() or part.startswith("__"):
                raise ValueError(
                    f"Invalid activity name component {part!r}: must be a valid "
                    "identifier and must not start with '__'"
                )
            obj = getattr(obj, part)

        result = obj(*args, **kwargs)
        return result

    def __getstate__(self) -> dict[str, Any]:
        """Keep bound worker dispatch picklable on Windows spawn."""
        state = self.__dict__.copy()
        for key in (
            "_pool",
            "_pool_lock",
            "_manager",
            "_active_lock",
            "_active_worker_pids",
        ):
            state.pop(key, None)
        return state

    def _validate_library_source(self, library_path: str) -> None:
        """Validate library source code before executing."""
        try:
            validate_module_package(library_path)
        except SandboxViolationError:
            raise
        except Exception as e:
            raise SandboxViolationError(
                _t("sandbox.failed_to_read_module_file"),
                details=f"{library_path}: {e}",
            ) from e

    def execute_sandboxed(
        self,
        library_path: str,
        class_name: str,
        activity_name: str,
        args: tuple[Any, ...],
        kwargs: dict[str, Any],
    ) -> Any:
        """Execute a third-party library activity with import validation."""
        self._validate_library_source(library_path)

        return self._execute_in_subprocess(
            library_path, class_name, activity_name, args, kwargs
        )

    def execute_with_timeout(
        self,
        library_path: str,
        class_name: str,
        activity_name: str,
        *args: Any,
        timeout_ms: int = 0,
        **kwargs: Any,
    ) -> Any:
        """
        Execute a third-party library activity with timeout and sandbox validation.

        Args:
            library_path: Dotted module path containing the library's class
            class_name: Name of the @library-decorated class within that module
            activity_name: Name of the activity (instance method) to execute
            *args: Positional arguments for the activity
            timeout_ms: Timeout in milliseconds (0 = no timeout)
            **kwargs: Keyword arguments for the activity

        Returns:
            The result of the activity execution

        Raises:
            SandboxViolationError: If import validation fails
            TimeoutError: If the activity does not complete within timeout_ms
            Exception: Any exception raised by the activity
        """
        if self._closed:
            raise RuntimeError(_t("engine.executor_is_closed"))

        if timeout_ms <= 0:
            return self.execute_sandboxed(
                library_path, class_name, activity_name, args, kwargs
            )

        timeout_seconds = timeout_ms / 1000.0
        pool = self._get_pool()
        cancel_generation = self._cancel_generation

        worker_pid = self._manager.Value("i", 0)

        try:
            async_result = pool.apply_async(
                self._execute_in_subprocess,
                (library_path, class_name, activity_name, args, kwargs, worker_pid),
            )
        except ValueError:
            if cancel_generation != self._cancel_generation:
                raise SubprocessCancelledError from None
            raise
        with self._active_lock:
            self._active_worker_pids[threading.get_ident()] = worker_pid
        deadline = time.monotonic() + timeout_seconds
        try:
            while True:
                remaining = deadline - time.monotonic()
                if remaining <= 0:
                    raise multiprocessing.TimeoutError
                try:
                    result = async_result.get(timeout=min(remaining, 0.05))
                except multiprocessing.TimeoutError:
                    if cancel_generation != self._cancel_generation:
                        raise SubprocessCancelledError from None
                    continue
                except ValueError:
                    if cancel_generation != self._cancel_generation:
                        raise SubprocessCancelledError from None
                    raise
                if cancel_generation != self._cancel_generation:
                    raise SubprocessCancelledError
                return result
        except SubprocessCancelledError:
            raise
        except multiprocessing.TimeoutError as err:
            if _PSUTIL_AVAILABLE and psutil is not None:
                self._kill_worker_process(worker_pid.value)
            else:
                logger.warning(
                    "psutil not available; recreating worker pool after timeout"
                )
                with self._pool_lock:
                    if self._pool is pool:
                        self._pool.terminate()
                        self._pool.join()
                        self._pool = None
            raise TimeoutError(timeout_ms) from err
        finally:
            with self._active_lock:
                self._active_worker_pids.pop(threading.get_ident(), None)

    def cancel(self) -> None:
        """Terminate all workers for the currently executing activities."""
        with self._pool_lock:
            self._cancel_generation += 1
            pool = self._pool
            if pool is None:
                return

            if _PSUTIL_AVAILABLE and psutil is not None:
                with self._active_lock:
                    active_pids = [
                        worker_pid.value
                        for worker_pid in self._active_worker_pids.values()
                    ]
                for worker_pid in active_pids:
                    self._kill_worker_process(worker_pid)

            pool.terminate()
            pool.join()
            if self._pool is pool:
                self._pool = None

    def _kill_worker_process(self, worker_pid: int) -> None:
        if not worker_pid or not _PSUTIL_AVAILABLE or psutil is None:
            logger.warning(
                "Unable to kill stuck worker (PID %s): psutil unavailable or invalid PID",
                worker_pid,
            )
            return

        try:
            worker_proc = psutil.Process(worker_pid)
            logger.warning(
                "Killing timed-out worker process (PID %s) and its children",
                worker_pid,
            )
            for child in worker_proc.children(recursive=True):
                with contextlib.suppress(psutil.NoSuchProcess):
                    child.kill()
            with contextlib.suppress(psutil.NoSuchProcess):
                worker_proc.kill()
        except (psutil.NoSuchProcess, psutil.AccessDenied) as e:
            logger.warning(
                "Failed to kill worker process (PID %s): %s",
                worker_pid,
                e,
            )

    def close(self) -> None:
        """Close the runner and clean up resources."""
        with self._pool_lock:
            self._closed = True
            if self._pool is not None:
                self._pool.terminate()
                self._pool.join()
                self._pool = None
        if hasattr(self, "_manager") and self._manager is not None:
            self._manager.shutdown()

    def __del__(self) -> None:
        if hasattr(self, "_pool_lock"):
            self.close()

    def __enter__(self) -> LibraryRunner:
        return self

    def __exit__(
        self,
        exc_type: type[BaseException] | None,
        exc_val: BaseException | None,
        exc_tb: type[BaseException] | None,
    ) -> None:
        self.close()


def get_pool_stats() -> dict[str, Any]:
    """Get current pool statistics (for monitoring)."""
    cpu_count = multiprocessing.cpu_count()
    return {
        "active": True,
        "method": "persistent_worker_pool",
        "cpu_count": cpu_count,
        "max_workers_limit": MAX_WORKERS_LIMIT,
        "min_workers": MIN_WORKERS,
        "default_workers": cpu_count,
    }
