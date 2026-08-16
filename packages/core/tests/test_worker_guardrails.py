"""Tests for Subprocess worker memory limits and stateful boundary guardrails."""

from __future__ import annotations

import socket
import threading

import pytest

from rpaforge.core._worker_pool import (
    StatefulBoundaryError,
    WorkerPoolExecutor,
    check_stateful_boundary,
    get_pool_stats,
)


class TestStatefulBoundaryGuardrails:
    def test_picklable_arguments_pass(self):
        check_stateful_boundary(
            ("hello", 123, [1, 2, 3]), {"flag": True, "data": {"a": 1}}
        )

    def test_unpicklable_arguments_raise_stateful_boundary_error(self):
        # Open socket or lock or lambda/unpicklable generator
        sock = socket.socket()
        try:
            with pytest.raises(StatefulBoundaryError) as exc_info:
                check_stateful_boundary((sock,), {})
            assert "Cannot pass unpicklable or process-bound state handle" in str(
                exc_info.value
            )
        finally:
            sock.close()

    def test_threading_lock_raises_stateful_boundary_error(self):
        lock = threading.Lock()
        with pytest.raises(StatefulBoundaryError) as exc_info:
            check_stateful_boundary((), {"lock": lock})
        assert "Cannot pass unpicklable or process-bound state handle" in str(
            exc_info.value
        )


class TestWorkerMemoryAndRecycle:
    def test_pool_stats_contains_memory_and_task_limits(self):
        stats = get_pool_stats()
        assert "default_max_tasks_per_worker" in stats
        assert "default_max_worker_memory_mb" in stats
        assert stats["default_max_tasks_per_worker"] == 100
        assert stats["default_max_worker_memory_mb"] == 512

    def test_worker_executor_maxtasksperchild_configured(self):
        executor = WorkerPoolExecutor(
            max_workers=2, max_tasks_per_worker=50, max_worker_memory_mb=256
        )
        assert executor._max_tasks_per_worker == 50
        assert executor._max_worker_memory_mb == 256
        executor.close()
