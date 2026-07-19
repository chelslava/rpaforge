"""Integration tests for process cancellation."""

from __future__ import annotations

import threading
import time

import pytest

from rpaforge.core.activity import LIBRARY_REGISTRY, LibraryMeta
from rpaforge.core.execution import ProcessBuilder
from rpaforge.core.executor import ProcessExecutor, StopExecution
from rpaforge.core.runner import ProcessRunner, RunnerState, StudioEngine
from rpaforge.core.subprocess_executor import SubprocessExecutor


class _RunnerBlockingLib:
    def block(self):
        threading.Event().wait(30)
        return "unreachable"

    def after(self):
        return "must not run"


class TestRunnerCancellation:
    """ProcessRunner cancel() state transitions."""

    def test_cancel_from_running_transitions_to_cancelling(self):
        runner = ProcessRunner()
        runner._state = RunnerState.RUNNING

        runner.cancel()

        assert runner.state == RunnerState.CANCELLING
        assert runner._stop_requested is True

    def test_cancel_from_paused_transitions_to_cancelling(self):
        runner = ProcessRunner()
        runner._state = RunnerState.PAUSED
        runner._pause_event.clear()

        runner.cancel()

        assert runner.state == RunnerState.CANCELLING
        assert runner._stop_requested is True
        assert runner._pause_event.is_set()

    def test_cancel_from_idle_is_noop(self):
        runner = ProcessRunner()

        runner.cancel()

        assert runner.state == RunnerState.IDLE
        assert runner._stop_requested is False

    def test_cancel_triggers_callback(self):
        runner = ProcessRunner()
        runner._state = RunnerState.RUNNING
        called = []
        runner.on_cancel(lambda: called.append(True))

        runner.cancel()

        assert called == [True]

    def test_stop_sets_stop_requested(self):
        runner = ProcessRunner()
        runner._state = RunnerState.RUNNING

        runner.stop()

        assert runner._stop_requested is True

    def test_cancel_unblocks_paused_event(self):
        runner = ProcessRunner()
        runner._state = RunnerState.PAUSED
        runner._pause_event.clear()

        runner.cancel()

        assert runner._pause_event.is_set()


class TestEngineCancellation:
    """StudioEngine cancel() delegates correctly."""

    def test_cancel_while_running_sets_cancelling(self):
        engine = StudioEngine()
        engine._runner._state = RunnerState.RUNNING

        engine.cancel()

        assert engine.state == RunnerState.CANCELLING
        assert engine.stop_requested is True

    def test_cancel_while_idle_is_noop(self):
        engine = StudioEngine()

        engine.cancel()

        assert engine.state == RunnerState.IDLE

    def test_on_cancel_callback_fires(self):
        engine = StudioEngine()
        engine._runner._state = RunnerState.RUNNING
        fired = []
        engine.on_cancel(lambda: fired.append(1))

        engine.cancel()

        assert fired == [1]

    def test_cancel_twice_does_not_double_fire_callback(self):
        engine = StudioEngine()
        engine._runner._state = RunnerState.RUNNING
        fired = []
        engine.on_cancel(lambda: fired.append(1))

        engine.cancel()
        engine.cancel()

        assert len(fired) == 1


class TestCancellationMidExecution:
    """Cancel stops a process mid-flight."""

    def _make_process_with_sleep(self, sleep_secs: float = 2.0):
        """Build a process that captures a cancel flag via a mock activity."""
        cancel_confirmed = threading.Event()

        class SleepLib:
            def sleep_activity(self):
                cancel_confirmed.wait(timeout=sleep_secs)

        lib = SleepLib()
        executor = ProcessExecutor()
        executor.register_library("SleepLib", lib)

        builder = ProcessBuilder("Cancel Test")
        builder.add_task("T1").add_activity("SleepLib", "sleep_activity")
        return executor, builder.build()

    def test_cancel_during_run_stops_execution(self):
        runner = ProcessRunner()
        builder = ProcessBuilder("Cancel Test")
        started = threading.Event()

        class MockLib:
            def noop(self):
                started.set()

        runner.executor.register_library("Mock", MockLib())
        for i in range(20):
            builder.add_task(f"Task {i}").add_activity("Mock", "noop", node_id=f"n{i}")

        process = builder.build()

        runner._state = RunnerState.IDLE
        runner._stop_requested = False

        result_holder: list = []

        def run():
            result_holder.append(runner.run(process))

        t = threading.Thread(target=run, daemon=True)
        t.start()

        started.wait(timeout=3.0)
        runner.cancel()
        t.join(timeout=3.0)

        assert not t.is_alive(), "Runner did not terminate after cancel"
        assert runner.state != RunnerState.RUNNING

    def test_stop_requested_raises_stop_execution_in_activity(self):
        runner = ProcessRunner()
        runner._stop_requested = True
        runner._state = RunnerState.RUNNING

        from rpaforge.core.execution import ActivityCall

        activity = ActivityCall(library="BuiltIn", activity="noop", node_id="n1")

        with pytest.raises(StopExecution):
            runner._handle_activity_start(activity)

    def test_cancel_terminates_timeout_activity_and_skips_following_activity(
        self,
    ):
        started = threading.Event()
        activity_starts: list[str] = []

        runner = ProcessRunner()
        old_subprocess_executor = runner.executor._subprocess_executor
        if old_subprocess_executor is not None:
            old_subprocess_executor.close()
        runner.executor._subprocess_executor = SubprocessExecutor(max_workers=1)
        library_name = "_RunnerBlockingLib"
        LIBRARY_REGISTRY[library_name] = (
            _RunnerBlockingLib,
            LibraryMeta(name=library_name, module=__name__, is_stateful=False),
        )
        runner.executor.register_library(library_name, _RunnerBlockingLib())
        runner.on_step(
            lambda frame: (started.set(), activity_starts.append(frame.activity))
        )
        builder = ProcessBuilder("Blocking cancellation")
        task = builder.add_task("T1")
        task.add_activity(library_name, "block", timeout_ms=30000)
        task.add_activity(library_name, "after")
        process = builder.build()
        result_holder = []

        thread = threading.Thread(
            target=lambda: result_holder.append(runner.run(process)), daemon=True
        )
        thread.start()
        assert started.wait(timeout=3)
        subprocess_executor = runner.executor._subprocess_executor
        assert subprocess_executor is not None
        deadline = time.monotonic() + 3
        while subprocess_executor._pool is None and time.monotonic() < deadline:
            time.sleep(0.01)
        assert subprocess_executor._pool is not None

        runner.cancel()
        thread.join(timeout=3)

        try:
            assert not thread.is_alive(), "runner did not stop after cancellation"
            assert result_holder[0].message == "Execution stopped by user"
            assert activity_starts == ["block"]
        finally:
            LIBRARY_REGISTRY.pop(library_name, None)


class TestCancellationCallbacks:
    """Verify callback registration and firing for cancel/stop."""

    def test_multiple_cancel_callbacks_all_fire(self):
        runner = ProcessRunner()
        runner._state = RunnerState.RUNNING
        log: list[str] = []
        runner.on_cancel(lambda: log.append("cb1"))
        runner.on_cancel(lambda: log.append("cb2"))

        runner.cancel()

        assert "cb1" in log
        assert "cb2" in log

    def test_erroring_callback_does_not_prevent_others(self):
        runner = ProcessRunner()
        runner._state = RunnerState.RUNNING
        log: list[str] = []

        def bad_cb():
            raise RuntimeError("oops")

        runner.on_cancel(bad_cb)
        runner.on_cancel(lambda: log.append("ok"))

        runner.cancel()

        assert "ok" in log
