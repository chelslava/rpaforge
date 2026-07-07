from __future__ import annotations

import threading

import pytest

from rpaforge.core.library_runner import LibraryRunner, get_pool_stats


class TestLibraryRunnerInit:
    def test_pool_starts_as_none(self):
        runner = LibraryRunner()
        assert runner._pool is None

    def test_has_pool_lock(self):
        runner = LibraryRunner()
        assert isinstance(runner._pool_lock, type(threading.Lock()))

    def test_close_on_idle_is_safe(self):
        runner = LibraryRunner()
        runner.close()
        assert runner._pool is None

    def test_max_workers_validation(self):
        with pytest.raises(ValueError, match="max_workers must be at least"):
            LibraryRunner(max_workers=0)
        with pytest.raises(ValueError, match="max_workers cannot exceed"):
            LibraryRunner(max_workers=999999)


class TestLibraryRunnerTimeout:
    def test_pool_preserved_after_successful_execution(self):
        runner = LibraryRunner()
        pool = runner._get_pool()
        runner._get_pool()
        assert runner._pool is pool
        runner.close()


class TestLibraryRunnerContextManager:
    def test_context_manager_closes_pool(self):
        with LibraryRunner() as runner:
            assert runner._pool is None
        assert runner._pool is None


class TestPersistentPool:
    def test_closed_executor_raises(self):
        runner = LibraryRunner()
        runner.close()
        with pytest.raises(RuntimeError, match="closed"):
            runner.execute_with_timeout("lib", "Cls", "act")

    def test_get_pool_stats(self):
        stats = get_pool_stats()
        assert stats["active"] is True
        assert "method" in stats

    def test_has_keepalive_config(self):
        runner = LibraryRunner(keepalive_seconds=120)
        assert runner._keepalive_seconds == 120
        runner.close()
