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
            assert updated_row is not None
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
            assert updated is not None
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
