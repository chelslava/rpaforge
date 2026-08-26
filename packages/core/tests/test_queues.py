"""Tests for RPAForge Transaction Work Queue Engine (SQLiteQueueStore)."""

from __future__ import annotations

import concurrent.futures
import json
import threading
import time
from datetime import datetime, timezone
from pathlib import Path

from rpaforge.queues.models import QueueItemStatus, QueuePriority
from rpaforge.queues.sqlite_store import SQLiteQueueStore


def test_add_and_get_single_item(tmp_path: Path):
    db_file = tmp_path / "queues.db"
    store = SQLiteQueueStore(db_file)

    created = store.add_item(
        queue_name="invoices",
        payload={"invoice_id": "INV-1001", "amount": 250.0},
        reference="INV-1001",
        priority=QueuePriority.HIGH,
    )
    assert created.id is not None
    assert created.status == QueueItemStatus.NEW
    assert created.priority == QueuePriority.HIGH

    fetched = store.get_next_item(queue_name="invoices", timeout_seconds=1.0)
    assert fetched is not None
    assert fetched.id == created.id
    assert fetched.status == QueueItemStatus.IN_PROGRESS
    assert fetched.payload["invoice_id"] == "INV-1001"
    assert fetched.lock_expires_at is not None

    # Getting next item now should return None as it's locked
    assert store.get_next_item(queue_name="invoices", timeout_seconds=0.0) is None


def test_priority_ordering(tmp_path: Path):
    db_file = tmp_path / "prio_queues.db"
    store = SQLiteQueueStore(db_file)

    store.add_item("orders", {"id": "low-1"}, priority=QueuePriority.LOW)
    store.add_item("orders", {"id": "norm-1"}, priority=QueuePriority.NORMAL)
    store.add_item("orders", {"id": "high-1"}, priority=QueuePriority.HIGH)
    store.add_item("orders", {"id": "high-2"}, priority=QueuePriority.HIGH)

    first = store.get_next_item("orders", timeout_seconds=0.1)
    second = store.get_next_item("orders", timeout_seconds=0.1)
    third = store.get_next_item("orders", timeout_seconds=0.1)
    fourth = store.get_next_item("orders", timeout_seconds=0.1)

    assert first is not None and first.payload["id"] == "high-1"
    assert second is not None and second.payload["id"] == "high-2"
    assert third is not None and third.payload["id"] == "norm-1"
    assert fourth is not None and fourth.payload["id"] == "low-1"


def test_bulk_add_items(tmp_path: Path):
    db_file = tmp_path / "bulk_queues.db"
    store = SQLiteQueueStore(db_file)

    items = [
        {"payload": {"num": 1}, "reference": "REF-1", "priority": "High"},
        {"payload": {"num": 2}, "reference": "REF-2", "priority": "Normal"},
        {"payload": {"num": 3}, "reference": "REF-3", "priority": "Low"},
    ]
    created = store.add_bulk_items("bulk_queue", items)
    assert len(created) == 3

    stats = store.get_queue_stats("bulk_queue")
    assert stats[QueueItemStatus.NEW.value] == 3


def test_retry_and_dead_letter(tmp_path: Path):
    db_file = tmp_path / "retry_queues.db"
    store = SQLiteQueueStore(db_file)
    store.add_item("tasks", {"task": "flaky"}, max_retries=2)

    # Attempt 1: Fetch and fail
    item1 = store.get_next_item("tasks", timeout_seconds=0.1)
    assert item1 is not None
    updated1 = store.set_item_status(
        item1.id,
        status=QueueItemStatus.FAILED,
        error_message="Network error",
        retry=True,
    )
    assert updated1.status == QueueItemStatus.RETRIED
    assert updated1.retry_count == 1
    assert updated1.defer_until is not None

    # Fast forward defer_until to test second pickup
    with store._lock, store._get_connection() as conn:
        conn.execute(
            "UPDATE work_queue_items SET defer_until = NULL WHERE id = ?", (item1.id,)
        )
        conn.commit()

    # Attempt 2: Fetch and fail again -> exceeds max_retries (2) -> DeadLetter
    item2 = store.get_next_item("tasks", timeout_seconds=0.1)
    assert item2 is not None
    updated2 = store.set_item_status(
        item2.id,
        status=QueueItemStatus.FAILED,
        error_message="Fatal error",
        retry=True,
    )
    assert updated2.status == QueueItemStatus.DEAD_LETTER
    assert updated2.retry_count == 1

    stats = store.get_queue_stats("tasks")
    assert stats[QueueItemStatus.DEAD_LETTER.value] == 1


def test_requeue_dead_letter(tmp_path: Path):
    db_file = tmp_path / "requeue.db"
    store = SQLiteQueueStore(db_file)

    store.add_item("dlq_test", {"item": 1}, max_retries=1)
    locked = store.get_next_item("dlq_test")
    assert locked is not None
    store.set_item_status(locked.id, status=QueueItemStatus.FAILED, retry=False)

    stats = store.get_queue_stats("dlq_test")
    assert stats[QueueItemStatus.DEAD_LETTER.value] == 1

    requeued = store.requeue_dead_letter("dlq_test")
    assert requeued == 1

    stats_after = store.get_queue_stats("dlq_test")
    assert stats_after[QueueItemStatus.NEW.value] == 1
    assert stats_after[QueueItemStatus.DEAD_LETTER.value] == 0


def test_postpone_item(tmp_path: Path):
    db_file = tmp_path / "postpone.db"
    store = SQLiteQueueStore(db_file)

    store.add_item("delay_queue", {"key": "value"})
    item = store.get_next_item("delay_queue")
    assert item is not None

    postponed = store.postpone_item(item.id, defer_seconds=600.0)
    assert postponed.status == QueueItemStatus.NEW
    assert postponed.defer_until is not None

    # Should not be fetched because it's deferred 600s in the future
    assert store.get_next_item("delay_queue", timeout_seconds=0.0) is None


def test_lock_expiration_auto_recovery(tmp_path: Path):
    db_file = tmp_path / "expire.db"
    store = SQLiteQueueStore(db_file)

    store.add_item("stale_queue", {"data": "recover_me"})
    # Fetch with lock_timeout of 0.05s
    item = store.get_next_item("stale_queue", lock_timeout=0.05)
    assert item is not None
    assert item.status == QueueItemStatus.IN_PROGRESS

    # Wait for lock to expire
    time.sleep(0.1)

    # Next fetch should auto-recover expired InProgress lock
    recovered = store.get_next_item("stale_queue", timeout_seconds=0.1)
    assert recovered is not None
    assert recovered.id == item.id


def test_concurrent_worker_fetch_no_duplicates(tmp_path: Path):
    db_file = tmp_path / "concurrency.db"
    store = SQLiteQueueStore(db_file)

    # Insert 20 items
    items = [{"payload": {"idx": i}, "reference": f"REF-{i}"} for i in range(20)]
    store.add_bulk_items("concurrent_q", items)

    fetched_ids: list[str] = []
    lock = threading.Lock()

    def worker_fetch():
        for _ in range(5):
            it = store.get_next_item("concurrent_q", timeout_seconds=0.2)
            if it:
                with lock:
                    fetched_ids.append(it.id)
                store.set_item_status(it.id, status=QueueItemStatus.SUCCESSFUL)

    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as executor:
        futures = [executor.submit(worker_fetch) for _ in range(6)]
        concurrent.futures.wait(futures)

    # Every item must be fetched exactly once (no duplicates, no race conditions)
    assert len(fetched_ids) == 20
    assert len(set(fetched_ids)) == 20

    stats = store.get_queue_stats("concurrent_q")
    assert stats[QueueItemStatus.SUCCESSFUL.value] == 20


def test_postgres_store_get_next_item_lifecycle(monkeypatch):
    """Test PostgreSQLQueueStore connection lifecycle and fetch logic."""
    from unittest.mock import MagicMock

    from rpaforge.queues.postgres_store import PostgreSQLQueueStore

    # Mock connection object passed directly
    mock_conn = MagicMock()
    mock_cur = MagicMock()
    mock_conn.cursor.return_value.__enter__.return_value = mock_cur
    now = datetime.now(timezone.utc)
    mock_cur.fetchone.return_value = (
        "item-123",
        "pg_q",
        "REF-1",
        "High",
        json.dumps({"key": "val"}),
        "New",
        0,
        3,
        None,
        None,
        None,
        now,
        now,
    )

    store = PostgreSQLQueueStore(mock_conn)
    item = store.get_next_item("pg_q", timeout_seconds=0.0)
    assert item is not None
    assert item.id == "item-123"
    assert item.payload == {"key": "val"}
    # Because connection was passed directly, conn.close() must NOT be called in get_next_item
    assert not mock_conn.close.called

    # Test with DSN string: conn.close() MUST be called in finally
    mock_dsn_conn = MagicMock()
    mock_dsn_cur = MagicMock()
    mock_dsn_conn.cursor.return_value.__enter__.return_value = mock_dsn_cur
    mock_dsn_cur.fetchone.return_value = None

    dsn_store = PostgreSQLQueueStore(mock_dsn_conn)
    dsn_store.dsn_or_connection = "postgresql://user:pass@localhost:5432/db"
    monkeypatch.setattr(dsn_store, "_get_connection", lambda: mock_dsn_conn)
    empty_item = dsn_store.get_next_item("pg_q", timeout_seconds=0.0)
    assert empty_item is None
    assert mock_dsn_conn.close.called
