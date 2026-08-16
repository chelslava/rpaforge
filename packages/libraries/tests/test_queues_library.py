"""Tests for RPAForge Queues Library activities."""

from __future__ import annotations

from pathlib import Path

from rpaforge.queues.sqlite_store import SQLiteQueueStore
from rpaforge_libraries.Queues.library import Queues


def test_queues_library_end_to_end(tmp_path: Path):
    db_file = tmp_path / "queues_lib.db"
    store = SQLiteQueueStore(db_file)
    lib = Queues(store=store)

    # 1. Add Queue Item
    added = lib.add_queue_item(
        queue_name="customers",
        payload={"customer_id": 42, "email": "test@example.com"},
        reference="CUST-42",
        priority="High",
    )
    assert added["id"] is not None
    assert added["priority"] == "High"
    assert added["status"] == "New"
    assert added["payload"]["customer_id"] == 42

    # 2. Add Bulk Items
    bulk = lib.add_bulk_queue_items(
        queue_name="customers",
        items=[
            {
                "payload": {"customer_id": 43},
                "reference": "CUST-43",
                "priority": "Normal",
            },
            {"payload": {"customer_id": 44}, "reference": "CUST-44", "priority": "Low"},
        ],
    )
    assert len(bulk) == 2

    # 3. Check Stats
    stats = lib.get_queue_stats("customers")
    assert stats["New"] == 3

    # 4. Get Next Queue Item (should fetch High priority CUST-42 first)
    item1 = lib.get_next_queue_item("customers", timeout_seconds=1.0)
    assert item1 is not None
    assert item1["reference"] == "CUST-42"
    assert item1["status"] == "InProgress"

    # 5. Set Item Status to Successful
    completed = lib.set_queue_item_status(item1["id"], status="Successful")
    assert completed["status"] == "Successful"

    # 6. Fetch next item (CUST-43) and Postpone it
    item2 = lib.get_next_queue_item("customers", timeout_seconds=1.0)
    assert item2 is not None
    assert item2["reference"] == "CUST-43"
    postponed = lib.postpone_queue_item(item2["id"], defer_seconds=300.0)
    assert postponed["status"] == "New"
    assert postponed["defer_until"] is not None

    # 7. Fetch next item (CUST-44) and fail it -> DeadLetter (with retry=False)
    item3 = lib.get_next_queue_item("customers", timeout_seconds=1.0)
    assert item3 is not None
    assert item3["reference"] == "CUST-44"
    failed = lib.set_queue_item_status(
        item3["id"], status="Failed", error_message="Customer not found", retry=False
    )
    assert failed["status"] == "DeadLetter"

    # 8. Requeue Dead Letter
    requeued = lib.requeue_dead_letter_items("customers")
    assert requeued == 1

    stats_final = lib.get_queue_stats("customers")
    assert stats_final["Successful"] == 1
    assert stats_final["DeadLetter"] == 0
