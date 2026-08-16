"""
Subprocess-based executor for RPAForge.

Provides safe timeout handling using subprocess isolation. This module
implements a subprocess-based alternative to threading for activity execution
with timeout support. It is a thin subclass of :class:`WorkerPoolExecutor`
(shared with :mod:`rpaforge.core.library_runner`); see ``_worker_pool.py``.
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

__all__ = [
    "SubprocessCancelledError",
    "SubprocessExecutor",
    "get_pool_stats",
    "DEFAULT_POOL_KEEPALIVE_SECONDS",
    "MIN_WORKERS",
    "MAX_WORKERS_LIMIT",
]


# Guaranteed cleanup: the (daemon) pool holds OS resources that would otherwise
# linger until process exit even if a SubprocessExecutor is garbage-collected
# without close()/context manager. Registering this hook makes shutdown bounded.
_LIVE_EXECUTORS: set[SubprocessExecutor] = set()
_LIVE_EXECUTORS_LOCK = threading.Lock()


class SubprocessExecutor(WorkerPoolExecutor):
    """
    Executor that runs activities in subprocess for safe timeout handling.

    Unlike a threading-based approach, subprocess allows hard termination
    when timeouts occur, preventing resource leaks. Uses a persistent worker
    pool to reduce subprocess spawn overhead for high-frequency executions.
    """

    def _on_register(self) -> None:
        with _LIVE_EXECUTORS_LOCK:
            _LIVE_EXECUTORS.add(self)

    def _on_unregister(self) -> None:
        with _LIVE_EXECUTORS_LOCK:
            _LIVE_EXECUTORS.discard(self)


def _shutdown_all_executors() -> None:
    with _LIVE_EXECUTORS_LOCK:
        executors = list(_LIVE_EXECUTORS)
        _LIVE_EXECUTORS.clear()
    for executor in executors:
        with contextlib.suppress(Exception):
            executor.close()


atexit.register(_shutdown_all_executors)
