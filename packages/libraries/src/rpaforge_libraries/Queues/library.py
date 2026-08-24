"""RPAForge Queues Library - Transaction Work Queue Operations."""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Any

from rpaforge.core.activity import activity, library, output, param, tags
from rpaforge.queues.interfaces import QueueStore
from rpaforge.queues.sqlite_store import SQLiteQueueStore

logger = logging.getLogger("rpaforge.queues")


@library(name="Queues", category="Data", icon="📥")
class Queues:
    """Manage transactional work queues for Dispatcher/Performer workflows.

    Activities add, lease, complete, postpone, inspect, and requeue work items
    through an injectable :class:`~rpaforge.queues.interfaces.QueueStore`.
    """

    def __init__(self, store: QueueStore | None = None) -> None:
        """Initialize the library with a queue storage backend.

        :param store: Queue store to use. Defaults to a local SQLite store.
        """
        self._store = store or SQLiteQueueStore()

    @property
    def store(self) -> QueueStore:
        """Return the configured queue storage backend."""
        return self._store

    @activity(name="Add Queue Item", category="Queues")
    @tags("queue", "dispatcher", "item", "add")
    @output("Dictionary representation of the created queue item")
    @param("queue_name", type="string", description="Name of the work queue")
    @param("payload", type="any", description="JSON payload data for the item")
    @param("reference", type="string", description="Optional business reference key")
    @param(
        "priority",
        type="string",
        options=["High", "Normal", "Low"],
        description="Item priority",
    )
    @param("defer_seconds", type="float", description="Seconds to defer processing")
    @param(
        "max_retries",
        type="integer",
        description="Maximum number of retries before dead-letter",
    )
    def add_queue_item(
        self,
        queue_name: str,
        payload: Any,
        reference: str | None = None,
        priority: str = "Normal",
        defer_seconds: float | None = None,
        max_retries: int = 3,
    ) -> dict[str, Any]:
        """Add a new item to a work queue.

        Non-dictionary payloads are wrapped in a ``{"data": payload}``
        dictionary before storage. A positive defer interval makes the item
        ineligible for leasing until that interval has elapsed.

        :param queue_name: Name of the work queue.
        :param payload: JSON-serializable payload for the item.
        :param reference: Optional business reference used to identify the item.
        :param priority: Processing priority: ``High``, ``Normal``, or ``Low``.
        :param defer_seconds: Optional number of seconds to defer processing.
        :param max_retries: Maximum processing attempts before dead-lettering.
        :returns: Dictionary representation of the newly created queue item.
        :raises ValueError: If ``priority`` is not a supported queue priority.
        :raises TypeError: If ``payload`` is not JSON serializable.
        """
        defer_until = None
        if defer_seconds is not None and defer_seconds > 0:
            defer_until = (
                datetime.now(timezone.utc) + timedelta(seconds=defer_seconds)
            ).isoformat()

        payload_dict = payload if isinstance(payload, dict) else {"data": payload}
        item = self._store.add_item(
            queue_name=queue_name,
            payload=payload_dict,
            reference=reference,
            priority=priority,
            defer_until=defer_until,
            max_retries=max_retries,
        )
        logger.info(
            f"Added queue item {item.id} to '{queue_name}' (priority: {priority})"
        )
        return item.to_dict()

    @activity(name="Add Bulk Queue Items", category="Queues")
    @tags("queue", "bulk", "dispatcher")
    @output("List of created queue item dictionaries")
    @param("queue_name", type="string", description="Name of the work queue")
    @param("items", type="array", description="List of item dictionaries")
    def add_bulk_queue_items(
        self,
        queue_name: str,
        items: list[dict[str, Any]],
    ) -> list[dict[str, Any]]:
        """Add multiple items atomically to a work queue.

        Each item dictionary may contain ``payload``, ``reference``,
        ``priority``, ``max_retries``, and an ISO-formatted ``defer_until``.

        :param queue_name: Name of the work queue.
        :param items: Queue item dictionaries to add in one transaction.
        :returns: Dictionary representations of the newly created queue items.
        :raises ValueError: If an item has an unsupported priority or retry count.
        :raises TypeError: If an item payload is not JSON serializable.
        """
        created = self._store.add_bulk_items(queue_name=queue_name, items=items)
        logger.info(f"Added {len(created)} bulk items to queue '{queue_name}'")
        return [it.to_dict() for it in created]

    @activity(name="Get Next Queue Item", category="Queues")
    @tags("queue", "performer", "lock", "fetch")
    @output("The fetched and locked queue item, or None if queue is empty")
    @param("queue_name", type="string", description="Name of the work queue")
    @param(
        "timeout_seconds",
        type="float",
        description="Max seconds to wait for an available item",
    )
    @param(
        "lock_timeout",
        type="float",
        description="Lease duration in seconds before auto-release",
    )
    def get_next_queue_item(
        self,
        queue_name: str,
        timeout_seconds: float = 30.0,
        lock_timeout: float = 300.0,
    ) -> dict[str, Any] | None:
        """Fetch and lock the next eligible item for processing.

        Eligible items are selected by priority and then creation order. The
        lease prevents another performer from receiving the same item until
        the lock expires.

        :param queue_name: Name of the work queue.
        :param timeout_seconds: Maximum number of seconds to wait for an item.
        :param lock_timeout: Lease duration in seconds before automatic release.
        :returns: Dictionary representation of the leased item, or ``None`` if
            no item becomes available before the timeout.
        """
        item = self._store.get_next_item(
            queue_name=queue_name,
            timeout_seconds=timeout_seconds,
            lock_timeout=lock_timeout,
        )
        if item:
            logger.info(
                f"Locked item {item.id} from queue '{queue_name}' for processing"
            )
            return item.to_dict()
        logger.debug(
            f"No item available in queue '{queue_name}' within {timeout_seconds}s timeout"
        )
        return None

    @activity(name="Set Queue Item Status", category="Queues")
    @tags("queue", "performer", "complete", "status")
    @output("Updated queue item dictionary")
    @param("item_id", type="string", description="Unique identifier of the queue item")
    @param(
        "status",
        type="string",
        options=["Successful", "Failed"],
        description="Processing status",
    )
    @param("error_message", type="string", description="Failure reason or stack trace")
    @param(
        "retry",
        type="boolean",
        description="Whether to retry on failure if retries remain",
    )
    def set_queue_item_status(
        self,
        item_id: str,
        status: str = "Successful",
        error_message: str | None = None,
        retry: bool = True,
    ) -> dict[str, Any]:
        """Mark a queue item as successful or failed.

        A failed item is moved to ``Retried`` with exponential backoff while
        attempts remain and ``retry`` is true. Otherwise it is moved to
        ``DeadLetter``.

        :param item_id: Unique identifier of the queue item.
        :param status: Processing result, either ``Successful`` or ``Failed``.
        :param error_message: Optional failure reason or stack trace.
        :param retry: Whether a failed item may be retried when attempts remain.
        :returns: Dictionary representation of the updated queue item.
        :raises ValueError: If ``status`` is unsupported or ``item_id`` is not found.
        """
        item = self._store.set_item_status(
            item_id=item_id,
            status=status,
            error_message=error_message,
            retry=retry,
        )
        logger.info(f"Updated item {item_id} status to '{item.status}'")
        return item.to_dict()

    @activity(name="Postpone Queue Item", category="Queues")
    @tags("queue", "postpone", "defer")
    @output("Postponed queue item dictionary")
    @param("item_id", type="string", description="Unique identifier of the queue item")
    @param("defer_seconds", type="float", description="Seconds to defer processing")
    def postpone_queue_item(
        self,
        item_id: str,
        defer_seconds: float = 300.0,
    ) -> dict[str, Any]:
        """Postpone an item until a future processing window.

        Postponing releases the current lease, returns the item to ``New``, and
        makes it unavailable until the defer interval has elapsed.

        :param item_id: Unique identifier of the queue item.
        :param defer_seconds: Number of seconds to defer processing.
        :returns: Dictionary representation of the postponed queue item.
        :raises ValueError: If ``item_id`` is not found.
        """
        item = self._store.postpone_item(item_id=item_id, defer_seconds=defer_seconds)
        logger.info(f"Postponed item {item_id} by {defer_seconds} seconds")
        return item.to_dict()

    @activity(name="Get Queue Stats", category="Queues")
    @tags("queue", "stats", "metrics")
    @output("Dictionary of item counts grouped by status")
    @param("queue_name", type="string", description="Name of the work queue")
    def get_queue_stats(self, queue_name: str) -> dict[str, int]:
        """Retrieve item counts grouped by status for a work queue.

        :param queue_name: Name of the work queue.
        :returns: Mapping of every queue status to its current item count.
        """
        stats = self._store.get_queue_stats(queue_name=queue_name)
        return stats

    @activity(name="Requeue Dead Letter Items", category="Queues")
    @tags("queue", "deadletter", "requeue")
    @output("Number of requeued items")
    @param("queue_name", type="string", description="Name of the work queue")
    @param("item_id", type="string", description="Optional specific item ID to requeue")
    def requeue_dead_letter_items(
        self,
        queue_name: str,
        item_id: str | None = None,
    ) -> int:
        """Return dead-letter items to ``New`` status for processing.

        Requeued items have their retry count, error, lease, and defer time
        cleared. When ``item_id`` is omitted, every dead-letter item in the
        named queue is requeued.

        :param queue_name: Name of the work queue.
        :param item_id: Optional identifier of one dead-letter item to requeue.
        :returns: Number of items returned to ``New`` status.
        """
        count = self._store.requeue_dead_letter(queue_name=queue_name, item_id=item_id)
        logger.info(f"Requeued {count} dead-letter items in queue '{queue_name}'")
        return count
