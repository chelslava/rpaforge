"""Tests for RPAForge Transaction Work Queue Engine (SQLiteQueueStore)."""

from __future__ import annotations

import concurrent.futures
import threading
import time
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
