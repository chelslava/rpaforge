"""Queue store throughput benchmark (issue #830).

Measures SQLite queue enqueue and dequeue (lease acquisition + completion)
rates over a temporary database file. Values are operations per second,
higher is better.
"""

from __future__ import annotations

import gc
import tempfile
import time
from pathlib import Path
from typing import Any

from rpaforge.queues import SQLiteQueueStore
from rpaforge.queues.models import QueueItemStatus, QueuePriority

#: Payload volume per phase.
OPERATIONS = 1000

QUEUE_NAME = "bench-queue"

ENQUEUE_METRIC = "queue_enqueue_ops_per_sec"
DEQUEUE_METRIC = "queue_dequeue_ops_per_sec"
UNIT = "ops/s"


def _run_enqueue(store: SQLiteQueueStore) -> float:
    started = time.perf_counter()
    for index in range(OPERATIONS):
        store.add_item(
            QUEUE_NAME,
            {"index": index},
            priority=QueuePriority.NORMAL,
        )
    return OPERATIONS / (time.perf_counter() - started)


def _run_dequeue(store: SQLiteQueueStore) -> float:
    started = time.perf_counter()
    for _ in range(OPERATIONS):
        item = store.get_next_item(QUEUE_NAME, timeout_seconds=5.0)
        if item is None:
            raise RuntimeError("bench queue drained earlier than expected")
        store.set_item_status(item.id, QueueItemStatus.SUCCESSFUL)
    return OPERATIONS / (time.perf_counter() - started)


def run_benchmark() -> list[dict[str, Any]]:
    """Run both queue phases on a fresh temp database."""
    # ignore_cleanup_errors: per-call SQLite connections are reclaimed by GC
    # (no explicit close() on the store); on Windows the last handle can
    # outlive this scope by one GC cycle.
    with tempfile.TemporaryDirectory(
        prefix="rpaforge-bench-", ignore_cleanup_errors=True
    ) as tmp:
        store = SQLiteQueueStore(Path(tmp) / "bench.db")
        enqueue_rate = _run_enqueue(store)
        dequeue_rate = _run_dequeue(store)
        del store
        gc.collect()
    return [
        {
            "name": ENQUEUE_METRIC,
            "value": enqueue_rate,
            "unit": UNIT,
            "lower_is_better": False,
        },
        {
            "name": DEQUEUE_METRIC,
            "value": dequeue_rate,
            "unit": UNIT,
            "lower_is_better": False,
        },
    ]


if __name__ == "__main__":
    import json
    import sys

    print(json.dumps(run_benchmark(), indent=2))
    sys.exit(0)
