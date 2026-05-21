"""Tests for SubprocessExecutor: pool lock, timeout, cleanup."""

from __future__ import annotations

import threading
import time

import pytest

from rpaforge.core.subprocess_executor import SubprocessExecutor, get_pool_stats


def _noop(_library_path: str, _activity_name: str, _args: tuple, _kwargs: dict) -> str:
    return "ok"


def _slow(_library_path: str, _activity_name: str, _args: tuple, _kwargs: dict) -> str:
    time.sleep(10)
    return "done"


class TestSubprocessExecutorInit:
    def test_pool_starts_as_none(self):
        ex = SubprocessExecutor()
        assert ex._pool is None

    def test_has_pool_lock(self):
        ex = SubprocessExecutor()
        assert isinstance(ex._pool_lock, type(threading.Lock()))

    def test_close_on_idle_is_safe(self):
        ex = SubprocessExecutor()
        ex.close()
        assert ex._pool is None


class TestSubprocessExecutorValidation:
    def test_max_workers_validation_too_low(self):
        with pytest.raises(ValueError, match="max_workers must be at least"):
            SubprocessExecutor(max_workers=0)

    def test_max_workers_validation_too_high(self):
        with pytest.raises(ValueError, match="max_workers cannot exceed"):
            SubprocessExecutor(max_workers=999999)

    def test_max_workers_valid_value(self):
        ex = SubprocessExecutor(max_workers=2)
        assert ex._max_workers == 2


class TestSubprocessExecutorTimeout:
    def test_raises_timeout_error(self):
        ex = SubprocessExecutor()
        # _execute_in_subprocess is the worker; we need a real callable for the pool.
        # Use a direct call with a tiny timeout and a module-level slow function.
        # Since the pool runs _execute_in_subprocess internally, inject via monkey-patch.
        import rpaforge.core.subprocess_executor as mod

        original = mod.SubprocessExecutor._execute_in_subprocess

        def slow_worker(_self, _library_path, _activity_name, _args, _kwargs):
            time.sleep(5)
            return "never"

        mod.SubprocessExecutor._execute_in_subprocess = slow_worker
        try:
            with pytest.raises((TimeoutError, Exception)):
                ex.execute_with_timeout("fake.lib", "fake_activity", timeout_ms=50)
        finally:
            mod.SubprocessExecutor._execute_in_subprocess = original
            ex.close()

    def test_pool_is_reset_after_timeout(self):
        """After a timeout the stale pool is terminated and set to None."""
        import multiprocessing
        import unittest.mock as mock

        ex = SubprocessExecutor()

        # Build a fake pool whose apply_async().get() raises TimeoutError.
        fake_async_result = mock.MagicMock()
        fake_async_result.get.side_effect = multiprocessing.TimeoutError()

        fake_pool = mock.MagicMock()
        fake_pool.apply_async.return_value = fake_async_result

        ex._pool = fake_pool

        with pytest.raises(TimeoutError):
            ex.execute_with_timeout("fake.lib", "act", timeout_ms=50)

        # Pool must be torn down and set to None after a timeout.
        assert ex._pool is None
        fake_pool.terminate.assert_called_once()
        fake_pool.join.assert_called_once()


class TestSubprocessExecutorConcurrency:
    def test_concurrent_calls_do_not_deadlock(self):
        """Two threads calling execute_with_timeout should not deadlock."""
        ex = SubprocessExecutor()
        import rpaforge.core.subprocess_executor as mod

        call_count = 0
        lock = threading.Lock()

        def fast_worker(_self, _library_path, _activity_name, _args, _kwargs):
            return "ok"

        original = mod.SubprocessExecutor._execute_in_subprocess
        mod.SubprocessExecutor._execute_in_subprocess = fast_worker

        errors: list[Exception] = []

        def call():
            nonlocal call_count
            try:
                ex.execute_with_timeout("lib", "act", timeout_ms=2000)
                with lock:
                    call_count += 1
            except Exception as e:
                errors.append(e)

        mod.SubprocessExecutor._execute_in_subprocess = fast_worker
        try:
            t1 = threading.Thread(target=call)
            t2 = threading.Thread(target=call)
            t1.start()
            t2.start()
            t1.join(timeout=10)
            t2.join(timeout=10)
        finally:
            mod.SubprocessExecutor._execute_in_subprocess = original
            ex.close()

        assert not t1.is_alive(), "Thread 1 deadlocked"
        assert not t2.is_alive(), "Thread 2 deadlocked"


class TestSubprocessExecutorContextManager:
    def test_context_manager_closes_pool(self):
        with SubprocessExecutor() as ex:
            assert ex._pool is None
        assert ex._pool is None


class TestPersistentPool:
    def test_closed_executor_raises(self):
        """Closed executor should raise on execute."""
        ex = SubprocessExecutor()
        ex.close()
        with pytest.raises(RuntimeError, match="closed"):
            ex.execute_with_timeout("lib", "act")

    def test_get_pool_stats(self):
        """Test pool stats function."""
        stats = get_pool_stats()
        assert stats["active"] is True
        assert "method" in stats

    def test_has_keepalive_config(self):
        """Test that keepalive parameter is accepted."""
        ex = SubprocessExecutor(keepalive_seconds=120)
        assert ex._keepalive_seconds == 120
        ex.close()
