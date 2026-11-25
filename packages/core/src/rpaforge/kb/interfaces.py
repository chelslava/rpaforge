"""Abstract interface for knowledge-base vector storage backends (issue #902)."""

from __future__ import annotations

from collections.abc import Sequence
from typing import Any, Protocol, runtime_checkable

from rpaforge.kb.models import KbChunk, KbSearchHit

DEFAULT_COLLECTION = "default"


@runtime_checkable
class VectorStore(Protocol):
    """Protocol for local vector storage engines."""

    def upsert(
        self,
        collection: str,
        text: str,
        vector: Sequence[float],
        *,
        chunk_id: str | None = None,
        metadata: dict[str, Any] | None = None,
        expires_at: str | None = None,
    ) -> KbChunk:
        """Insert or replace one chunk; returns the stored chunk."""

    def search(
        self,
        collection: str,
        query_vector: Sequence[float],
        *,
        top_k: int = 5,
        metadata_filter: dict[str, Any] | None = None,
    ) -> list[KbSearchHit]:
        """Return the ``top_k`` most similar live chunks, best first.

        Expired chunks (``expires_at`` in the past) never match; exact-match
        ``metadata_filter`` applies on top-level metadata keys.
        """

    def delete(
        self,
        collection: str,
        *,
        chunk_ids: Sequence[str] | None = None,
        metadata_filter: dict[str, Any] | None = None,
    ) -> int:
        """Delete chunks by ids and/or metadata filter; returns the count."""

    def stats(self, collection: str | None = None) -> dict[str, Any]:
        """Return per-collection chunk counts and dimensions."""

    def purge_expired(self) -> int:
        """Hard-delete chunks whose ``expires_at`` has passed; returns count."""

    def clear(self, collection: str) -> int:
        """Delete every chunk in ``collection``; returns the count."""
