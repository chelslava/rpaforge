"""Abstract interface for work queue storage backends."""

from __future__ import annotations

from typing import Any, Protocol

from rpaforge.queues.models import QueueItem, QueueItemStatus, QueuePriority


class QueueStore(Protocol):
    """Protocol for transactional queue storage engines."""

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
        ...

    def add_bulk_items(
        self,
        queue_name: str,
        items: list[dict[str, Any]],
    ) -> list[QueueItem]:
        """Add multiple items atomically to the queue."""
        ...

    def get_next_item(
        self,
        queue_name: str,
        timeout_seconds: float = 30.0,
        lock_timeout: float = 300.0,
    ) -> QueueItem | None:
        """Fetch and lock the next eligible item according to priority and FIFO order."""
        ...

    def set_item_status(
        self,
        item_id: str,
        status: QueueItemStatus | str = QueueItemStatus.SUCCESSFUL,
        error_message: str | None = None,
        retry: bool = True,
    ) -> QueueItem:
        """Update the status of a processed queue item, with retry / dead-letter handling."""
        ...

    def postpone_item(
        self,
        item_id: str,
        defer_seconds: float = 300.0,
    ) -> QueueItem:
        """Postpone an item by releasing its lock and setting defer_until."""
        ...

    def get_queue_stats(self, queue_name: str) -> dict[str, int]:
        """Return counts of items in each status for the queue."""
        ...

    def requeue_dead_letter(
        self,
        queue_name: str,
        item_id: str | None = None,
    ) -> int:
        """Re-queue DeadLetter items back to New status."""
        ...
