"""SQLite-backed local vector store (issue #902).

Follows the proven ``queues/sqlite_store.py`` patterns: per-operation
connections with WAL + ``busy_timeout``, a single process-wide
``threading.Lock``, uuid4 ids, ISO-UTC timestamps, JSON payloads as TEXT and
guarded additive migrations. Vectors are stored as JSON arrays and normalized
on insert, so search degenerates to a dot product (cosine on unit vectors) in
pure Python, with an optional numpy fast path when numpy is importable.
"""

from __future__ import annotations

import contextlib
import json
import sqlite3
import threading
import uuid
from collections.abc import Sequence
from pathlib import Path
from typing import Any

from rpaforge.config import get_kb_dir
from rpaforge.kb.models import KbChunk, KbSearchHit, utc_now_iso


def _l2_normalize(vector: Sequence[float]) -> list[float]:
    """Return ``vector`` scaled to unit Euclidean length (zero stays zero)."""
    values = [float(x) for x in vector]
    norm = sum(x * x for x in values) ** 0.5
    if norm == 0.0:
        return values
    return [x / norm for x in values]


try:  # optional acceleration only; the base path stays dependency-free
    import numpy as _np
except ImportError:  # pragma: no cover - exercised only without numpy
    _np = None  # type: ignore[assignment]


def _dot(a: Sequence[float], b: Sequence[float]) -> float:
    """Dot product with a numpy fast path when available."""
    if _np is not None:
        return float(
            _np.dot(
                _np.asarray(a, dtype=_np.float64), _np.asarray(b, dtype=_np.float64)
            )
        )
    return sum(x * y for x, y in zip(a, b, strict=False))


def _json_path_expr(key: str) -> str:
    """Build a SQLite ``json_extract`` path expression for one metadata key."""
    escaped = key.replace('"', '""')
    return f'$."{escaped}"'


class SQLiteVectorStore:
    """Zero-configuration local embedded vector store using SQLite with WAL mode."""

    def __init__(self, db_path: Path | str | None = None) -> None:
        if db_path is None:
            base_dir = get_kb_dir()
            base_dir.mkdir(parents=True, exist_ok=True)
            self.db_path = base_dir / "kb.db"
        else:
            self.db_path = Path(db_path)
            self.db_path.parent.mkdir(parents=True, exist_ok=True)

        self._lock = threading.Lock()
        self._init_db()

    def _get_connection(self) -> sqlite3.Connection:
        conn = sqlite3.connect(
            str(self.db_path),
            timeout=30.0,
            isolation_level="DEFERRED",
        )
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode=WAL;")
        conn.execute("PRAGMA busy_timeout=5000;")
        return conn

    def _init_db(self) -> None:
        with self._lock, self._get_connection() as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS kb_chunks (
                    id TEXT PRIMARY KEY,
                    collection TEXT NOT NULL,
                    text TEXT NOT NULL,
                    vector_json TEXT NOT NULL,
                    dim INTEGER NOT NULL,
                    metadata_json TEXT NOT NULL,
                    expires_at TEXT,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                )
                """
            )
            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_kb_chunks_collection "
                "ON kb_chunks (collection)"
            )
            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_kb_chunks_expires "
                "ON kb_chunks (expires_at)"
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS kb_collections (
                    name TEXT PRIMARY KEY,
                    dim INTEGER NOT NULL
                )
                """
            )
            conn.commit()

    @staticmethod
    def _row_to_chunk(row: sqlite3.Row) -> KbChunk:
        vector: list[float] = []
        metadata: dict[str, Any] = {}
        with contextlib.suppress(Exception):
            vector = json.loads(row["vector_json"])
        with contextlib.suppress(Exception):
            metadata = json.loads(row["metadata_json"])
        return KbChunk(
            id=row["id"],
            collection=row["collection"],
            text=row["text"],
            vector=vector,
            metadata=metadata,
            expires_at=row["expires_at"],
            created_at=row["created_at"],
            updated_at=row["updated_at"],
        )

    @staticmethod
    def _filter_predicate(metadata_filter: dict[str, Any] | None) -> Any:
        """Compile an exact-match metadata filter into a row predicate.

        Returns ``None`` when no filter is given; otherwise a callable over
        the parsed metadata dict so both the SQL pre-filter and this
        predicate agree on semantics.
        """
        if not metadata_filter:
            return None
        keys = list(metadata_filter.items())

        def predicate(metadata: dict[str, Any]) -> bool:
            return all(metadata.get(key) == value for key, value in keys)

        return predicate

    def _require_collection_dim(
        self, conn: sqlite3.Connection, collection: str, dim: int
    ) -> None:
        """Validate ``dim`` against the collection's pinned dimension."""
        row = conn.execute(
            "SELECT dim FROM kb_collections WHERE name = ?", (collection,)
        ).fetchone()
        if row is None:
            conn.execute(
                "INSERT INTO kb_collections (name, dim) VALUES (?, ?)",
                (collection, dim),
            )
        elif int(row["dim"]) != dim:
            raise ValueError(
                f"Vector dimension mismatch for collection '{collection}': "
                f"expected {int(row['dim'])}, got {dim}"
            )

    def _check_query_dim(self, collection: str, dim: int) -> None:
        """Validate a query vector dimension against the pinned collection dim.

        An unknown collection is allowed (it simply has no hits) so search
        does not require a prior upsert.
        """
        with self._lock, self._get_connection() as conn:
            row = conn.execute(
                "SELECT dim FROM kb_collections WHERE name = ?", (collection,)
            ).fetchone()
        if row is not None and int(row["dim"]) != dim:
            raise ValueError(
                f"Query vector dimension mismatch for collection "
                f"'{collection}': expected {int(row['dim'])}, got {dim}"
            )

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
        """Insert or replace one chunk; the vector is L2-normalized on write."""
        dim = len(vector)
        if dim == 0:
            raise ValueError("Cannot upsert a chunk with an empty vector")
        resolved_id = chunk_id or str(uuid.uuid4())
        now = utc_now_iso()
        normalized = _l2_normalize(vector)
        metadata_json = json.dumps(metadata or {}, ensure_ascii=False)

        with self._lock, self._get_connection() as conn:
            self._require_collection_dim(conn, collection, dim)
            conn.execute(
                """
                INSERT INTO kb_chunks (
                    id, collection, text, vector_json, dim, metadata_json,
                    expires_at, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    collection = excluded.collection,
                    text = excluded.text,
                    vector_json = excluded.vector_json,
                    dim = excluded.dim,
                    metadata_json = excluded.metadata_json,
                    expires_at = excluded.expires_at,
                    updated_at = excluded.updated_at
                """,
                (
                    resolved_id,
                    collection,
                    text,
                    json.dumps(normalized, ensure_ascii=False),
                    dim,
                    metadata_json,
                    expires_at,
                    now,
                    now,
                ),
            )
            conn.commit()

        return KbChunk(
            id=resolved_id,
            collection=collection,
            text=text,
            vector=normalized,
            metadata=dict(metadata or {}),
            expires_at=expires_at,
            created_at=now,
            updated_at=now,
        )

    def search(
        self,
        collection: str,
        query_vector: Sequence[float],
        *,
        top_k: int = 5,
        metadata_filter: dict[str, Any] | None = None,
    ) -> list[KbSearchHit]:
        """Return the ``top_k`` most similar live chunks, best first."""
        self._check_query_dim(collection, len(query_vector))
        normalized_query = _l2_normalize(query_vector)
        predicate = self._filter_predicate(metadata_filter)
        now = utc_now_iso()
        bounded_top_k = max(0, int(top_k))
        with self._lock, self._get_connection() as conn:
            rows = conn.execute(
                """
                SELECT * FROM kb_chunks
                WHERE collection = ?
                  AND (expires_at IS NULL OR expires_at > ?)
                """,
                (collection, now),
            ).fetchall()

        hits: list[tuple[float, KbChunk]] = []
        for row in rows:
            chunk = self._row_to_chunk(row)
            if predicate is not None and not predicate(chunk.metadata):
                continue
            score = _dot(normalized_query, chunk.vector)
            hits.append((score, chunk))
        hits.sort(key=lambda item: item[0], reverse=True)
        return [
            KbSearchHit(
                id=chunk.id,
                text=chunk.text,
                score=score,
                metadata=chunk.metadata,
            )
            for score, chunk in hits[:bounded_top_k]
        ]

    def delete(
        self,
        collection: str,
        *,
        chunk_ids: Sequence[str] | None = None,
        metadata_filter: dict[str, Any] | None = None,
    ) -> int:
        """Delete chunks by ids and/or metadata filter; returns the count."""
        predicate = self._filter_predicate(metadata_filter)
        with self._lock, self._get_connection() as conn:
            if chunk_ids is not None and not predicate:
                ids = [str(chunk_id) for chunk_id in chunk_ids]
                if not ids:
                    return 0
                placeholders = ",".join("?" for _ in ids)
                cur = conn.execute(
                    f"""
                    DELETE FROM kb_chunks
                    WHERE collection = ? AND id IN ({placeholders})
                    """,
                    (collection, *ids),
                )
                conn.commit()
                return cur.rowcount

            rows = conn.execute(
                "SELECT id, metadata_json FROM kb_chunks WHERE collection = ?",
                (collection,),
            ).fetchall()
            doomed: list[str] = []
            for row in rows:
                if chunk_ids is not None and row["id"] not in chunk_ids:
                    continue
                if predicate is not None:
                    metadata: dict[str, Any] = {}
                    with contextlib.suppress(Exception):
                        metadata = json.loads(row["metadata_json"])
                    if not predicate(metadata):
                        continue
                doomed.append(row["id"])
            if not doomed:
                return 0
            placeholders = ",".join("?" for _ in doomed)
            cur = conn.execute(
                f"DELETE FROM kb_chunks WHERE id IN ({placeholders})", doomed
            )
            conn.commit()
            return cur.rowcount

    def stats(self, collection: str | None = None) -> dict[str, Any]:
        """Return per-collection chunk counts and dimensions."""
        with self._lock, self._get_connection() as conn:
            if collection is not None:
                rows = conn.execute(
                    """
                    SELECT c.name AS name, c.dim AS dim,
                           COUNT(k.id) AS chunks
                    FROM kb_collections c
                    LEFT JOIN kb_chunks k
                      ON k.collection = c.name
                        AND (k.expires_at IS NULL OR k.expires_at > ?)
                    WHERE c.name = ?
                    GROUP BY c.name, c.dim
                    """,
                    (utc_now_iso(), collection),
                ).fetchall()
            else:
                rows = conn.execute(
                    """
                    SELECT c.name AS name, c.dim AS dim,
                           COUNT(k.id) AS chunks
                    FROM kb_collections c
                    LEFT JOIN kb_chunks k
                      ON k.collection = c.name
                        AND (k.expires_at IS NULL OR k.expires_at > ?)
                    GROUP BY c.name, c.dim
                    ORDER BY c.name
                    """,
                    (utc_now_iso(),),
                ).fetchall()

        collections = {
            row["name"]: {"chunks": int(row["chunks"]), "dim": int(row["dim"])}
            for row in rows
        }
        return {
            "collections": collections,
            "total_chunks": sum(entry["chunks"] for entry in collections.values()),
        }

    def purge_expired(self) -> int:
        """Hard-delete chunks whose ``expires_at`` has passed; returns count."""
        cur = self._execute_write(
            "DELETE FROM kb_chunks WHERE expires_at IS NOT NULL AND expires_at <= ?",
            (utc_now_iso(),),
        )
        return cur.rowcount

    def clear(self, collection: str) -> int:
        """Delete every chunk in ``collection``; returns the count."""
        cur = self._execute_write(
            "DELETE FROM kb_chunks WHERE collection = ?", (collection,)
        )
        return cur.rowcount

    def _execute_write(self, query: str, params: tuple[Any, ...]) -> sqlite3.Cursor:
        """Run one write statement under the store lock."""
        with self._lock, self._get_connection() as conn:
            cur = conn.execute(query, params)
            conn.commit()
            return cur
