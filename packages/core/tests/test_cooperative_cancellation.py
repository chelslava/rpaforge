"""Cooperative cancellation for threaded-fallback activities (issue #863).

Subprocess dispatch hard-kills workers; the threading fallback cannot.
These tests cover the token mechanics, the handler's cooperative-abandon
decision, the executor's event emission and instance dropping, and the
run-level cancel cascade into in-flight threaded activities.
"""

from __future__ import annotations

import threading
import time
from typing import Any

import pytest

from rpaforge.core.cancellation import (
    ActivityCancelledError,
    CancellationToken,
    CooperativeTimeoutError,
    cancellable_sleep,
    check_cancelled,
    publish_cancel_token,
    unpublish_cancel_token,
)
from rpaforge.core.execution import (
    ActivityCall,
    ExecutionStatus,
    Process,
    Task,
)
from rpaforge.core.executor import (
    ProcessExecutor,
    StopExecution,
    ThreadingTimeoutHandler,
    TimeoutError,
)


class TestCancellationToken:
    """Tests for the cancellation token primitives."""

    def test_cancel_and_check(self) -> None:
        token = CancellationToken()
        token.check()  # no-op when not cancelled
        token.cancel()
        assert token.cancelled()
        with pytest.raises(ActivityCancelledError):
            token.check()

    def test_parent_chaining(self) -> None:
        parent = CancellationToken()
        child = CancellationToken(parent=parent)
        assert not child.cancelled()
        parent.cancel()
        assert child.cancelled()
        # Cancelling the child must NOT cancel the parent (timeout-driven
        # aborts are scoped to one activity).
        child2 = CancellationToken(parent=CancellationToken())
        child2.cancel()
        assert not child2.parent.cancelled()

    def test_wait_returns_promptly_on_cancel(self) -> None:
        token = CancellationToken()
        assert token.wait(0.01) is False
        threading.Timer(0.02, token.cancel).start()
        start = time.monotonic()
        assert token.wait(5.0) is True
        assert time.monotonic() - start < 1.0

    def test_check_cancelled_uses_published_token(self) -> None:
        check_cancelled()  # no token published — no-op
        token = CancellationToken()
        var_token = publish_cancel_token(token)
        try:
            check_cancelled()  # still not cancelled
            token.cancel()
            with pytest.raises(ActivityCancelledError):
                check_cancelled()
        finally:
            unpublish_cancel_token(var_token)

    def test_cancellable_sleep_aborts_early(self) -> None:
        token = CancellationToken()
        var_token = publish_cancel_token(token)
        try:
            threading.Timer(0.1, token.cancel).start()
            start = time.monotonic()
            with pytest.raises(ActivityCancelledError):
                cancellable_sleep(30.0, 0.05)
            assert time.monotonic() - start < 2.0
        finally:
            unpublish_cancel_token(var_token)

    def test_cancellable_sleep_preserves_duration(self) -> None:
        start = time.monotonic()
        cancellable_sleep(0.3, 0.05)
        assert time.monotonic() - start >= 0.25


class TestThreadingTimeoutHandler:
    """Tests for the cooperative-vs-abandon decision on timeout."""

    def test_cooperative_activity_exits_promptly(self) -> None:
        handler = ThreadingTimeoutHandler(abandon_grace_seconds=0.5)
        token = CancellationToken()
        var_token = publish_cancel_token(token)

        def cooperative_loop() -> None:
            while True:
                check_cancelled()
                time.sleep(0.05)

        try:
            start = time.monotonic()
            with pytest.raises(CooperativeTimeoutError) as excinfo:
                handler.execute_with_timeout(cooperative_loop, (), 200)
            elapsed = time.monotonic() - start
            assert excinfo.value.timeout_ms == 200
            # timeout (0.2s) + grace (0.5s) ceiling; cooperative exit ≈ 0.3s
            assert elapsed < 2.0
        finally:
            unpublish_cancel_token(var_token)

    def test_non_cooperative_activity_is_abandoned(self) -> None:
        handler = ThreadingTimeoutHandler(abandon_grace_seconds=0.3)

        def stubborn() -> None:
            time.sleep(3.0)

        start = time.monotonic()
        with pytest.raises(TimeoutError) as excinfo:
            handler.execute_with_timeout(stubborn, (), 150)
        assert not isinstance(excinfo.value, CooperativeTimeoutError)
        assert excinfo.value.timeout_ms == 150
        assert time.monotonic() - start < 2.0

    def test_no_token_published_still_abandons(self) -> None:
        handler = ThreadingTimeoutHandler(abandon_grace_seconds=0.2)

        def stubborn() -> None:
            time.sleep(2.0)

        with pytest.raises(TimeoutError):
            handler.execute_with_timeout(stubborn, (), 100)


@pytest.fixture()
def threaded_executor(monkeypatch: pytest.MonkeyPatch) -> ProcessExecutor:
    """Executor forced onto the threading fallback (no subprocess).

    The real Flow library is registered so ``Flow.Delay`` resolves as a
    first-party in-process activity (tests that call ``_execute_activity``
    directly never run the entry-point discovery that populates
    ``LIBRARY_REGISTRY``).
    """
    from rpaforge.core.activity import LIBRARY_REGISTRY, LibraryMeta
    from rpaforge_libraries.Flow.library import Flow

    monkeypatch.setattr("rpaforge.core.executor._USE_SUBPROCESS", False)
    meta = LibraryMeta(
        name="Flow", is_stateful=False, module="rpaforge_libraries.Flow.library"
    )
    monkeypatch.setitem(LIBRARY_REGISTRY, "Flow", (Flow, meta))
    return ProcessExecutor()


class _EventCapture:
    def __init__(self) -> None:
        self.events: list[tuple[str, tuple[Any, ...]]] = []

    def __call__(self, event_type: str, *args: Any) -> None:
        self.events.append((event_type, args))

    def payloads(self, event_type: str) -> list[dict[str, Any]]:
        return [
            args[0]
            for name, args in self.events
            if name == event_type and args and isinstance(args[0], dict)
        ]


class TestExecutorThreadedCancellation:
    """Executor-level behaviour on the threading fallback path."""

    def test_cooperative_timeout_emits_activity_cancelled(
        self, threaded_executor: ProcessExecutor
    ) -> None:
        capture = _EventCapture()
        threaded_executor.add_listener(capture)

        start = time.monotonic()
        with pytest.raises(TimeoutError):
            threaded_executor._execute_activity("Flow", "Delay", 30.0, timeout_ms=300)
        elapsed = time.monotonic() - start

        cancelled = capture.payloads("activity_cancelled")
        assert len(cancelled) == 1
        assert cancelled[0]["library"] == "Flow"
        assert cancelled[0]["reason"] == "timeout"
        assert not capture.payloads("activity_abandoned")
        # 0.3s timeout + grace ≈ 1.3s ceiling.
        assert elapsed < 3.5

    def test_non_cooperative_timeout_emits_activity_abandoned_and_drops_instance(
        self, threaded_executor: ProcessExecutor
    ) -> None:
        capture = _EventCapture()
        threaded_executor.add_listener(capture)

        calls: list[int] = []

        class HardSleeper:
            def delay(self, duration: float, unit: str = "seconds") -> float:  # noqa: ARG002
                calls.append(1)
                time.sleep(3.0)
                return 0.0

        poisoned = HardSleeper()
        threaded_executor._libraries["Flow"] = poisoned

        with pytest.raises(TimeoutError):
            threaded_executor._execute_activity("Flow", "Delay", 30.0, timeout_ms=200)

        abandoned = capture.payloads("activity_abandoned")
        assert len(abandoned) == 1
        assert abandoned[0]["library"] == "Flow"
        assert abandoned[0]["reason"] == "timeout"
        assert not capture.payloads("activity_cancelled")
        # The poisoned live instance is dropped so the next activity cannot
        # reuse the object the abandoned thread may still hold.
        assert "Flow" not in threaded_executor._libraries

    def test_direct_path_run_cancel_stops_cooperative_activity(
        self, threaded_executor: ProcessExecutor
    ) -> None:
        capture = _EventCapture()
        threaded_executor.add_listener(capture)
        threaded_executor._run_cancel_token.cancel()

        with pytest.raises(StopExecution):
            threaded_executor._execute_activity("Flow", "Delay", 30.0, timeout_ms=0)
        cancelled = capture.payloads("activity_cancelled")
        assert len(cancelled) == 1
        assert cancelled[0]["reason"] == "cancelled"

    def test_run_level_cancel_cascades_to_inflight_threaded_activity(
        self, threaded_executor: ProcessExecutor
    ) -> None:
        capture = _EventCapture()
        threaded_executor.add_listener(capture)

        activity = ActivityCall(
            library="Flow",
            activity="Delay",
            args=(30.0,),
            timeout_ms=60_000,
            node_id="delay-node",
        )
        process = Process(
            name="Cancel Cascade", tasks=[Task(name="T", activities=[activity])]
        )

        def cancel_soon() -> None:
            time.sleep(0.4)
            threaded_executor.cancel()

        canceller = threading.Thread(target=cancel_soon, daemon=True)
        canceller.start()
        result = threaded_executor.run(process)
        canceller.join(timeout=5.0)

        assert result.status == ExecutionStatus.CANCELLED
        cancelled = capture.payloads("activity_cancelled")
        assert len(cancelled) == 1
        assert cancelled[0]["node_id"] == "delay-node"
        assert cancelled[0]["reason"] == "cancelled"
