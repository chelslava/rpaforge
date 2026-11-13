"""SQLite-backed transactional work queue store."""

from __future__ import annotations

import contextlib
import json
import sqlite3
import threading
import time
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from rpaforge.config import get_queues_dir
from rpaforge.queues.models import QueueItem, QueueItemStatus, QueuePriority


class SQLiteQueueStore:
    """Zero-configuration local embedded queue store using SQLite with WAL mode."""

    def __init__(self, db_path: Path | str | None = None) -> None:
        if db_path is None:
            base_dir = get_queues_dir()
            base_dir.mkdir(parents=True, exist_ok=True)
            self.db_path = base_dir / "work_queues.db"
        else:
            self.db_path = Path(db_path)
            self.db_path.parent.mkdir(parents=True, exist_ok=True)

        self._lock = threading.Lock()
        self._init_db()

    def _get_connection(self) -> sqlite3.Connection:
        conn = sqlite3.connect(
            str(self.db_path),
            timeout=30.0,
            isolation_level="DEFERRED",
        )
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode=WAL;")
        conn.execute("PRAGMA busy_timeout=5000;")
        return conn

    def _init_db(self) -> None:
        with self._lock, self._get_connection() as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS work_queue_items (
                    id TEXT PRIMARY KEY,
                    queue_name TEXT NOT NULL,
                    reference TEXT,
                    priority TEXT NOT NULL,
                    payload_json TEXT NOT NULL,
                    status TEXT NOT NULL,
                    retry_count INTEGER DEFAULT 0,
                    max_retries INTEGER DEFAULT 3,
                    lock_expires_at TEXT,
                    defer_until TEXT,
                    error_message TEXT,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                )
                """
            )
            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_queue_fetch ON work_queue_items (queue_name, status, priority, created_at)"
            )
            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_queue_ref ON work_queue_items (queue_name, reference)"
            )
            # serve API v2 (issue #857): cooperative cancel flag for items
            # already picked up by a daemon. Existing databases get the
            # column via a guarded migration.
            with contextlib.suppress(sqlite3.OperationalError):
                conn.execute(
                    "ALTER TABLE work_queue_items ADD COLUMN cancel_requested "
                    "INTEGER NOT NULL DEFAULT 0"
                )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS run_records (
                    item_id TEXT PRIMARY KEY,
                    queue_name TEXT NOT NULL,
                    run_id TEXT,
                    diagram_path TEXT,
                    status TEXT NOT NULL,
                    exit_code INTEGER,
                    started_at TEXT NOT NULL,
                    finished_at TEXT,
                    audit_path TEXT,
                    error_message TEXT
                )
                """
            )
            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_run_records_queue "
                "ON run_records (queue_name, started_at DESC)"
            )
            conn.commit()

    def _now_iso(self) -> str:
        return datetime.now(timezone.utc).isoformat()

    def _row_to_item(self, row: sqlite3.Row) -> QueueItem:
        payload = {}
        if row["payload_json"]:
            with contextlib.suppress(Exception):
                payload = json.loads(row["payload_json"])
        return QueueItem(
            id=row["id"],
            queue_name=row["queue_name"],
            reference=row["reference"],
            priority=QueuePriority(row["priority"]),
            payload=payload,
            status=QueueItemStatus(row["status"]),
            retry_count=row["retry_count"],
            max_retries=row["max_retries"],
            lock_expires_at=row["lock_expires_at"],
            defer_until=row["defer_until"],
            error_message=row["error_message"],
            created_at=row["created_at"],
            updated_at=row["updated_at"],
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
        """Add a single item to the queue."""
        prio_enum = QueuePriority(priority) if isinstance(priority, str) else priority
        item_id = str(uuid.uuid4())
        now = self._now_iso()
        payload_str = json.dumps(payload, ensure_ascii=False)

        with self._lock, self._get_connection() as conn:
            conn.execute(
                """
                INSERT INTO work_queue_items (
                    id, queue_name, reference, priority, payload_json,
                    status, retry_count, max_retries, lock_expires_at,
                    defer_until, error_message, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, 0, ?, NULL, ?, NULL, ?, ?)
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
        """Add multiple items atomically to the queue."""
        created_items: list[QueueItem] = []
        now = self._now_iso()

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

        with self._lock, self._get_connection() as conn:
            conn.executemany(
                """
                INSERT INTO work_queue_items (
                    id, queue_name, reference, priority, payload_json,
                    status, retry_count, max_retries, lock_expires_at,
                    defer_until, error_message, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, 0, ?, NULL, ?, NULL, ?, ?)
                """,
                records,
            )
            conn.commit()

        return created_items

    def _recover_stale_locks(self, conn: sqlite3.Connection, queue_name: str) -> None:
        """Release expired InProgress locks back to Retried status."""
        now = self._now_iso()
        conn.execute(
            """
            UPDATE work_queue_items
            SET status = 'Retried', lock_expires_at = NULL, updated_at = ?
            WHERE queue_name = ? AND status = 'InProgress' AND lock_expires_at IS NOT NULL AND lock_expires_at < ?
            """,
            (now, queue_name, now),
        )

    def get_next_item(
        self,
        queue_name: str,
        timeout_seconds: float = 30.0,
        lock_timeout: float = 300.0,
    ) -> QueueItem | None:
        """Fetch and lock the next eligible item."""
        deadline = time.time() + max(0.0, timeout_seconds)

        while True:
            with self._lock, self._get_connection() as conn:
                self._recover_stale_locks(conn, queue_name)

                now = self._now_iso()
                cur = conn.cursor()
                cur.execute(
                    """
                    SELECT id, queue_name, reference, priority, payload_json, status,
                           retry_count, max_retries, lock_expires_at, defer_until,
                           error_message, created_at, updated_at
                    FROM work_queue_items
                    WHERE queue_name = ?
                      AND status IN ('New', 'Retried')
                      AND (defer_until IS NULL OR defer_until <= ?)
                    ORDER BY CASE priority
                        WHEN 'High' THEN 1
                        WHEN 'Normal' THEN 2
                        WHEN 'Low' THEN 3
                        ELSE 4 END, created_at ASC
                    LIMIT 1
                    """,
                    (queue_name, now),
                )
                row = cur.fetchone()

                if row:
                    item_id = row["id"]
                    lock_exp = (
                        datetime.now(timezone.utc) + timedelta(seconds=lock_timeout)
                    ).isoformat()

                    res = conn.execute(
                        """
                        UPDATE work_queue_items
                        SET status = 'InProgress', lock_expires_at = ?, updated_at = ?
                        WHERE id = ? AND status IN ('New', 'Retried')
                        """,
                        (lock_exp, now, item_id),
                    )
                    conn.commit()

                    if res.rowcount > 0:
                        # Fetch updated record
                        cur.execute(
                            "SELECT * FROM work_queue_items WHERE id = ?", (item_id,)
                        )
                        updated_row = cur.fetchone()
                        if updated_row:
                            return self._row_to_item(updated_row)

            if time.time() >= deadline:
                break
            time.sleep(0.1)

        return None

    def set_item_status(
        self,
        item_id: str,
        status: QueueItemStatus | str = QueueItemStatus.SUCCESSFUL,
        error_message: str | None = None,
        retry: bool = True,
    ) -> QueueItem:
        """Update the status of a processed queue item with retry logic."""
        st_enum = QueueItemStatus(status) if isinstance(status, str) else status
        now = self._now_iso()

        with self._lock, self._get_connection() as conn:
            cur = conn.cursor()
            cur.execute("SELECT * FROM work_queue_items WHERE id = ?", (item_id,))
            row = cur.fetchone()
            if not row:
                raise ValueError(f"Queue item with ID '{item_id}' not found")

            retry_count = int(row["retry_count"])
            max_retries = int(row["max_retries"])
            next_status = st_enum.value
            defer_until: str | None = None

            if st_enum == QueueItemStatus.FAILED:
                if retry and (retry_count + 1 < max_retries):
                    retry_count += 1
                    next_status = QueueItemStatus.RETRIED.value
                    backoff = min(3600, (2**retry_count) * 2)
                    defer_until = (
                        datetime.now(timezone.utc) + timedelta(seconds=backoff)
                    ).isoformat()
                else:
                    next_status = QueueItemStatus.DEAD_LETTER.value

            conn.execute(
                """
                UPDATE work_queue_items
                SET status = ?, retry_count = ?, error_message = ?,
                    lock_expires_at = NULL, defer_until = ?, updated_at = ?
                WHERE id = ?
                """,
                (next_status, retry_count, error_message, defer_until, now, item_id),
            )
            conn.commit()

            cur.execute("SELECT * FROM work_queue_items WHERE id = ?", (item_id,))
            updated_row = cur.fetchone()
            if updated_row is None:
                raise RuntimeError(f"Queue item '{item_id}' not found after update")
            return self._row_to_item(updated_row)

    def postpone_item(
        self,
        item_id: str,
        defer_seconds: float = 300.0,
    ) -> QueueItem:
        """Postpone an item by releasing its lock and setting defer_until."""
        now = self._now_iso()
        defer_time = (
            datetime.now(timezone.utc) + timedelta(seconds=defer_seconds)
        ).isoformat()

        with self._lock, self._get_connection() as conn:
            cur = conn.cursor()
            cur.execute("SELECT * FROM work_queue_items WHERE id = ?", (item_id,))
            row = cur.fetchone()
            if not row:
                raise ValueError(f"Queue item with ID '{item_id}' not found")

            conn.execute(
                """
                UPDATE work_queue_items
                SET status = 'New', lock_expires_at = NULL, defer_until = ?, updated_at = ?
                WHERE id = ?
                """,
                (defer_time, now, item_id),
            )
            conn.commit()

            cur.execute("SELECT * FROM work_queue_items WHERE id = ?", (item_id,))
            updated = cur.fetchone()
            if updated is None:
                raise RuntimeError(f"Queue item '{item_id}' not found after update")
            return self._row_to_item(updated)

    def get_queue_stats(self, queue_name: str) -> dict[str, int]:
        """Return counts of items in each status for the queue."""
        with self._lock, self._get_connection() as conn:
            cur = conn.cursor()
            cur.execute(
                """
                SELECT status, COUNT(*) as count
                FROM work_queue_items
                WHERE queue_name = ?
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
            stats[row["status"]] = row["count"]
        return stats

    def requeue_dead_letter(
        self,
        queue_name: str,
        item_id: str | None = None,
    ) -> int:
        """Re-queue DeadLetter items back to New status."""
        now = self._now_iso()
        with self._lock, self._get_connection() as conn:
            if item_id:
                cur = conn.execute(
                    """
                    UPDATE work_queue_items
                    SET status = 'New', retry_count = 0, error_message = NULL,
                        lock_expires_at = NULL, defer_until = NULL, updated_at = ?
                    WHERE queue_name = ? AND id = ? AND status = 'DeadLetter'
                    """,
                    (now, queue_name, item_id),
                )
            else:
                cur = conn.execute(
                    """
                    UPDATE work_queue_items
                    SET status = 'New', retry_count = 0, error_message = NULL,
                        lock_expires_at = NULL, defer_until = NULL, updated_at = ?
                    WHERE queue_name = ? AND status = 'DeadLetter'
                    """,
                    (now, queue_name),
                )
            conn.commit()
            return cur.rowcount

    # -- Read/cancel surface for the MCP server (issue #854) ----------------

    def get_item(self, item_id: str) -> QueueItem:
        """Return one item by id; raises ``ValueError`` when missing."""
        with self._lock, self._get_connection() as conn:
            cur = conn.execute(
                "SELECT * FROM work_queue_items WHERE id = ?", (item_id,)
            )
            row = cur.fetchone()
        if row is None:
            raise ValueError(f"Queue item '{item_id}' not found")
        return self._row_to_item(row)

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
        with self._lock, self._get_connection() as conn:
            if status:
                cur = conn.execute(
                    """
                    SELECT * FROM work_queue_items
                    WHERE queue_name = ? AND status = ?
                    ORDER BY created_at DESC, id DESC
                    LIMIT ?
                    """,
                    (queue_name, status, bounded_limit),
                )
            else:
                cur = conn.execute(
                    """
                    SELECT * FROM work_queue_items
                    WHERE queue_name = ?
                    ORDER BY created_at DESC, id DESC
                    LIMIT ?
                    """,
                    (queue_name, bounded_limit),
                )
            rows = cur.fetchall()
        return [self._row_to_item(row) for row in rows]

    def cancel_item(self, item_id: str, reason: str = "cancelled") -> QueueItem:
        """Cancel a queued (``New``/``Retried``) item before pickup.

        Items already picked up (``InProgress``) or finished cannot be
        cancelled — the daemon runs them to completion. Cancelled items are
        skipped by :meth:`get_next_item` (it only selects ``New``/``Retried``).
        """
        now = self._now_iso()
        with self._lock, self._get_connection() as conn:
            cur = conn.execute(
                """
                UPDATE work_queue_items
                SET status = ?, error_message = ?, lock_expires_at = NULL,
                    defer_until = NULL, updated_at = ?
                WHERE id = ? AND status IN ('New', 'Retried')
                """,
                (QueueItemStatus.CANCELLED.value, reason, now, item_id),
            )
            if cur.rowcount == 0:
                existing = conn.execute(
                    "SELECT status FROM work_queue_items WHERE id = ?", (item_id,)
                ).fetchone()
                if existing is None:
                    raise ValueError(f"Queue item '{item_id}' not found")
                raise ValueError(
                    f"Item '{item_id}' cannot be cancelled from status "
                    f"'{existing['status']}'"
                )
            conn.commit()
            row = conn.execute(
                "SELECT * FROM work_queue_items WHERE id = ?", (item_id,)
            ).fetchone()
        return self._row_to_item(row)

    def request_cancel(
        self, item_id: str, reason: str = "cancel requested"
    ) -> QueueItem:
        """Request cooperative cancellation of a running (``InProgress``) item.

        Unlike :meth:`cancel_item` this does not change the item status: the
        flag is picked up by the owning daemon's cancel watcher, which
        interrupts the run cooperatively. Raises ``ValueError`` when the item
        is missing or not currently running.
        """
        now = self._now_iso()
        with self._lock, self._get_connection() as conn:
            cur = conn.execute(
                """
                UPDATE work_queue_items
                SET cancel_requested = 1, error_message = ?, updated_at = ?
                WHERE id = ? AND status = 'InProgress'
                """,
                (reason, now, item_id),
            )
            if cur.rowcount == 0:
                existing = conn.execute(
                    "SELECT status FROM work_queue_items WHERE id = ?", (item_id,)
                ).fetchone()
                if existing is None:
                    raise ValueError(f"Queue item '{item_id}' not found")
                raise ValueError(
                    f"Item '{item_id}' is not running (status "
                    f"'{existing['status']}'); use cancel_item for queued items"
                )
            conn.commit()
            row = conn.execute(
                "SELECT * FROM work_queue_items WHERE id = ?", (item_id,)
            ).fetchone()
        return self._row_to_item(row)

    def get_cancel_requests(self, queue_name: str) -> list[str]:
        """Return ids of running items with a pending cooperative cancel."""
        with self._lock, self._get_connection() as conn:
            cur = conn.execute(
                """
                SELECT id FROM work_queue_items
                WHERE queue_name = ? AND status = 'InProgress'
                      AND cancel_requested = 1
                """,
                (queue_name,),
            )
            rows = cur.fetchall()
        return [str(row["id"]) for row in rows]

    def record_run_started(self, item_id: str, queue_name: str) -> None:
        """Create a ``running`` run record when the daemon picks an item up."""
        with self._lock, self._get_connection() as conn:
            conn.execute(
                """
                INSERT OR REPLACE INTO run_records
                    (item_id, queue_name, status, started_at)
                VALUES (?, ?, 'running', ?)
                """,
                (item_id, queue_name, self._now_iso()),
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
        with self._lock, self._get_connection() as conn:
            conn.execute(
                """
                UPDATE run_records
                SET run_id = ?, diagram_path = ?, status = ?, exit_code = ?,
                    finished_at = ?, audit_path = ?, error_message = ?
                WHERE item_id = ?
                """,
                (
                    run_id,
                    diagram_path,
                    status,
                    exit_code,
                    self._now_iso(),
                    audit_path,
                    error_message,
                    item_id,
                ),
            )
            conn.commit()

    def _run_row_to_doc(self, row: sqlite3.Row) -> dict[str, Any]:
        return {
            "item_id": row["item_id"],
            "queue_name": row["queue_name"],
            "run_id": row["run_id"],
            "diagram_path": row["diagram_path"],
            "status": row["status"],
            "exit_code": row["exit_code"],
            "started_at": row["started_at"],
            "finished_at": row["finished_at"],
            "audit_path": row["audit_path"],
            "error": row["error_message"],
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
        query = "SELECT * FROM run_records WHERE queue_name = ?"
        params: list[Any] = [queue_name]
        if status is not None:
            query += " AND status = ?"
            params.append(status.strip())
        bounded_limit = max(1, min(int(limit), 100))
        query += " ORDER BY started_at DESC, item_id DESC LIMIT ?"
        params.append(bounded_limit)
        with self._lock, self._get_connection() as conn:
            cur = conn.execute(query, params)
            rows = cur.fetchall()
        return [self._run_row_to_doc(row) for row in rows]

    def get_run(self, item_id: str) -> dict[str, Any] | None:
        """Return one run record, or ``None`` when the item never started."""
        with self._lock, self._get_connection() as conn:
            cur = conn.execute(
                "SELECT * FROM run_records WHERE item_id = ?", (item_id,)
            )
            row = cur.fetchone()
        return self._run_row_to_doc(row) if row is not None else None
