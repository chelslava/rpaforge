"""PostgreSQL-backed transactional work queue store using FOR UPDATE SKIP LOCKED."""

from __future__ import annotations

import contextlib
import json
import logging
import time
import uuid
from collections.abc import Iterator
from datetime import datetime, timedelta, timezone
from typing import Any

from rpaforge.queues.models import QueueItem, QueueItemStatus, QueuePriority

logger = logging.getLogger("rpaforge.queues.postgres")


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
                assert updated_row is not None
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
                assert updated is not None
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
