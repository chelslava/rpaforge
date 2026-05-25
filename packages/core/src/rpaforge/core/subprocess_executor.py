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
                f"max_workers must be at least {MIN_WORKERS}, got {max_workers}"
            )
        elif max_workers > MAX_WORKERS_LIMIT:
            raise ValueError(
                f"max_workers cannot exceed {MAX_WORKERS_LIMIT}, got {max_workers}"
            )
        self._max_workers = max_workers
        self._keepalive_seconds = keepalive_seconds
        self._pool: multiprocessing.Pool | None = None
        self._pool_lock = threading.Lock()
        self._last_use_time: float = 0
        self._closed = False
        self._active_tasks = 0

    def _get_pool(self) -> multiprocessing.Pool:
        import time

        with self._pool_lock:
            if self._closed:
                raise RuntimeError("Executor is closed")
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
        activity_name: str,
        args: tuple[Any, ...],
        kwargs: dict[str, Any],
    ) -> Any:
        """
        Execute an activity in a subprocess with full isolation.

        This is the worker function that runs in the subprocess.
        """
        import importlib

        # Import the library
        lib_module = importlib.import_module(library_path)

        # Get the activity function/method
        parts = activity_name.split(".")
        obj = lib_module

        for part in parts:
            obj = getattr(obj, part)

        # Execute the activity
        result = obj(*args, **kwargs)
        return result

    def execute_with_timeout(
        self,
        library_path: str,
        activity_name: str,
        *args: Any,
        timeout_ms: int = 0,
        **kwargs: Any,
    ) -> Any:
        """
        Execute an activity with timeout using subprocess isolation.

        Args:
            library_path: Path to the library module (e.g., 'rpaforge_libraries.DesktopUI')
            activity_name: Name of the activity to execute
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
            raise RuntimeError("Executor is closed")

        if timeout_ms <= 0:
            return self._execute_in_subprocess(
                library_path, activity_name, args, kwargs
            )

        timeout_seconds = timeout_ms / 1000.0
        pool = self._get_pool()
        async_result = pool.apply_async(
            self._execute_in_subprocess,
            (library_path, activity_name, args, kwargs),
        )
        try:
            return async_result.get(timeout=timeout_seconds)
        except multiprocessing.TimeoutError as err:
            self._kill_child_processes()
            with self._pool_lock:
                if self._pool is pool:
                    self._pool.terminate()
                    self._pool.join()
                    self._pool = None
            raise TimeoutError(timeout_ms) from err

    def _kill_child_processes(self) -> None:
        if _PSUTIL_AVAILABLE and psutil is not None:
            current = psutil.Process()
            for child in current.children(recursive=True):
                with contextlib.suppress(psutil.NoSuchProcess):
                    child.kill()
        else:
            logger.warning(
                "psutil is not available; child processes may not be terminated on timeout"
            )

    def close(self) -> None:
        """Close the executor and clean up resources."""
        with self._pool_lock:
            self._closed = True
            if self._pool is not None:
                self._pool.terminate()
                self._pool.join()
                self._pool = None

    def __del__(self) -> None:
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
