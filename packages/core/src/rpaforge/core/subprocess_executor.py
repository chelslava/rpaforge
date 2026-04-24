"""
Subprocess-based executor for RPAForge.

Provides safe timeout handling using subprocess isolation.
This module implements a subprocess-based alternative to threading
for activity execution with timeout support.
"""

from __future__ import annotations

import multiprocessing
import sys
from typing import Any


class SubprocessExecutor:
    """
    Executor that runs activities in subprocess for safe timeout handling.

    Unlike threading-based approach, subprocess allows hard termination
    when timeouts occur, preventing resource leaks.
    """

    def __init__(self, max_workers: int | None = None):
        self._max_workers = max_workers or multiprocessing.cpu_count()
        self._pool: multiprocessing.Pool | None = None

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
        if timeout_ms <= 0:
            # No timeout, direct execution
            return self._execute_in_subprocess(
                library_path, activity_name, args, kwargs
            )

        timeout_seconds = timeout_ms / 1000.0

        # Create a multiprocessing Pool
        # Using 'fork' start method on Unix for better performance
        if sys.platform.startswith("win"):
            # On Windows, use 'spawn' (default)
            ctx = multiprocessing.get_context("spawn")
        else:
            # On Unix, try 'fork' for better performance
            try:
                ctx = multiprocessing.get_context("fork")
            except RuntimeError:
                ctx = multiprocessing.get_context("spawn")

        with ctx.Pool(processes=1) as pool:
            try:
                result = pool.apply_async(
                    self._execute_in_subprocess,
                    (library_path, activity_name, args, kwargs),
                )

                return result.get(timeout=timeout_seconds)

            except multiprocessing.TimeoutError as err:
                pool.terminate()
                pool.join()
                raise TimeoutError(timeout_ms) from err

    def close(self) -> None:
        """Close the executor and clean up resources."""
        if self._pool is not None:
            self._pool.close()
            self._pool.join()
            self._pool = None

    def __enter__(self) -> SubprocessExecutor:
        return self

    def __exit__(self, exc_type, exc_val, exc_tb) -> None:
        self.close()
