"""Tests for adaptive daemon backoff and Postgres LISTEN/NOTIFY (issue #829)."""

from __future__ import annotations

import threading
from collections import deque
from pathlib import Path

import pytest

from rpaforge.queues.postgres_store import (
    NOTIFY_CHANNEL,
    PostgreSQLQueueStore,
    PostgresQueueListener,
)
from rpaforge.runner.daemon import BACKOFF_MAX_SECONDS, RunnerDaemon, backoff_delay


class TestBackoffDelay:
    """Pure delay computation."""

    def test_fixed_mode_returns_poll_interval(self):
        assert backoff_delay(2.0, 0, adaptive=False) == 2.0
        assert backoff_delay(2.0, 50, adaptive=False) == 2.0

    def test_adaptive_starts_at_half_interval(self):
        assert backoff_delay(2.0, 0) == pytest.approx(1.0)

    def test_adaptive_grows_1_5x_and_caps(self):
        sequence = [backoff_delay(2.0, streak) for streak in range(12)]
        assert sequence[0] == pytest.approx(1.0)
        assert sequence[1] == pytest.approx(1.5)
        assert sequence[2] == pytest.approx(2.25)
        assert sequence[3] == pytest.approx(3.375)
        assert sequence[4] == pytest.approx(5.0625)
        assert sequence[5] == pytest.approx(BACKOFF_MAX_SECONDS)  # cap hit
        assert all(d == BACKOFF_MAX_SECONDS for d in sequence[5:])

    def test_minimum_poll_interval_floor(self):
        # The daemon clamps poll_interval to >= 0.1s, so the adaptive base
        # floor is half of that.
        assert backoff_delay(0.01, 0) == pytest.approx(0.05)

    def test_idle_poll_reduction_ge_3x_soak(self):
        """Acceptance: idle polls in a soak reduced >= 3x vs fixed interval."""
        window = 600.0  # 10-minute soak
        fixed_polls = window / 2.0  # fixed 2s interval -> 300
        adaptive_polls = 0
        t = 0.0
        streak = 0
        while t < window:
            t += backoff_delay(2.0, streak)
            adaptive_polls += 1
            streak += 1
        assert adaptive_polls * 3 <= fixed_polls


class _RecordingBackend:
    """QueueBackend stand-in returning a fixed sequence of items."""

    def __init__(self, items: list[object]) -> None:
        self.items = list(items)
        self.polls = 0

    def fetch_next_item(self, _queue_name):
        self.polls += 1
        if self.items:
            return self.items.pop(0)
        return None

    def mark_completed(self, item_id, output=None):
        pass

    def mark_failed(self, item_id, error):
        pass


class _Item:
    def __init__(self, item_id: str, diagram_path: str) -> None:
        self.item_id = item_id
        self.queue_name = "q"
        self.diagram_path = diagram_path
        self.variables: dict = {}
        self.priority = "Normal"


class TestDaemonWakeAndBackoff:
    """Daemon loop integration: backoff schedule + instant wake."""

    def test_wake_event_interrupts_idle_sleep(self):
        """A wake() during the idle backoff triggers an immediate poll."""
        backend = _RecordingBackend([])
        daemon = RunnerDaemon(
            queue_name="q",
            backend=backend,  # type: ignore[arg-type]
            poll_interval=2.0,
            max_tasks=1,
        )
        poll_times: list[float] = []

        real_fetch = backend.fetch_next_item

        def counting_fetch(_queue_name):
            import time as _time

            poll_times.append(_time.monotonic())
            return real_fetch(_queue_name)

        backend.fetch_next_item = counting_fetch  # type: ignore[method-assign]

        def wake_soon():
            # Wake while the daemon sits in the ~1s first backoff wait.
            timer = threading.Timer(0.2, daemon.wake)
            timer.start()

        timer_thread = threading.Thread(target=wake_soon)
        stopper = threading.Timer(2.0, daemon.stop)

        timer_thread.start()
        stopper.start()
        daemon.run()
        stopper.cancel()

        # Without the wake, a 2s budget fits ~2 polls; the wake forces more.
        assert backend.polls >= 3
        assert poll_times[1] - poll_times[0] < 1.0  # woke before the full delay

    def test_item_resets_backoff_streak(self, tmp_path: Path):
        """After a delivered item, the next empty poll starts back at half."""
        item = _Item("id-1", str(tmp_path / "missing.process"))
        backend = _RecordingBackend([item])
        daemon = RunnerDaemon(
            queue_name="q",
            backend=backend,  # type: ignore[arg-type]
            poll_interval=2.0,
            max_tasks=1,
            adaptive_backoff=True,
        )
        # _process_item will fail on the missing diagram, but the daemon still
        # counts the poll as non-empty.
        stopper = threading.Timer(5.0, daemon.stop)
        stopper.start()
        daemon.run()
        stopper.cancel()
        assert backend.polls >= 1


class TestPostgresNotifyOnEnqueue:
    """Enqueue paths issue NOTIFY on the shared channel."""

    class _FakeCursor:
        def __init__(self, log):
            self.log = log

        def execute(self, query, params=None):
            self.log.append((query.strip(), params))

        def executemany(self, query, records):
            self.log.append((query.strip(), records))

        def __enter__(self):
            return self

        def __exit__(self, *exc):
            return False

    class _FakeConn:
        def __init__(self, log):
            self.log = log

        def cursor(self):
            return TestPostgresNotifyOnEnqueue._FakeCursor(self.log)

        def commit(self):
            pass

    def test_add_item_sends_notify(self):
        log: list = []
        store = PostgreSQLQueueStore(self._FakeConn(log))
        store.add_item("jobs", {"diagram_path": "a.process"})
        notifies = [q for q, _ in log if "NOTIFY" in q.upper()]
        assert notifies == [f"NOTIFY {NOTIFY_CHANNEL}, %s"]
        assert log[-1][1] == ("jobs",) or log[-2][1] == ("jobs",)
        payloads = [p for _, p in log if p == ("jobs",)]
        assert payloads  # queue name carried as the NOTIFY payload

    def test_add_bulk_sends_single_notify(self):
        log: list = []
        store = PostgreSQLQueueStore(self._FakeConn(log))
        store.add_bulk_items(
            "jobs",
            [
                {"payload": {"diagram_path": "a.process"}},
                {"payload": {"diagram_path": "b.process"}},
            ],
        )
        notify_calls = [p for _, p in log if p == ("jobs",)]
        assert len(notify_calls) == 1


class TestPostgresQueueListener:
    """Listener loop over mocked psycopg APIs (no live Postgres in CI)."""

    def test_psycopg2_style_notifications_dispatch(self, monkeypatch):
        received: list[str] = []
        stopper = threading.Event()

        class Notification:
            def __init__(self, payload):
                self.payload = payload

        class FakeCursor:
            def execute(self, query):
                assert NOTIFY_CHANNEL in query

            def __enter__(self):
                return self

            def __exit__(self, *exc):
                return False

        class FakeConn:
            def __init__(self):
                self.notifies = deque([Notification("jobs"), Notification("other")])
                self.closed = False

            def cursor(self):
                return FakeCursor()

            def isclosed(self):
                return self.closed

            def poll(self):
                # Both notifications consumed on first poll; then block until
                # stopped via the 0.5s select timeout.
                return None

        conn = FakeConn()
        monkeypatch.setattr(PostgresQueueListener, "_connect", lambda _self: conn)

        import select as _select

        monkeypatch.setattr(
            _select,
            "select",
            lambda fds, *_: ([fds[0]] if len(conn.notifies) else [], [], []),
        )

        def on_notify(payload):
            received.append(payload)
            if len(received) == 2:
                stopper.set()

        listener = PostgresQueueListener("postgresql://fake")
        # Race the stopper against the loop: stop breaks the outer while.
        loop_thread = threading.Thread(
            target=listener.start, args=(on_notify,), daemon=True
        )
        loop_thread.start()
        stopper.wait(5)
        listener.stop()
        loop_thread.join(5)
        assert received == ["jobs", "other"]

    def test_psycopg3_style_notifications_dispatch(self, monkeypatch):
        received: list[str] = []
        stopper = threading.Event()

        class Notification:
            def __init__(self, payload):
                self.payload = payload

        class FakeCursor:
            def execute(self, query):
                pass

            def __enter__(self):
                return self

            def __exit__(self, *exc):
                return False

        class FakeConn:
            def __init__(self):
                self._notifies = iter([Notification("jobs")])

            def cursor(self):
                return FakeCursor()

            def notifies(self, timeout=None):  # noqa: ARG002 - fake
                try:
                    return iter([next(self._notifies)])
                except StopIteration:
                    stopper.set()
                    return iter([])

        monkeypatch.setattr(PostgresQueueListener, "_connect", lambda _self: FakeConn())

        def on_notify(payload):
            received.append(payload)
            stopper.set()

        listener = PostgresQueueListener("postgresql://fake")
        loop_thread = threading.Thread(
            target=listener.start, args=(on_notify,), daemon=True
        )
        loop_thread.start()
        stopper.wait(5)
        listener.stop()
        loop_thread.join(5)
        assert received == ["jobs"]

    def test_listener_survives_connection_errors(self, monkeypatch):
        attempts = {"n": 0}

        def broken_connect(self):
            attempts["n"] += 1
            if attempts["n"] < 3:
                raise RuntimeError("db down")
            raise StopIteration  # escape the loop via the exception path

        listener = PostgresQueueListener("postgresql://fake", reconnect_delay=0.01)
        monkeypatch.setattr(PostgresQueueListener, "_connect", broken_connect)

        def stop_soon():
            threading.Event().wait(0.3)
            listener.stop()

        stopper_thread = threading.Thread(target=stop_soon)
        stopper_thread.start()
        listener.start(lambda _payload: None)  # returns after stop
        stopper_thread.join(5)
        assert attempts["n"] >= 2  # retried instead of dying
