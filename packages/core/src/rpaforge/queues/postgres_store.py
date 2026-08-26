"""PostgreSQL-backed transactional work queue store using FOR UPDATE SKIP LOCKED."""

from __future__ import annotations

import json
import logging
import time
import uuid
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

    def _init_db(self) -> None:
        try:
            conn = self._get_connection()
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

        conn = self._get_connection()
        try:
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
        finally:
            conn.close()

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

    def get_next_item(
        self,
        queue_name: str,
        timeout_seconds: float = 30.0,
        lock_timeout: float = 300.0,
    ) -> QueueItem | None:
        deadline = time.time() + max(0.0, timeout_seconds)

        while True:
            conn = self._get_connection()
            try:
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
            finally:
                conn.close()

            if time.time() >= deadline:
                break
            time.sleep(0.2)

        return None
