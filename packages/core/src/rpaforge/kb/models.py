"""Knowledge-base data models (issue #902)."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any


def utc_now_iso() -> str:
    """Return the current UTC time as an ISO-8601 string."""
    return datetime.now(timezone.utc).isoformat()


@dataclass
class KbChunk:
    """One indexed text chunk with its embedding vector and metadata."""

    collection: str
    text: str
    vector: list[float]
    id: str = ""
    metadata: dict[str, Any] = field(default_factory=dict)
    expires_at: str | None = None
    created_at: str = field(default_factory=utc_now_iso)
    updated_at: str = field(default_factory=utc_now_iso)

    def to_dict(self) -> dict[str, Any]:
        """Return a JSON-friendly representation (vector omitted)."""
        return {
            "id": self.id,
            "collection": self.collection,
            "text": self.text,
            "metadata": self.metadata,
            "expires_at": self.expires_at,
            "created_at": self.created_at,
            "updated_at": self.updated_at,
        }


@dataclass
class KbSearchHit:
    """One ranked search result."""

    id: str
    text: str
    score: float
    metadata: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        """Return a JSON-friendly representation."""
        return {
            "id": self.id,
            "text": self.text,
            "score": self.score,
            "metadata": self.metadata,
        }
