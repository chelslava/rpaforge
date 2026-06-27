"""
Subprocess-based executor for RPAForge.

Provides safe timeout handling using subprocess isolation.
This module implements a subprocess-based alternative to threading
for activity execution with timeout support.
"""

from __future__ import annotations

import contextlib
import logging
import multiprocessing
import os
import sys
import threading
from typing import Any

from rpaforge.i18n import _ as _t

try:
    import psutil

    _PSUTIL_AVAILABLE = True
except ImportError:
    _PSUTIL_AVAILABLE = False
    psutil = None  # type: ignore[assignment]

logger = logging.getLogger(__name__)

DEFAULT_POOL_KEEPALIVE_SECONDS = 60
MIN_WORKERS = 1
MAX_WORKERS_LIMIT = int(
    os.environ.get("RPAFORGE_MAX_WORKERS_LIMIT", str(multiprocessing.cpu_count() * 4))
)


class SubprocessExecutor:
    """
    Executor that runs activities in subprocess for safe timeout handling.

    Unlike threading-based approach, subprocess allows hard termination
    when timeouts occur, preventing resource leaks.

    Uses a persistent worker pool to reduce subprocess spawn overhead
    for high-frequency activity executions.
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
        self._pool: multiprocessing.Pool | None = None
        self._pool_lock = threading.Lock()
        self._last_use_time: float = 0
        self._closed = False
        self._active_tasks = 0
        self._manager = multiprocessing.Manager()  # For tracking worker PIDs

    def _get_pool(self) -> multiprocessing.Pool:
        import time

        with self._pool_lock:
            if self._closed:
                raise RuntimeError(_t("engine.executor_is_closed"))
            if self._pool is None:
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
        """
        Execute an activity in a subprocess with full isolation.

        This is the worker function that runs in the subprocess.
        If worker_pid is provided, record this process's PID for timeout handling.
        """
        import importlib

        # Record this worker's PID so the parent can kill only this process on timeout
        if worker_pid is not None:
            worker_pid.value = os.getpid()

        # Activities are bound instance methods (self.method(...)), not module-level
        # functions — the class itself must be imported and instantiated first.
        lib_module = importlib.import_module(library_path)
        lib_class = getattr(lib_module, class_name)
        obj = lib_class()

        # Get the activity function/method
        parts = activity_name.split(".")

        for part in parts:
            if not part.isidentifier() or part.startswith("__"):
                raise ValueError(
                    f"Invalid activity name component {part!r}: must be a valid "
                    "identifier and must not start with '__'"
                )
            obj = getattr(obj, part)

        # Execute the activity
        result = obj(*args, **kwargs)
        return result

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
        Execute an activity with timeout using subprocess isolation.

        Args:
            library_path: Dotted module path containing the library's class
                (e.g., 'rpaforge_libraries.DesktopUI.library')
            class_name: Name of the @library-decorated class within that module
            activity_name: Name of the activity (instance method) to execute
            *args: Positional arguments for the activity
            timeout_ms: Timeout in milliseconds (0 = no timeout)
            **kwargs: Keyword arguments for the activity

        Returns:
            The result of the activity execution

        Raises:
            TimeoutError: If the activity does not complete within timeout_ms
            Exception: Any exception raised by the activity
        """
        if self._closed:
            raise RuntimeError(_t("engine.executor_is_closed"))

        if timeout_ms <= 0:
            return self._execute_in_subprocess(
                library_path, class_name, activity_name, args, kwargs
            )

        timeout_seconds = timeout_ms / 1000.0
        pool = self._get_pool()

        # Create a shared Value to track the worker PID
        worker_pid = self._manager.Value('i', 0)

        async_result = pool.apply_async(
            self._execute_in_subprocess,
            (library_path, class_name, activity_name, args, kwargs, worker_pid),
        )
        try:
            return async_result.get(timeout=timeout_seconds)
        except multiprocessing.TimeoutError as err:
            if _PSUTIL_AVAILABLE and psutil is not None:
                # Kill only the specific stuck worker; pool auto-repopulates it.
                self._kill_worker_process(worker_pid.value)
            else:
                # Without psutil we cannot target individual workers; recreate pool.
                logger.warning(
                    "psutil not available; recreating worker pool after timeout"
                )
                with self._pool_lock:
                    if self._pool is pool:
                        self._pool.terminate()
                        self._pool.join()
                        self._pool = None
            raise TimeoutError(timeout_ms) from err

    def _kill_worker_process(self, worker_pid: int) -> None:
        """Kill only the specific worker process that timed out."""
        if not worker_pid or not _PSUTIL_AVAILABLE or psutil is None:
            logger.warning(
                "Unable to kill stuck worker (PID %s): psutil unavailable or invalid PID",
                worker_pid,
            )
            return

        try:
            # Kill the specific worker process (and any children it spawned)
            worker_proc = psutil.Process(worker_pid)
            logger.warning(
                "Killing timed-out worker process (PID %s) and its children",
                worker_pid,
            )
            # Kill children first, then parent
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
        """Close the executor and clean up resources."""
        with self._pool_lock:
            self._closed = True
            if self._pool is not None:
                self._pool.terminate()
                self._pool.join()
                self._pool = None
        # Clean up the manager
        if hasattr(self, '_manager') and self._manager is not None:
            self._manager.shutdown()

    def __del__(self) -> None:
        if hasattr(self, "_pool_lock"):
            self.close()

    def __enter__(self) -> SubprocessExecutor:
        return self

    def __exit__(self, exc_type, exc_val, exc_tb) -> None:
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
