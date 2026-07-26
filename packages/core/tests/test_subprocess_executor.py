"""Tests for SubprocessExecutor: pool lock, timeout, cleanup."""

from __future__ import annotations

import threading
import time

import pytest

from rpaforge.core.subprocess_executor import (
    SubprocessCancelledError,
    SubprocessExecutor,
    get_pool_stats,
)


def _noop(
    _library_path: str,
    _class_name: str,
    _activity_name: str,
    _args: tuple,
    _kwargs: dict,
) -> str:
    return "ok"


def _slow(
    _library_path: str,
    _class_name: str,
    _activity_name: str,
    _args: tuple,
    _kwargs: dict,
) -> str:
    _never_set = threading.Event()
    _never_set.wait()  # blocks until cancelled/interrupted
    return "done"


class _RealLib:
    """Module-level instance-method library used to prove _execute_in_subprocess
    actually instantiates the class instead of getattr-ing the raw module
    (TD-11): the class lives here, not as a free function in this module."""

    def __init__(self) -> None:
        self.calls = 0

    def add(self, a: int, b: int) -> int:
        self.calls += 1
        return a + b


class _BlockingLib:
    def block(self) -> str:
        threading.Event().wait(30)
        return "done"


class TestSubprocessExecutorInit:
    def test_pool_starts_as_none(self):
        ex = SubprocessExecutor()
        assert ex._pool is None

    def test_manager_starts_as_none(self):
        ex = SubprocessExecutor()
        assert ex._manager is None
        ex.close()

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

        def slow_worker(
            _self, _library_path, _class_name, _activity_name, _args, _kwargs
        ):
            time.sleep(0.5)
            return "never"

        mod.SubprocessExecutor._execute_in_subprocess = slow_worker
        try:
            with pytest.raises((TimeoutError, Exception)):
                ex.execute_with_timeout(
                    "fake.lib", "FakeClass", "fake_activity", timeout_ms=50
                )
        finally:
            mod.SubprocessExecutor._execute_in_subprocess = original
            ex.close()

    def test_pool_is_reset_after_timeout_without_psutil(self):
        """Without psutil the pool is terminated and set to None after a timeout."""
        import multiprocessing
        import unittest.mock as mock

        ex = SubprocessExecutor()

        fake_async_result = mock.MagicMock()
        fake_async_result.get.side_effect = multiprocessing.TimeoutError()

        fake_pool = mock.MagicMock()
        fake_pool.apply_async.return_value = fake_async_result

        ex._pool = fake_pool

        with mock.patch("rpaforge.core.subprocess_executor._PSUTIL_AVAILABLE", False):
            with pytest.raises(TimeoutError):
                ex.execute_with_timeout("fake.lib", "FakeClass", "act", timeout_ms=50)

        assert ex._pool is None
        fake_pool.terminate.assert_called_once()
        fake_pool.join.assert_called_once()

    def test_pool_preserved_after_timeout_with_psutil(self):
        """With psutil the pool is kept alive after a timeout; workers are killed instead."""
        import multiprocessing
        import unittest.mock as mock

        ex = SubprocessExecutor()

        fake_async_result = mock.MagicMock()
        fake_async_result.get.side_effect = multiprocessing.TimeoutError()

        fake_pool = mock.MagicMock()
        fake_pool.apply_async.return_value = fake_async_result

        ex._pool = fake_pool

        with (
            mock.patch("rpaforge.core.subprocess_executor._PSUTIL_AVAILABLE", True),
            mock.patch("rpaforge.core.subprocess_executor.psutil", mock.MagicMock()),
            mock.patch.object(ex, "_kill_worker_process") as mock_kill,
        ):
            with pytest.raises(TimeoutError):
                ex.execute_with_timeout("fake.lib", "FakeClass", "act", timeout_ms=50)

        # Pool must be preserved — workers are killed but pool is not recreated.
        assert ex._pool is fake_pool
        fake_pool.terminate.assert_not_called()
        # Verify _kill_worker_process was called (with worker_pid as argument)
        mock_kill.assert_called_once()


class TestSubprocessExecutorCancellation:
    def test_cancel_terminates_blocking_activity_promptly(self):
        ex = SubprocessExecutor(max_workers=1)
        result: list[BaseException] = []
        try:
            worker = threading.Thread(
                target=lambda: self._run_and_capture(ex, result),
                daemon=True,
            )
            worker.start()
            deadline = time.monotonic() + 3
            while ex._pool is None and time.monotonic() < deadline:
                time.sleep(0.01)

            ex.cancel()
            worker.join(timeout=2)
        finally:
            ex.close()

        assert not worker.is_alive(), "cancel left activity blocked"
        assert result and isinstance(result[0], SubprocessCancelledError)

    @staticmethod
    def _run_and_capture(ex: SubprocessExecutor, result: list[BaseException]) -> None:
        try:
            ex.execute_with_timeout(__name__, "_BlockingLib", "block", timeout_ms=30000)
        except BaseException as exc:
            result.append(exc)


class TestExecuteInSubprocessDispatch:
    """TD-11 regression: activities are bound instance methods, so the worker
    must import the module, getattr the class, instantiate it, then call the
    bound method — not getattr the activity name directly off the module."""

    def test_dispatches_to_a_real_instance_method(self):
        ex = SubprocessExecutor()
        try:
            result = ex._execute_in_subprocess(__name__, "_RealLib", "add", (2, 3), {})
        finally:
            ex.close()

        assert result == 5

    def test_execute_with_timeout_zero_uses_the_same_dispatch(self):
        """timeout_ms<=0 calls _execute_in_subprocess directly (no pool) —
        confirms the public API forwards class_name correctly end-to-end."""
        ex = SubprocessExecutor()
        try:
            result = ex.execute_with_timeout(__name__, "_RealLib", "add", 4, 5)
        finally:
            ex.close()

        assert result == 9


class TestSubprocessExecutorConcurrency:
    def test_concurrent_calls_do_not_deadlock(self):
        """Two threads calling execute_with_timeout should not deadlock."""
        ex = SubprocessExecutor()
        import rpaforge.core.subprocess_executor as mod

        call_count = 0
        lock = threading.Lock()

        def fast_worker(
            _self, _library_path, _class_name, _activity_name, _args, _kwargs
        ):
            return "ok"

        original = mod.SubprocessExecutor._execute_in_subprocess
        mod.SubprocessExecutor._execute_in_subprocess = fast_worker

        errors: list[Exception] = []

        def call():
            nonlocal call_count
            try:
                ex.execute_with_timeout("lib", "Cls", "act", timeout_ms=2000)
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
            ex.execute_with_timeout("lib", "Cls", "act")

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

    def test_idle_pool_and_manager_expire(self):
        ex = SubprocessExecutor(max_workers=1, keepalive_seconds=0.05)
        try:
            assert (
                ex.execute_with_timeout(
                    __name__, "_RealLib", "add", 1, 2, timeout_ms=1000
                )
                == 3
            )
            deadline = time.monotonic() + 2
            while (
                ex._pool is not None or ex._manager is not None
            ) and time.monotonic() < deadline:
                time.sleep(0.01)
            assert ex._pool is None
            assert ex._manager is None
        finally:
            ex.close()
