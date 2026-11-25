"""RPAForge KB Library - Persistent knowledge-base (RAG) operations."""

from __future__ import annotations

import json
import logging
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from rpaforge.core.activity import activity, library, output, param, tags
from rpaforge.core.secrets import SecretMasker
from rpaforge.kb.interfaces import VectorStore
from rpaforge.kb.models import KbChunk
from rpaforge.kb.sqlite_store import SQLiteVectorStore
from rpaforge_libraries.i18n import _

logger = logging.getLogger("rpaforge.kb")

#: Chunking window and overlap defaults (characters).
DEFAULT_CHUNK_CHARS = 800
DEFAULT_CHUNK_OVERLAP = 100
#: SecretMasker only redacts values of at least this length.
MIN_MASK_SECRET_LENGTH = 4


def _chunk_text(text: str, chunk_chars: int, overlap: int) -> list[str]:
    """Split ``text`` into overlapping fixed-size windows."""
    window = max(1, int(chunk_chars))
    step = max(1, window - max(0, int(overlap)))
    chunks: list[str] = []
    normalized = text.strip()
    for start in range(0, len(normalized), step):
        piece = normalized[start : start + window].strip()
        if piece:
            chunks.append(piece)
        if start + window >= len(normalized):
            break
    return chunks or ([normalized] if normalized else [])


def _read_text_file(path: str | Path) -> str:
    """Read one UTF-8 text file, raising ``ValueError`` when unreadable."""
    file_path = Path(path)
    if not file_path.is_file():
        raise ValueError(_("File not found: {path}").format(path=str(file_path)))
    return file_path.read_text(encoding="utf-8", errors="replace")


@library(name="KB", category="AI", icon="🧠")
class KB:
    """Persistent knowledge base with semantic search (RAG memory).

    Activities embed text into a local vector store and retrieve the most
    relevant chunks by cosine similarity. The same index is exposed to
    agentic loops as the built-in ``kb.search`` tool, giving agents memory
    that survives across iterations and runs.
    """

    def __init__(
        self,
        store: VectorStore | None = None,
        embedder: Any | None = None,
    ) -> None:
        """Initialize the library with injectable storage and embeddings.

        :param store: Vector store backend. Defaults to a local SQLite store.
        :param embedder: Embedding backend. Defaults to the resolved
            ``RPAFORGE_EMBEDDINGS_*`` provider (offline hashing by default).
        """
        self._store = store or SQLiteVectorStore()
        self._embedder = embedder
        self._masker = SecretMasker()

    @property
    def store(self) -> VectorStore:
        """Return the configured vector store backend."""
        return self._store

    def _resolve_embedder(self) -> Any:
        """Return the injected embedder or resolve one from the environment."""
        if self._embedder is None:
            from rpaforge.llm.embeddings import resolve_embedder

            self._embedder = resolve_embedder()
        return self._embedder

    @activity(name="KB Upsert Documents", category="AI", timeout_ms=180000)
    @tags("kb", "rag", "embed", "index", "knowledge")
    @output("Counts of indexed documents and stored chunks")
    @param("collection", type="string", description="Knowledge base collection name")
    @param("texts", type="list", description="List of document texts to index")
    @param(
        "files",
        type="list",
        description="List of UTF-8 text file paths to index",
    )
    @param("chunk_chars", type="integer", description="Chunk window size in characters")
    @param(
        "chunk_overlap",
        type="integer",
        description="Overlap between chunks in characters",
    )
    @param("metadata", type="dict", description="Metadata attached to every chunk")
    @param(
        "ttl_seconds",
        type="float",
        description="Seconds before indexed chunks expire and stop matching",
    )
    @param(
        "mask_secrets",
        type="boolean",
        description="Mask secret-shaped text before it enters the index",
    )
    def upsert_documents(
        self,
        collection: str = "default",
        texts: list[str] | None = None,
        files: list[str] | None = None,
        chunk_chars: int = DEFAULT_CHUNK_CHARS,
        chunk_overlap: int = DEFAULT_CHUNK_OVERLAP,
        metadata: dict[str, Any] | None = None,
        ttl_seconds: float | None = None,
        mask_secrets: bool = True,
    ) -> dict[str, Any]:
        """Chunk and embed documents into the knowledge base.

        Each document is split into overlapping windows, optionally masked
        for secret-shaped values, embedded and upserted into ``collection``.

        :param collection: Target knowledge base collection.
        :param texts: Document texts to index.
        :param files: UTF-8 text file paths to index.
        :param chunk_chars: Chunk window size in characters.
        :param chunk_overlap: Overlap between consecutive chunks.
        :param metadata: Metadata attached to every stored chunk.
        :param ttl_seconds: Optional time-to-live for the indexed chunks.
        :param mask_secrets: Whether to mask secret-shaped text on ingest.
        :returns: Document/chunk counts for the operation.
        :raises ValueError: When no documents are provided or a file is missing.
        """
        documents = [str(text) for text in (texts or []) if str(text).strip()]
        for file_path in files or []:
            documents.append(_read_text_file(file_path))
        if not documents:
            raise ValueError(
                _("KB Upsert Documents requires 'texts' or 'files' documents")
            )
        if ttl_seconds is not None and ttl_seconds > 0:
            expires_at = (
                datetime.now(timezone.utc) + timedelta(seconds=ttl_seconds)
            ).isoformat()
        else:
            expires_at = None

        total_chunks = 0
        for document in documents:
            if mask_secrets:
                document = self._masker.mask_text(document)
            for piece in _chunk_text(document, chunk_chars, chunk_overlap):
                vector = self._resolve_embedder().embed([piece])[0]
                self._store.upsert(
                    collection,
                    piece,
                    vector,
                    metadata=dict(metadata or {}),
                    expires_at=expires_at,
                )
                total_chunks += 1
        logger.info(
            f"Indexed {len(documents)} documents into '{collection}' "
            f"({total_chunks} chunks)"
        )
        return {
            "collection": collection,
            "documents": len(documents),
            "chunks": total_chunks,
        }

    @activity(name="KB Search", category="AI", timeout_ms=180000)
    @tags("kb", "rag", "search", "semantic", "knowledge")
    @output("Ranked search hits with scores and metadata")
    @param("query", type="string", description="Natural-language search query")
    @param("collection", type="string", description="Knowledge base collection name")
    @param("top_k", type="integer", description="Maximum number of hits to return")
    @param("min_score", type="float", description="Minimum similarity score (0 to 1)")
    @param(
        "filter",
        type="dict",
        description='Exact-match metadata filter, e.g. {"region": "EU"}',
    )
    def search(
        self,
        query: str,
        collection: str = "default",
        top_k: int = 5,
        min_score: float = 0.0,
        filter: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """Return the most relevant chunks for a query.

        :param query: Natural-language search query.
        :param collection: Knowledge base collection to search.
        :param top_k: Maximum number of hits.
        :param min_score: Drop hits below this cosine similarity.
        :param filter: Exact-match filter on top-level metadata keys.
        :returns: Dictionary with the ranked hits.
        :raises ValueError: When the query vector dimension does not match
            the collection's pinned embedding dimension.
        """
        if not str(query).strip():
            raise ValueError(_("KB Search requires a non-empty query"))
        vector = self._resolve_embedder().embed([str(query)])[0]
        hits = self._store.search(
            collection,
            vector,
            top_k=max(1, int(top_k)),
            metadata_filter=filter,
        )
        filtered = [hit for hit in hits if hit.score >= float(min_score)]
        logger.info(
            f"KB search in '{collection}' returned {len(filtered)} hits "
            f"(top_k={top_k}, min_score={min_score})"
        )
        return {
            "query": str(query),
            "collection": collection,
            "hits": [hit.to_dict() for hit in filtered],
        }

    @activity(name="KB Delete", category="AI", timeout_ms=60000)
    @tags("kb", "rag", "delete", "knowledge")
    @output("Number of deleted chunks")
    @param("collection", type="string", description="Knowledge base collection name")
    @param("filter", type="dict", description="Exact-match metadata filter")
    @param(
        "purge_expired_only",
        type="boolean",
        description="Only hard-delete chunks whose TTL already elapsed",
    )
    def delete(
        self,
        collection: str = "default",
        filter: dict[str, Any] | None = None,
        purge_expired_only: bool = False,
    ) -> dict[str, Any]:
        """Delete chunks from the knowledge base.

        With ``purge_expired_only`` only TTL-expired chunks across the whole
        store are removed. Otherwise chunks matching ``filter`` (or the
        entire ``collection`` when no filter is given) are deleted.

        :param collection: Knowledge base collection to delete from.
        :param filter: Exact-match filter on top-level metadata keys.
        :param purge_expired_only: Restrict the deletion to expired chunks.
        :returns: Number of deleted chunks.
        """
        if purge_expired_only:
            deleted = self._store.purge_expired()
        else:
            deleted = self._store.delete(collection, metadata_filter=filter)
        logger.info(f"KB delete removed {deleted} chunks from '{collection}'")
        return {"collection": collection, "deleted": int(deleted)}

    @activity(name="KB Stats", category="AI", timeout_ms=60000)
    @tags("kb", "rag", "stats", "knowledge")
    @output("Per-collection chunk counts and embedding dimensions")
    @param("collection", type="string", description="Limit stats to one collection")
    def stats(self, collection: str | None = None) -> dict[str, Any]:
        """Return chunk counts and dimensions for the knowledge base.

        :param collection: Optional collection to limit the statistics to.
        :returns: Per-collection statistics dictionary.
        """
        report = self._store.stats(collection)
        logger.info(f"KB stats: {json.dumps(report, ensure_ascii=False)}")
        return report


__all__ = ["KB", "KbChunk"]
