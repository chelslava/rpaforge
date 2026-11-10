"""Worker daemon for background execution and queue polling."""

from __future__ import annotations

import concurrent.futures
import contextlib
import signal
import threading
from collections.abc import Callable
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from rpaforge.cli.run import load_diagram
from rpaforge.config import get_runs_dir
from rpaforge.core.policy import Policy, load_policy_file
from rpaforge.observability import otel
from rpaforge.queues.models import QueueItemStatus
from rpaforge.queues.sqlite_store import SQLiteQueueStore
from rpaforge.runner.logging import EventLogger, TeeEventLogger
from rpaforge.runner.supervisor import ProcessSupervisor, SupervisorConfig


def _now_utc() -> datetime:
    """Current timezone-aware instant (scheduler evaluation clock)."""
    return datetime.now(timezone.utc)


#: Cap for the adaptive idle backoff (issue #829). The issue text sketched
#: "up to 5s" but its acceptance requires a >=3x idle-poll reduction against
#: the 2s default poll interval; steady-state reduction equals
#: poll_interval / cap, so the cap is 7s to clear that bar (30/7s ~= 4.3x).
BACKOFF_MAX_SECONDS = 7.0

#: Cadence of the cooperative cancel watcher (issue #857), in seconds.
CANCEL_POLL_SECONDS = 0.5

#: Supervisor payload status -> run-record status vocabulary served by
#: ``GET /runs?status=`` (issue #857). ``pass``/``fail`` come from the
#: ExecutionStatus enum values.
_RUN_STATUS_ALIASES = {
    "pass": "success",
    "fail": "failed",
}


def backoff_delay(
    poll_interval: float,
    empty_streak: int,
    *,
    adaptive: bool = True,
    backoff_max: float = BACKOFF_MAX_SECONDS,
) -> float:
    """Sleep delay before the next poll, in seconds.

    Adaptive mode (issue #829) starts at half the base poll interval and
    grows 1.5x per consecutive empty poll, capped at ``backoff_max`` — idle
    fleets stop burning CPU/db connections while empty, and any real item
    still arrives within ``backoff_max`` + one fetch. Non-adaptive mode
    keeps the historical fixed ``poll_interval`` behaviour.
    """
    interval = max(0.1, poll_interval)
    if not adaptive:
        return interval
    base = interval / 2.0
    return min(backoff_max, base * (1.5 ** max(0, empty_streak)))


@dataclass
class QueueTaskItem:
    """A single work item fetched from the work queue."""

    item_id: str
    queue_name: str
    diagram_path: str
    variables: dict[str, Any]
    priority: str = "Normal"
    #: Optional per-item permission policy manifest path (issue #844); the
    #: daemon-level default applies when unset.
    policy_path: str | None = None


class QueueBackend:
    """Abstract interface for daemon work queue providers."""

    def fetch_next_item(self, queue_name: str) -> QueueTaskItem | None:
        raise NotImplementedError

    def mark_completed(self, item_id: str, output: Any = None) -> None:
        raise NotImplementedError

    def mark_failed(self, item_id: str, error: str) -> None:
        raise NotImplementedError

    def poll_cancel_requests(self, queue_name: str) -> list[str]:
        """Ids of running items with a pending cooperative cancel (issue #857).

        Backends without a cancel channel return an empty list — cancellation
        is then unavailable, which keeps custom backends source-compatible.
        """
        _ = queue_name
        return []


class StoreBackedQueue(QueueBackend):
    """Shared item-mapping for backends that wrap a QueueStore (issue #864)."""

    store: Any

    def fetch_next_item(self, queue_name: str) -> QueueTaskItem | None:
        item = self.store.get_next_item(queue_name, timeout_seconds=0.0)
        if not item:
            return None

        diag_path = item.payload.get("diagram_path") or item.reference or ""
        vars_dict = item.payload.get("variables", {})
        if not vars_dict and not diag_path:
            # If payload itself is variables
            vars_dict = dict(item.payload)

        raw_policy = item.payload.get("policy")
        return QueueTaskItem(
            item_id=item.id,
            queue_name=item.queue_name,
            diagram_path=diag_path,
            variables=vars_dict,
            priority=item.priority.value
            if hasattr(item.priority, "value")
            else str(item.priority),
            policy_path=raw_policy
            if isinstance(raw_policy, str) and raw_policy
            else None,
        )

    def mark_completed(self, item_id: str, output: Any = None) -> None:
        _ = output
        self.store.set_item_status(item_id, status=QueueItemStatus.SUCCESSFUL)

    def mark_failed(self, item_id: str, error: str) -> None:
        self.store.set_item_status(
            item_id,
            status=QueueItemStatus.FAILED,
            error_message=error,
            retry=True,
        )

    def poll_cancel_requests(self, queue_name: str) -> list[str]:
        getter = getattr(self.store, "get_cancel_requests", None)
        if getter is None:
            return []
        return list(getter(queue_name))


class SQLiteEmbeddedQueue(StoreBackedQueue):
    """Embedded SQLite work queue for single-node / local unattended workers."""

    def __init__(self, db_path: Path | str | None = None) -> None:
        self.store = SQLiteQueueStore(db_path=db_path)


class PostgresEmbeddedQueue(StoreBackedQueue):
    """Shared PostgreSQL work queue for multi-node deployments (issue #864).

    Items enqueued by one daemon instance are visible to every daemon
    polling the same Postgres queue; durability lives in Postgres instead
    of a local SQLite file. Construction validates the DSN eagerly (the
    store initialises its schema on connect), so a misconfigured DSN fails
    the daemon start with a typed error instead of a mid-run crash.
    """

    def __init__(self, dsn: str) -> None:
        from rpaforge.queues.postgres_store import PostgreSQLQueueStore

        self.store = PostgreSQLQueueStore(dsn)


class WorkerPool:
    """Manages worker concurrency and execution."""

    def __init__(self, concurrency: int = 1) -> None:
        self.concurrency = max(1, concurrency)
        self._executor = concurrent.futures.ThreadPoolExecutor(
            max_workers=self.concurrency, thread_name_prefix="rpaforge-worker"
        )

    def submit(
        self, fn: Callable[..., Any], *args: Any, **kwargs: Any
    ) -> concurrent.futures.Future:
        return self._executor.submit(fn, *args, **kwargs)

    def shutdown(self, wait: bool = True) -> None:
        self._executor.shutdown(wait=wait, cancel_futures=True)


class RunnerDaemon:
    """Continuous worker daemon polling a work queue."""

    def __init__(
        self,
        queue_name: str,
        backend: QueueBackend | None = None,
        concurrency: int = 1,
        poll_interval: float = 2.0,
        supervisor_config: SupervisorConfig | None = None,
        logger: EventLogger | None = None,
        max_tasks: int | None = None,
        schedule_manager: Any | None = None,
        adaptive_backoff: bool = True,
        listener: Any | None = None,
        policy: Policy | None = None,
        logs_dir: Path | str | None = None,
    ) -> None:
        self.queue_name = queue_name
        self.backend = backend or SQLiteEmbeddedQueue()
        self.concurrency = concurrency
        self.poll_interval = max(0.1, poll_interval)
        self.supervisor_config = supervisor_config or SupervisorConfig()
        self.logger = logger or EventLogger()
        #: Default permission policy for queue items without their own
        #: ``policy`` payload entry (issue #844).
        self.policy = policy
        self.max_tasks = max_tasks
        #: Optional :class:`rpaforge.runner.schedules.ScheduleManager`; when
        #: set, every polling tick first enqueues cron-scheduled runs (issue
        #: #818). Typed as Any to keep the daemon import-light.
        self.schedule_manager = schedule_manager
        #: Adaptive idle backoff between poll_interval/2 and 5s (issue #829).
        self.adaptive_backoff = adaptive_backoff
        #: Optional queue listener (e.g. PostgresQueueListener): its wakeup
        #: callback interrupts the idle sleep so NOTIFY delivery is picked up
        #: immediately instead of at the next backoff tick.
        self.listener = listener
        self._stop_event = threading.Event()
        self._wake_event = threading.Event()
        self._worker_pool = WorkerPool(concurrency=concurrency)
        self._processed_count = 0
        self._empty_streak = 0
        self._lock = threading.Lock()
        #: Directory for per-run NDJSON log files consumed by
        #: ``GET /runs/{id}/logs`` (issue #857); defaults to
        #: ``~/.rpaforge/runs/logs``.
        if logs_dir is None:
            logs_dir = get_runs_dir() / "logs"
        self.logs_dir = Path(logs_dir)
        #: Live supervisors keyed by queue item id — the cancel watcher
        #: resolves ``POST /runs/{id}/cancel`` requests against this map.
        self._active_supervisors: dict[str, ProcessSupervisor] = {}
        self._supervisors_lock = threading.Lock()

    def wake(self) -> None:
        """Interrupt the idle sleep (listener callback for NOTIFY delivery)."""
        self._wake_event.set()

    @property
    def processed_count(self) -> int:
        with self._lock:
            return self._processed_count

    def stop(self) -> None:
        """Request graceful shutdown of the daemon."""
        self._stop_event.set()

    def _cancel_watch_loop(self) -> None:
        """Poll the queue store for cancel flags and interrupt those runs.

        Runs until :meth:`stop` is requested; store errors are logged and
        retried on the next tick so a transient database hiccup never kills
        the watcher.
        """
        while not self._stop_event.is_set():
            try:
                for item_id in self.backend.poll_cancel_requests(self.queue_name):
                    with self._supervisors_lock:
                        supervisor = self._active_supervisors.get(item_id)
                    if supervisor is not None:
                        supervisor.request_cancel(
                            reason=f"cancel requested via control plane (item {item_id})"
                        )
            except Exception as err:
                self.logger.emit(
                    "log_message",
                    level="ERROR",
                    message=f"Cancel watcher error: {err}",
                )
            self._stop_event.wait(timeout=CANCEL_POLL_SECONDS)

    def run(self) -> int:
        """Run the polling loop until stopped or max_tasks reached."""
        otel.configure_from_env()
        self.logger.emit(
            "daemon_started",
            queue=self.queue_name,
            concurrency=self.concurrency,
            adaptive_backoff=self.adaptive_backoff,
        )

        listener_thread = None
        if self.listener is not None:
            listener_thread = threading.Thread(
                target=self.listener.start,
                args=(self.wake,),
                name="queue-listener",
                daemon=True,
            )
            listener_thread.start()

        # Cooperative cancel watcher (issue #857): translates store-level
        # cancel flags into supervisor.request_cancel() calls. A dedicated
        # thread keeps cancel latency independent of the adaptive backoff.
        cancel_thread = threading.Thread(
            target=self._cancel_watch_loop, name="cancel-watcher", daemon=True
        )
        cancel_thread.start()

        def handle_signal(_signum: int | None = None, _frame: Any = None) -> None:
            self.logger.emit(
                "log_message",
                level="INFO",
                message="Daemon received shutdown signal, draining workers...",
            )
            self.stop()

        previous_handlers: dict[signal.Signals, Any] = {}
        for signum in (signal.SIGINT, signal.SIGTERM):
            with contextlib.suppress(OSError, RuntimeError, ValueError):
                previous_handlers[signum] = signal.getsignal(signum)
                signal.signal(signum, handle_signal)

        active_futures: set[concurrent.futures.Future] = set()

        try:
            while not self._stop_event.is_set():
                # Cleanup finished futures
                done_futures = {f for f in active_futures if f.done()}
                active_futures -= done_futures

                if self.max_tasks is not None:
                    with self._lock:
                        if self._processed_count >= self.max_tasks:
                            break

                # Cron schedules first: enqueue due runs into the same queue.
                if self.schedule_manager is not None:
                    try:
                        self.schedule_manager.tick(_now_utc())
                    except Exception as err:
                        self.logger.emit(
                            "log_message",
                            level="ERROR",
                            message=f"Schedule evaluation error: {err}",
                        )

                # If capacity available in pool
                if len(active_futures) < self.concurrency:
                    try:
                        item = self.backend.fetch_next_item(self.queue_name)
                    except Exception as err:
                        self.logger.emit(
                            "log_message",
                            level="ERROR",
                            message=f"Queue fetch error: {err}",
                        )
                        item = None

                    # OTel queue-depth gauge (issue #846): pending = not yet
                    # succeeded/failed/dead-lettered. Best effort — backends
                    # without a stats store are skipped.
                    with contextlib.suppress(Exception):
                        store = getattr(self.backend, "store", None)
                        if store is not None and hasattr(store, "get_queue_stats"):
                            stats = store.get_queue_stats(self.queue_name)
                            otel.record_queue_depth(
                                self.queue_name,
                                int(
                                    stats.get("NEW", 0)
                                    + stats.get("IN_PROGRESS", 0)
                                    + stats.get("RETRIED", 0)
                                ),
                            )

                    if item:
                        future = self._worker_pool.submit(self._process_item, item)
                        active_futures.add(future)
                        self._empty_streak = 0
                        continue
                    # Empty poll: grow the adaptive idle backoff (issue #829).
                    self._empty_streak += 1

                delay = backoff_delay(
                    self.poll_interval,
                    self._empty_streak,
                    adaptive=self.adaptive_backoff,
                )
                # Wake immediately on NOTIFY (listener) or shutdown.
                if self._wake_event.wait(timeout=delay):
                    self._wake_event.clear()
                    self._empty_streak = 0
        finally:
            self._stop_event.set()
            if cancel_thread is not None:
                cancel_thread.join(timeout=2)
            if self.listener is not None:
                with contextlib.suppress(Exception):
                    self.listener.stop()
                if listener_thread is not None:
                    listener_thread.join(timeout=5)
            self._worker_pool.shutdown(wait=True)
            for signum, handler in previous_handlers.items():
                with contextlib.suppress(OSError, RuntimeError, ValueError):
                    signal.signal(signum, handler)

        self.logger.emit(
            "daemon_stopped",
            queue=self.queue_name,
            processed_count=self._processed_count,
        )
        return 0

    def _store(self) -> Any | None:
        """The queue store behind the backend, when it exposes one."""
        return getattr(self.backend, "store", None)

    def _process_item(self, item: QueueTaskItem) -> None:
        """Process a single queue item with the supervisor."""
        store = self._store()
        run_logger: EventLogger = self.logger
        tee: TeeEventLogger | None = None
        try:
            if not item.diagram_path or not item.diagram_path.strip():
                err_msg = "Missing diagram_path in queue item payload or reference"
                self.logger.emit(
                    "item_validation_failed",
                    queue=self.queue_name,
                    item_id=item.item_id,
                    error=err_msg,
                )
                self.backend.mark_failed(item.item_id, error=err_msg)
                return

            # serve API v2 (issue #857): per-run NDJSON log file so the
            # control plane can tail live output; run record for /runs.
            if self.logs_dir is not None:
                tee = TeeEventLogger(
                    self.logger, self.logs_dir / f"{item.item_id}.ndjson"
                )
                run_logger = tee
            if store is not None and hasattr(store, "record_run_started"):
                with contextlib.suppress(Exception):
                    store.record_run_started(item.item_id, item.queue_name)

            loaded = load_diagram(item.diagram_path)
            supervisor = ProcessSupervisor(
                config=self.supervisor_config,
                logger=run_logger,
            )
            with self._supervisors_lock:
                self._active_supervisors[item.item_id] = supervisor
            policy = self.policy
            if item.policy_path:
                policy = load_policy_file(item.policy_path)
            var_overrides = [f"{k}={v}" for k, v in item.variables.items()]
            code, payload = supervisor.execute(
                loaded, values=var_overrides, policy=policy
            )
            if store is not None and hasattr(store, "record_run_finished"):
                with contextlib.suppress(Exception):
                    raw_status = str(payload.get("status", "failed"))
                    store.record_run_finished(
                        item.item_id,
                        run_id=payload.get("run_id"),
                        diagram_path=item.diagram_path,
                        status=_RUN_STATUS_ALIASES.get(raw_status, raw_status),
                        exit_code=int(code),
                        audit_path=payload.get("audit_path"),
                        error_message=payload.get("error") or payload.get("message"),
                    )
            if code == 0:
                self.backend.mark_completed(item.item_id, output=payload)
            else:
                err_msg = (
                    payload.get("error") or payload.get("message") or "Execution failed"
                )
                self.backend.mark_failed(item.item_id, error=str(err_msg))
        except Exception as err:
            self.backend.mark_failed(item.item_id, error=str(err))
        finally:
            with self._supervisors_lock:
                self._active_supervisors.pop(item.item_id, None)
            if tee is not None:
                tee.close()
            with self._lock:
                self._processed_count += 1
