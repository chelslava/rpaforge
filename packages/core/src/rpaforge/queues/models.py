"""Work Queue data models and lifecycle states."""

from __future__ import annotations

from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Any


class QueueItemStatus(str, Enum):
    """Lifecycle status states for transaction queue items."""

    NEW = "New"
    IN_PROGRESS = "InProgress"
    SUCCESSFUL = "Successful"
    FAILED = "Failed"
    RETRIED = "Retried"
    DEAD_LETTER = "DeadLetter"


class QueuePriority(str, Enum):
    """Priority levels for queue items."""

    HIGH = "High"
    NORMAL = "Normal"
    LOW = "Low"


@dataclass
class QueueItem:
    """A single transactional item in a work queue."""

    id: str
    queue_name: str
    payload: dict[str, Any]
    reference: str | None = None
    priority: QueuePriority = QueuePriority.NORMAL
    status: QueueItemStatus = QueueItemStatus.NEW
    retry_count: int = 0
    max_retries: int = 3
    lock_expires_at: str | None = None
    defer_until: str | None = None
    error_message: str | None = None
    created_at: str = field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat()
    )
    updated_at: str = field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat()
    )

    def to_dict(self) -> dict[str, Any]:
        """Convert item to dictionary."""
        data = asdict(self)
        data["priority"] = (
            self.priority.value
            if isinstance(self.priority, QueuePriority)
            else str(self.priority)
        )
        data["status"] = (
            self.status.value
            if isinstance(self.status, QueueItemStatus)
            else str(self.status)
        )
        return data
