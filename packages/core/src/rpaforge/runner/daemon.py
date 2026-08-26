"""Worker daemon for background execution and queue polling."""

from __future__ import annotations

import concurrent.futures
import contextlib
import signal
import threading
import time
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from rpaforge.cli.run import load_diagram
from rpaforge.queues.models import QueueItemStatus
from rpaforge.queues.sqlite_store import SQLiteQueueStore
from rpaforge.runner.logging import EventLogger
from rpaforge.runner.supervisor import ProcessSupervisor, SupervisorConfig


@dataclass
class QueueTaskItem:
    """A single work item fetched from the work queue."""

    item_id: str
    queue_name: str
    diagram_path: str
    variables: dict[str, Any]
    priority: str = "Normal"


class QueueBackend:
    """Abstract interface for daemon work queue providers."""

    def fetch_next_item(self, queue_name: str) -> QueueTaskItem | None:
        raise NotImplementedError

    def mark_completed(self, item_id: str, output: Any = None) -> None:
        raise NotImplementedError

    def mark_failed(self, item_id: str, error: str) -> None:
        raise NotImplementedError


class SQLiteEmbeddedQueue(QueueBackend):
    """Embedded SQLite work queue for single-node / local unattended workers."""

    def __init__(self, db_path: Path | str | None = None) -> None:
        self.store = SQLiteQueueStore(db_path=db_path)

    def fetch_next_item(self, queue_name: str) -> QueueTaskItem | None:
        item = self.store.get_next_item(queue_name, timeout_seconds=0.0)
        if not item:
            return None

        diag_path = item.payload.get("diagram_path") or item.reference or ""
        vars_dict = item.payload.get("variables", {})
        if not vars_dict and not diag_path:
            # If payload itself is variables
            vars_dict = dict(item.payload)

        return QueueTaskItem(
            item_id=item.id,
            queue_name=item.queue_name,
            diagram_path=diag_path,
            variables=vars_dict,
            priority=item.priority.value
            if hasattr(item.priority, "value")
            else str(item.priority),
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
    ) -> None:
        self.queue_name = queue_name
        self.backend = backend or SQLiteEmbeddedQueue()
        self.concurrency = concurrency
        self.poll_interval = max(0.1, poll_interval)
        self.supervisor_config = supervisor_config or SupervisorConfig()
        self.logger = logger or EventLogger()
        self.max_tasks = max_tasks
        self._stop_event = threading.Event()
        self._worker_pool = WorkerPool(concurrency=concurrency)
        self._processed_count = 0
        self._lock = threading.Lock()

    @property
    def processed_count(self) -> int:
        with self._lock:
            return self._processed_count

    def stop(self) -> None:
        """Request graceful shutdown of the daemon."""
        self._stop_event.set()

    def run(self) -> int:
        """Run the polling loop until stopped or max_tasks reached."""
        self.logger.emit(
            "daemon_started",
            queue=self.queue_name,
            concurrency=self.concurrency,
        )

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

                    if item:
                        future = self._worker_pool.submit(self._process_item, item)
                        active_futures.add(future)
                        continue

                time.sleep(self.poll_interval)
        finally:
            self._stop_event.set()
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

    def _process_item(self, item: QueueTaskItem) -> None:
        """Process a single queue item with the supervisor."""
        try:
            loaded = load_diagram(item.diagram_path)
            supervisor = ProcessSupervisor(
                config=self.supervisor_config,
                logger=self.logger,
            )
            var_overrides = [f"{k}={v}" for k, v in item.variables.items()]
            code, payload = supervisor.execute(loaded, values=var_overrides)
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
            with self._lock:
                self._processed_count += 1
