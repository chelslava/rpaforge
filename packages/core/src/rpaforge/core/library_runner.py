"""
Library runner with sandboxed execution for third-party RPA libraries.

This module provides subprocess isolation for third-party library execution
with AST-based import validation to prevent arbitrary code execution. It is a
thin subclass of :class:`WorkerPoolExecutor` (shared with
:mod:`rpaforge.core.subprocess_executor`); see ``_worker_pool.py``.
"""

from __future__ import annotations

import atexit
import contextlib
import threading

from rpaforge.core._worker_pool import (
    DEFAULT_POOL_KEEPALIVE_SECONDS,
    MAX_WORKERS_LIMIT,
    MIN_WORKERS,
    SubprocessCancelledError,
    WorkerPoolExecutor,
    get_pool_stats,
)
from rpaforge.core.library_sandbox import (
    SandboxViolationError,
    validate_module_package,
)
from rpaforge.i18n import _ as _t

__all__ = [
    "LibraryRunner",
    "SubprocessCancelledError",
    "SandboxViolationError",
    "get_pool_stats",
    "DEFAULT_POOL_KEEPALIVE_SECONDS",
    "MIN_WORKERS",
    "MAX_WORKERS_LIMIT",
]


# Guaranteed cleanup: the (daemon) pool holds OS resources that would otherwise
# linger until process exit even if a LibraryRunner is garbage-collected
# without close()/context manager. Registering this hook makes shutdown bounded.
_ACTIVE_RUNNERS: set[LibraryRunner] = set()
_ACTIVE_RUNNERS_LOCK = threading.Lock()


class LibraryRunner(WorkerPoolExecutor):
    """
    Runner that executes third-party libraries in subprocess with sandbox validation.

    This class wraps multiprocessing.Pool with import validation for
    third-party library code to prevent arbitrary code execution through
    malicious libraries.

    The runner performs AST-based import checking before dispatching any
    third-party library code to a subprocess worker.
    """

    def _on_register(self) -> None:
        with _ACTIVE_RUNNERS_LOCK:
            _ACTIVE_RUNNERS.add(self)

    def _on_unregister(self) -> None:
        with _ACTIVE_RUNNERS_LOCK:
            _ACTIVE_RUNNERS.discard(self)

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
        args: tuple[object, ...],
        kwargs: dict[str, object],
    ) -> object:
        """Execute a third-party library activity with import validation."""
        self._validate_library_source(library_path)

        return self._execute_in_subprocess(
            library_path, class_name, activity_name, args, kwargs
        )

    def _dispatch_without_timeout(
        self,
        library_path: str,
        class_name: str,
        activity_name: str,
        args: tuple[object, ...],
        kwargs: dict[str, object],
    ) -> object:
        # Third-party libraries always go through sandbox import validation,
        # even when no timeout is configured.
        return self.execute_sandboxed(
            library_path, class_name, activity_name, args, kwargs
        )


def _shutdown_all_runners() -> None:
    with _ACTIVE_RUNNERS_LOCK:
        runners = list(_ACTIVE_RUNNERS)
        _ACTIVE_RUNNERS.clear()
    for runner in runners:
        with contextlib.suppress(Exception):
            runner.close()


atexit.register(_shutdown_all_runners)
