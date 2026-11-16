"""PostgreSQL-backed transactional work queue store using FOR UPDATE SKIP LOCKED."""

from __future__ import annotations

import contextlib
import json
import logging
import threading
import time
import uuid
from collections.abc import Callable, Iterator
from datetime import datetime, timedelta, timezone
from typing import Any

from rpaforge.queues.models import QueueItem, QueueItemStatus, QueuePriority

logger = logging.getLogger("rpaforge.queues.postgres")


#: NOTIFY channel every enqueue pings so a LISTENing daemon wakes instantly
#: instead of waiting out its poll interval (issue #829).
NOTIFY_CHANNEL = "rpaforge_queues"

#: Explicit work_queue_items column list — positional contract shared by every
#: read in this module (``SELECT *`` is avoided so appending columns is safe).
_ITEM_COLUMNS = (
    "SELECT id, queue_name, reference, priority, payload_json, status, "
    "retry_count, max_retries, lock_expires_at, defer_until, "
    "error_message, created_at, updated_at FROM work_queue_items"
)

#: run_records column list (issue #887) — same positional contract as
#: :class:`SQLiteQueueStore`'s runs surface.
_RUN_COLUMNS = (
    "SELECT item_id, queue_name, run_id, diagram_path, status, exit_code, "
    "started_at, finished_at, audit_path, error_message FROM run_records"
)


def _ts_to_iso(value: Any) -> str | None:
    """Normalize a TIMESTAMPTZ read back into the ISO string sqlite serves."""
    if value is None:
        return None
    if isinstance(value, datetime):
        aware = value.astimezone(timezone.utc) if value.tzinfo is not None else value
        return aware.isoformat()
    rendered: str = f"{value}"
    return rendered


class PostgreSQLQueueStore:
    """High-concurrency PostgreSQL queue store with row-level locks (SKIP LOCKED)."""

    def __init__(self, dsn_or_connection: Any) -> None:
        self.dsn_or_connection = dsn_or_connection
        self._init_db()

    def _get_connection(self) -> Any:
        if isinstance(self.dsn_or_connection, str):
            try:
                import psycopg2
                import psycopg2.extras

                conn = psycopg2.connect(self.dsn_or_connection)
                conn.autocommit = False
                return conn
            except ImportError:
                import psycopg

                conn = psycopg.connect(self.dsn_or_connection, autocommit=False)
                return conn
        return self.dsn_or_connection

    @contextlib.contextmanager
    def _connection(self) -> Iterator[Any]:
        is_dsn = isinstance(self.dsn_or_connection, str)
        conn = self._get_connection()
        try:
            yield conn
        finally:
            if is_dsn:
                with contextlib.suppress(Exception):
                    conn.close()

    def _init_db(self) -> None:
        try:
            with self._connection() as conn:
                with conn.cursor() as cur:
                    cur.execute(
                        """
                        CREATE TABLE IF NOT EXISTS work_queue_items (
                            id VARCHAR(64) PRIMARY KEY,
                            queue_name VARCHAR(128) NOT NULL,
                            reference VARCHAR(256),
                            priority VARCHAR(32) NOT NULL,
                            payload_json TEXT NOT NULL,
                            status VARCHAR(32) NOT NULL,
                            retry_count INT DEFAULT 0,
                            max_retries INT DEFAULT 3,
                            lock_expires_at TIMESTAMPTZ,
                            defer_until TIMESTAMPTZ,
                            error_message TEXT,
                            created_at TIMESTAMPTZ NOT NULL,
                            updated_at TIMESTAMPTZ NOT NULL
                        );
                        CREATE INDEX IF NOT EXISTS idx_pg_queue_fetch ON work_queue_items (queue_name, status, priority, created_at);
                        CREATE INDEX IF NOT EXISTS idx_pg_queue_ref ON work_queue_items (queue_name, reference);
                        """
                    )
                # serve API v2 (issues #857, #887): cooperative cancel flag
                # for items already picked up by a daemon. Kept out of the
                # base CREATE TABLE so both fresh and migrated databases
                # share one column order.
                with contextlib.suppress(Exception):
                    cur.execute(
                        """
                        ALTER TABLE work_queue_items
                        ADD COLUMN IF NOT EXISTS cancel_requested
                        BOOLEAN NOT NULL DEFAULT FALSE
                        """
                    )
                # Runs surface (issue #887): mirrors the sqlite run_records
                # table so serve answers /runs* from either backend.
                cur.execute(
                    """
                    CREATE TABLE IF NOT EXISTS run_records (
                        item_id VARCHAR(64) PRIMARY KEY,
                        queue_name VARCHAR(128) NOT NULL,
                        run_id VARCHAR(64),
                        diagram_path TEXT,
                        status VARCHAR(32) NOT NULL,
                        exit_code INT,
                        started_at TIMESTAMPTZ NOT NULL,
                        finished_at TIMESTAMPTZ,
                        audit_path TEXT,
                        error_message TEXT
                    );
                    CREATE INDEX IF NOT EXISTS idx_pg_run_records_queue
                        ON run_records (queue_name, started_at DESC);
                    """
                )
                conn.commit()
        except Exception as err:
            logger.debug("Could not initialize PostgreSQL queue schema: %s", err)

    def _row_to_item(self, row: Any) -> QueueItem:
        payload = {}
        if row[4]:
            if isinstance(row[4], dict):
                payload = row[4]
            else:
                with contextlib.suppress(Exception):
                    payload = json.loads(row[4])
        return QueueItem(
            id=str(row[0]),
            queue_name=str(row[1]),
            reference=row[2],
            priority=QueuePriority(row[3]),
            payload=payload,
            status=QueueItemStatus(row[5]),
            retry_count=int(row[6]),
            max_retries=int(row[7]),
            lock_expires_at=row[8].isoformat()
            if hasattr(row[8], "isoformat")
            else (str(row[8]) if row[8] else None),
            defer_until=row[9].isoformat()
            if hasattr(row[9], "isoformat")
            else (str(row[9]) if row[9] else None),
            error_message=row[10],
            created_at=row[11].isoformat()
            if hasattr(row[11], "isoformat")
            else str(row[11]),
            updated_at=row[12].isoformat()
            if hasattr(row[12], "isoformat")
            else str(row[12]),
        )

    def add_item(
        self,
        queue_name: str,
        payload: dict[str, Any],
        reference: str | None = None,
        priority: QueuePriority | str = QueuePriority.NORMAL,
        defer_until: str | None = None,
        max_retries: int = 3,
    ) -> QueueItem:
        prio_enum = QueuePriority(priority) if isinstance(priority, str) else priority
        item_id = str(uuid.uuid4())
        now = datetime.now(timezone.utc).isoformat()
        payload_str = json.dumps(payload, ensure_ascii=False)

        with self._connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO work_queue_items (
                        id, queue_name, reference, priority, payload_json,
                        status, retry_count, max_retries, lock_expires_at,
                        defer_until, error_message, created_at, updated_at
                    ) VALUES (%s, %s, %s, %s, %s, %s, 0, %s, NULL, %s, NULL, %s, %s)
                    """,
                    (
                        item_id,
                        queue_name,
                        reference,
                        prio_enum.value,
                        payload_str,
                        QueueItemStatus.NEW.value,
                        max_retries,
                        defer_until,
                        now,
                        now,
                    ),
                )
            with contextlib.suppress(Exception):
                cur.execute(f"NOTIFY {NOTIFY_CHANNEL}, %s", (queue_name,))
            conn.commit()

        return QueueItem(
            id=item_id,
            queue_name=queue_name,
            payload=payload,
            reference=reference,
            priority=prio_enum,
            status=QueueItemStatus.NEW,
            retry_count=0,
            max_retries=max_retries,
            defer_until=defer_until,
            created_at=now,
            updated_at=now,
        )

    def add_bulk_items(
        self,
        queue_name: str,
        items: list[dict[str, Any]],
    ) -> list[QueueItem]:
        created_items: list[QueueItem] = []
        now = datetime.now(timezone.utc).isoformat()
        records = []
        for raw in items:
            item_id = str(uuid.uuid4())
            payload = raw.get("payload", {})
            ref = raw.get("reference")
            prio = raw.get("priority", "Normal")
            prio_enum = QueuePriority(prio) if isinstance(prio, str) else prio
            max_retries = int(raw.get("max_retries", 3))
            defer = raw.get("defer_until")

            records.append(
                (
                    item_id,
                    queue_name,
                    ref,
                    prio_enum.value,
                    json.dumps(payload, ensure_ascii=False),
                    QueueItemStatus.NEW.value,
                    max_retries,
                    defer,
                    now,
                    now,
                )
            )
            created_items.append(
                QueueItem(
                    id=item_id,
                    queue_name=queue_name,
                    payload=payload,
                    reference=ref,
                    priority=prio_enum,
                    status=QueueItemStatus.NEW,
                    retry_count=0,
                    max_retries=max_retries,
                    defer_until=defer,
                    created_at=now,
                    updated_at=now,
                )
            )

        with self._connection() as conn:
            with conn.cursor() as cur:
                cur.executemany(
                    """
                    INSERT INTO work_queue_items (
                        id, queue_name, reference, priority, payload_json,
                        status, retry_count, max_retries, lock_expires_at,
                        defer_until, error_message, created_at, updated_at
                    ) VALUES (%s, %s, %s, %s, %s, %s, 0, %s, NULL, %s, NULL, %s, %s)
                    """,
                    records,
                )
                with contextlib.suppress(Exception):
                    cur.execute(f"NOTIFY {NOTIFY_CHANNEL}, %s", (queue_name,))
            conn.commit()

        return created_items

    def get_next_item(
        self,
        queue_name: str,
        timeout_seconds: float = 30.0,
        lock_timeout: float = 300.0,
    ) -> QueueItem | None:
        deadline = time.time() + max(0.0, timeout_seconds)

        while True:
            with self._connection() as conn:
                with conn.cursor() as cur:
                    now = datetime.now(timezone.utc)
                    # Release expired locks
                    cur.execute(
                        """
                        UPDATE work_queue_items
                        SET status = 'Retried', lock_expires_at = NULL, updated_at = %s
                        WHERE queue_name = %s AND status = 'InProgress' AND lock_expires_at < %s
                        """,
                        (now, queue_name, now),
                    )

                    # Lock next item with FOR UPDATE SKIP LOCKED
                    cur.execute(
                        """
                        SELECT id, queue_name, reference, priority, payload_json, status,
                               retry_count, max_retries, lock_expires_at, defer_until,
                               error_message, created_at, updated_at
                        FROM work_queue_items
                        WHERE queue_name = %s
                          AND status IN ('New', 'Retried')
                          AND (defer_until IS NULL OR defer_until <= %s)
                        ORDER BY CASE priority
                            WHEN 'High' THEN 1
                            WHEN 'Normal' THEN 2
                            WHEN 'Low' THEN 3
                            ELSE 4 END, created_at ASC
                        LIMIT 1
                        FOR UPDATE SKIP LOCKED
                        """,
                        (queue_name, now),
                    )
                    row = cur.fetchone()
                    if row:
                        item_id = row[0]
                        lock_exp = now + timedelta(seconds=lock_timeout)
                        cur.execute(
                            """
                            UPDATE work_queue_items
                            SET status = 'InProgress', lock_expires_at = %s, updated_at = %s
                            WHERE id = %s
                            """,
                            (lock_exp, now, item_id),
                        )
                        conn.commit()

                        payload = json.loads(row[4]) if row[4] else {}
                        return QueueItem(
                            id=row[0],
                            queue_name=row[1],
                            reference=row[2],
                            priority=QueuePriority(row[3]),
                            payload=payload,
                            status=QueueItemStatus.IN_PROGRESS,
                            retry_count=row[6],
                            max_retries=row[7],
                            lock_expires_at=lock_exp.isoformat(),
                            defer_until=row[9].isoformat() if row[9] else None,
                            error_message=row[10],
                            created_at=row[11].isoformat()
                            if hasattr(row[11], "isoformat")
                            else str(row[11]),
                            updated_at=now.isoformat(),
                        )
                conn.commit()

            if time.time() >= deadline:
                break
            time.sleep(0.2)

        return None

    def set_item_status(
        self,
        item_id: str,
        status: QueueItemStatus | str = QueueItemStatus.SUCCESSFUL,
        error_message: str | None = None,
        retry: bool = True,
    ) -> QueueItem:
        st_enum = QueueItemStatus(status) if isinstance(status, str) else status
        now = datetime.now(timezone.utc)

        with self._connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT id, queue_name, reference, priority, payload_json, status,
                           retry_count, max_retries, lock_expires_at, defer_until,
                           error_message, created_at, updated_at
                    FROM work_queue_items WHERE id = %s
                    """,
                    (item_id,),
                )
                row = cur.fetchone()
                if not row:
                    raise ValueError(f"Queue item with ID '{item_id}' not found")

                retry_count = int(row[6])
                max_retries = int(row[7])
                next_status = st_enum.value
                defer_until = None

                if st_enum == QueueItemStatus.FAILED:
                    if retry and (retry_count + 1 < max_retries):
                        retry_count += 1
                        next_status = QueueItemStatus.RETRIED.value
                        backoff = min(3600, (2**retry_count) * 2)
                        defer_until = now + timedelta(seconds=backoff)
                    else:
                        next_status = QueueItemStatus.DEAD_LETTER.value

                cur.execute(
                    """
                    UPDATE work_queue_items
                    SET status = %s, retry_count = %s, error_message = %s,
                        lock_expires_at = NULL, defer_until = %s, updated_at = %s
                    WHERE id = %s
                    """,
                    (
                        next_status,
                        retry_count,
                        error_message,
                        defer_until,
                        now,
                        item_id,
                    ),
                )
                conn.commit()

                cur.execute(
                    """
                    SELECT id, queue_name, reference, priority, payload_json, status,
                           retry_count, max_retries, lock_expires_at, defer_until,
                           error_message, created_at, updated_at
                    FROM work_queue_items WHERE id = %s
                    """,
                    (item_id,),
                )
                updated_row = cur.fetchone()
                if updated_row is None:
                    raise RuntimeError(f"Queue item '{item_id}' not found after update")
                return self._row_to_item(updated_row)

    def postpone_item(
        self,
        item_id: str,
        defer_seconds: float = 300.0,
    ) -> QueueItem:
        now = datetime.now(timezone.utc)
        defer_time = now + timedelta(seconds=defer_seconds)

        with self._connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT id FROM work_queue_items WHERE id = %s",
                    (item_id,),
                )
                row = cur.fetchone()
                if not row:
                    raise ValueError(f"Queue item with ID '{item_id}' not found")

                cur.execute(
                    """
                    UPDATE work_queue_items
                    SET status = 'New', lock_expires_at = NULL, defer_until = %s, updated_at = %s
                    WHERE id = %s
                    """,
                    (defer_time, now, item_id),
                )
                conn.commit()

                cur.execute(
                    """
                    SELECT id, queue_name, reference, priority, payload_json, status,
                           retry_count, max_retries, lock_expires_at, defer_until,
                           error_message, created_at, updated_at
                    FROM work_queue_items WHERE id = %s
                    """,
                    (item_id,),
                )
                updated = cur.fetchone()
                if updated is None:
                    raise RuntimeError(f"Queue item '{item_id}' not found after update")
                return self._row_to_item(updated)

    def get_queue_stats(self, queue_name: str) -> dict[str, int]:
        with self._connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT status, COUNT(*) as count
                    FROM work_queue_items
                    WHERE queue_name = %s
                    GROUP BY status
                    """,
                    (queue_name,),
                )
                rows = cur.fetchall()

        stats = {
            QueueItemStatus.NEW.value: 0,
            QueueItemStatus.IN_PROGRESS.value: 0,
            QueueItemStatus.SUCCESSFUL.value: 0,
            QueueItemStatus.FAILED.value: 0,
            QueueItemStatus.RETRIED.value: 0,
            QueueItemStatus.DEAD_LETTER.value: 0,
            QueueItemStatus.CANCELLED.value: 0,
        }
        for row in rows:
            stats[row[0]] = int(row[1])
        return stats

    def requeue_dead_letter(
        self,
        queue_name: str,
        item_id: str | None = None,
    ) -> int:
        now = datetime.now(timezone.utc)
        with self._connection() as conn:
            with conn.cursor() as cur:
                if item_id:
                    cur.execute(
                        """
                        UPDATE work_queue_items
                        SET status = 'New', retry_count = 0, error_message = NULL,
                            lock_expires_at = NULL, defer_until = NULL, updated_at = %s
                        WHERE queue_name = %s AND id = %s AND status = 'DeadLetter'
                        """,
                        (now, queue_name, item_id),
                    )
                else:
                    cur.execute(
                        """
                        UPDATE work_queue_items
                        SET status = 'New', retry_count = 0, error_message = NULL,
                            lock_expires_at = NULL, defer_until = NULL, updated_at = %s
                        WHERE queue_name = %s AND status = 'DeadLetter'
                        """,
                        (now, queue_name),
                    )
                conn.commit()
                return int(cur.rowcount or 0)

    def list_items(
        self,
        queue_name: str,
        limit: int = 20,
        status: str | None = None,
    ) -> list[QueueItem]:
        """Return recent items of a queue, newest first (issue #877).

        With ``status`` set, only items in that status are returned.
        """
        bounded_limit = max(1, min(int(limit), 100))
        with self._connection() as conn:
            with conn.cursor() as cur:
                if status:
                    cur.execute(
                        """
                        SELECT * FROM work_queue_items
                        WHERE queue_name = %s AND status = %s
                        ORDER BY created_at DESC, id DESC
                        LIMIT %s
                        """,
                        (queue_name, status, bounded_limit),
                    )
                else:
                    cur.execute(
                        """
                        SELECT * FROM work_queue_items
                        WHERE queue_name = %s
                        ORDER BY created_at DESC, id DESC
                        LIMIT %s
                        """,
                        (queue_name, bounded_limit),
                    )
                rows = cur.fetchall()
        return [self._row_to_item(row) for row in rows]

    # -- Read/cancel surface (issue #854 parity) ------------------------------

    def get_item(self, item_id: str) -> QueueItem:
        """Return one item by id; raises ``ValueError`` when missing."""
        with self._connection() as conn:
            with conn.cursor() as cur:
                cur.execute(f"{_ITEM_COLUMNS} WHERE id = %s", (item_id,))
                row = cur.fetchone()
        if row is None:
            raise ValueError(f"Queue item '{item_id}' not found")
        return self._row_to_item(row)

    def cancel_item(self, item_id: str, reason: str = "cancelled") -> QueueItem:
        """Cancel a queued (``New``/``Retried``) item before pickup.

        Same semantics as :meth:`SQLiteQueueStore.cancel_item`: items already
        picked up (``InProgress``) or finished cannot be cancelled — the daemon
        runs them to completion.
        """
        now = datetime.now(timezone.utc)
        with self._connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    UPDATE work_queue_items
                    SET status = %s, error_message = %s, lock_expires_at = NULL,
                        defer_until = NULL, updated_at = %s
                    WHERE id = %s AND status IN ('New', 'Retried')
                    """,
                    (QueueItemStatus.CANCELLED.value, reason, now, item_id),
                )
                if cur.rowcount == 0:
                    cur.execute(
                        "SELECT status FROM work_queue_items WHERE id = %s",
                        (item_id,),
                    )
                    existing = cur.fetchone()
                    if existing is None:
                        raise ValueError(f"Queue item '{item_id}' not found")
                    raise ValueError(
                        f"Item '{item_id}' cannot be cancelled from status "
                        f"'{existing[0]}'"
                    )
                conn.commit()
                cur.execute(f"{_ITEM_COLUMNS} WHERE id = %s", (item_id,))
                row = cur.fetchone()
        return self._row_to_item(row)

    def request_cancel(
        self, item_id: str, reason: str = "cancel requested"
    ) -> QueueItem:
        """Request cooperative cancellation of a running (``InProgress``) item.

        Sets the ``cancel_requested`` flag without changing the item status;
        the owning daemon's cancel watcher picks it up. Same semantics as
        :meth:`SQLiteQueueStore.request_cancel`.
        """
        now = datetime.now(timezone.utc)
        with self._connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    UPDATE work_queue_items
                    SET cancel_requested = TRUE, error_message = %s, updated_at = %s
                    WHERE id = %s AND status = 'InProgress'
                    """,
                    (reason, now, item_id),
                )
                if cur.rowcount == 0:
                    cur.execute(
                        "SELECT status FROM work_queue_items WHERE id = %s",
                        (item_id,),
                    )
                    existing = cur.fetchone()
                    if existing is None:
                        raise ValueError(f"Queue item '{item_id}' not found")
                    raise ValueError(
                        f"Item '{item_id}' is not running (status "
                        f"'{existing[0]}'); use cancel_item for queued items"
                    )
                conn.commit()
                cur.execute(f"{_ITEM_COLUMNS} WHERE id = %s", (item_id,))
                row = cur.fetchone()
        return self._row_to_item(row)

    def get_cancel_requests(self, queue_name: str) -> list[str]:
        """Return ids of running items with a pending cooperative cancel."""
        with self._connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT id FROM work_queue_items
                    WHERE queue_name = %s AND status = 'InProgress'
                          AND cancel_requested
                    """,
                    (queue_name,),
                )
                rows = cur.fetchall()
        return [str(row[0]) for row in rows]

    # -- Runs surface for serve API v2 (issues #857, #887) --------------------

    def record_run_started(self, item_id: str, queue_name: str) -> None:
        """Create a ``running`` run record when the daemon picks an item up.

        Re-runs of a requeued item reset the record to a fresh running state
        (the sqlite store gets the same via ``INSERT OR REPLACE``).
        """
        with self._connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO run_records (item_id, queue_name, status, started_at)
                    VALUES (%s, %s, 'running', %s)
                    ON CONFLICT (item_id) DO UPDATE SET
                        queue_name = EXCLUDED.queue_name,
                        status = 'running',
                        started_at = EXCLUDED.started_at,
                        finished_at = NULL,
                        exit_code = NULL,
                        run_id = NULL,
                        diagram_path = NULL,
                        audit_path = NULL,
                        error_message = NULL
                    """,
                    (item_id, queue_name, datetime.now(timezone.utc)),
                )
            conn.commit()

    def record_run_finished(
        self,
        item_id: str,
        *,
        run_id: str | None = None,
        diagram_path: str | None = None,
        status: str,
        exit_code: int | None = None,
        audit_path: str | None = None,
        error_message: str | None = None,
    ) -> None:
        """Finalize the run record for ``item_id`` with execution results."""
        with self._connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    UPDATE run_records
                    SET run_id = %s, diagram_path = %s, status = %s,
                        exit_code = %s, finished_at = %s, audit_path = %s,
                        error_message = %s
                    WHERE item_id = %s
                    """,
                    (
                        run_id,
                        diagram_path,
                        status,
                        exit_code,
                        datetime.now(timezone.utc),
                        audit_path,
                        error_message,
                        item_id,
                    ),
                )
            conn.commit()

    def _run_row_to_doc(self, row: Any) -> dict[str, Any]:
        return {
            "item_id": row[0],
            "queue_name": row[1],
            "run_id": row[2],
            "diagram_path": row[3],
            "status": row[4],
            "exit_code": row[5],
            "started_at": _ts_to_iso(row[6]),
            "finished_at": _ts_to_iso(row[7]),
            "audit_path": row[8],
            "error": row[9],
        }

    def list_runs(
        self,
        queue_name: str,
        limit: int = 20,
        status: str | None = None,
    ) -> list[dict[str, Any]]:
        """Return recent run records of a queue, newest started first.

        ``status`` filters by run status (``running``, ``success``, ``failed``,
        ``cancelled``); an unknown value raises ``ValueError``.
        """
        if status is not None and not status.strip():
            status = None
        query = f"{_RUN_COLUMNS} WHERE queue_name = %s"
        params: list[Any] = [queue_name]
        if status is not None:
            query += " AND status = %s"
            params.append(status.strip())
        bounded_limit = max(1, min(int(limit), 100))
        query += " ORDER BY started_at DESC, item_id DESC LIMIT %s"
        params.append(bounded_limit)
        with self._connection() as conn:
            with conn.cursor() as cur:
                cur.execute(query, tuple(params))
                rows = cur.fetchall()
        return [self._run_row_to_doc(row) for row in rows]

    def get_run(self, item_id: str) -> dict[str, Any] | None:
        """Return one run record, or ``None`` when the item never started."""
        with self._connection() as conn:
            with conn.cursor() as cur:
                cur.execute(f"{_RUN_COLUMNS} WHERE item_id = %s", (item_id,))
                row = cur.fetchone()
        return self._run_row_to_doc(row) if row is not None else None


class PostgresQueueListener:
    """LISTEN-based wakeup source for the daemon (issue #829).

    Holds a dedicated connection, subscribes to :data:`NOTIFY_CHANNEL`, and
    invokes the given callback with the notified queue name as soon as an
    enqueuer commits (``NOTIFY`` in :meth:`PostgreSQLQueueStore.add_item`).
    The daemon keeps its regular polling as a fallback — the listener only
    shortens the perceived latency from ``backoff_max`` to milliseconds.

    Supports both psycopg2 (``conn.poll()`` + select on the socket fd) and
    psycopg 3 (``conn.notifies(timeout=...)`` generator). All listener
    failures are swallowed and retried with a short reconnect delay: a
    broken notification path must never take the daemon down.
    """

    def __init__(self, dsn: str, reconnect_delay: float = 2.0) -> None:
        self.dsn = dsn
        self.reconnect_delay = reconnect_delay
        self._stop = threading.Event()

    def start(self, on_notify: Callable[[str], None]) -> None:
        """Block the calling thread delivering notifications to ``on_notify``.

        Intended to run in a daemon thread (see RunnerDaemon); ``stop()``
        breaks the loop from another thread.
        """
        while not self._stop.is_set():
            conn = None
            try:
                conn = self._connect()
                self._consume(conn, on_notify)
            except Exception as exc:  # noqa: BLE001 - listener must survive
                logger.warning("Queue listener error: %s", exc)
            finally:
                if conn is not None:
                    with contextlib.suppress(Exception):
                        conn.close()
            if not self._stop.is_set():
                self._stop.wait(self.reconnect_delay)

    def stop(self) -> None:
        """Signal the listening loop to exit."""
        self._stop.set()

    def _connect(self) -> Any:
        """Open a dedicated autocommit connection and subscribe."""
        try:
            import psycopg2

            conn = psycopg2.connect(self.dsn)
            conn.autocommit = True
        except ImportError:
            import psycopg

            conn = psycopg.connect(self.dsn, autocommit=True)
        with conn.cursor() as cur:
            cur.execute(f"LISTEN {NOTIFY_CHANNEL}")
        return conn

    def _consume(self, conn: Any, on_notify: Callable[[str], None]) -> None:
        """Deliver notifications until stopped or the connection drops."""
        if hasattr(conn, "poll"):  # psycopg2
            import select

            while not self._stop.is_set():
                if conn.isclosed():
                    raise RuntimeError("listener connection closed")
                if select.select([conn], [], [], 0.5)[0]:
                    conn.poll()
                    while conn.notifies:
                        notification = conn.notifies.popleft()
                        on_notify(str(getattr(notification, "payload", "") or ""))
        else:  # psycopg 3
            while not self._stop.is_set():
                for notification in conn.notifies(timeout=0.5):
                    on_notify(str(notification.payload or ""))
