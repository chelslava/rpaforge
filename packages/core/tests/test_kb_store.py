"""Tests for the SQLite vector store (issue #902)."""

from __future__ import annotations

from pathlib import Path

import pytest

from rpaforge.kb.sqlite_store import SQLiteVectorStore, _l2_normalize


class TestNormalize:
    def test_unit_input_stays_unit(self) -> None:
        assert _l2_normalize([1.0, 0.0]) == [1.0, 0.0]

    def test_scaled_vector_normalized(self) -> None:
        normalized = _l2_normalize([3.0, 4.0])
        assert normalized == pytest.approx([0.6, 0.8])

    def test_zero_vector_stays_zero(self) -> None:
        assert _l2_normalize([0.0, 0.0]) == [0.0, 0.0]


class TestUpsertSearch:
    def test_roundtrip_ranking(self, tmp_path: Path) -> None:
        store = SQLiteVectorStore(tmp_path / "kb.db")
        store.upsert("docs", "alpha doc", [1.0, 0.0, 0.0])
        store.upsert("docs", "beta doc", [0.0, 1.0, 0.0])
        hits = store.search("docs", [1.0, 0.0, 0.0], top_k=2)
        assert hits[0].text == "alpha doc"
        assert hits[0].score == pytest.approx(1.0)
        assert hits[1].text == "beta doc"
        assert hits[1].score == pytest.approx(0.0)

    def test_vectors_stored_normalized(self, tmp_path: Path) -> None:
        store = SQLiteVectorStore(tmp_path / "kb.db")
        chunk = store.upsert("docs", "scaled", [3.0, 4.0])
        assert chunk.vector == pytest.approx([0.6, 0.8])

    def test_top_k_bounds_results(self, tmp_path: Path) -> None:
        store = SQLiteVectorStore(tmp_path / "kb.db")
        for index in range(5):
            store.upsert("docs", f"doc-{index}", [float(index), 1.0])
        hits = store.search("docs", [1.0, 1.0], top_k=3)
        assert len(hits) == 3

    def test_empty_collection_has_no_hits(self, tmp_path: Path) -> None:
        store = SQLiteVectorStore(tmp_path / "kb.db")
        assert store.search("ghost", [1.0, 0.0], top_k=5) == []

    def test_upsert_same_id_replaces(self, tmp_path: Path) -> None:
        store = SQLiteVectorStore(tmp_path / "kb.db")
        store.upsert("docs", "original", [1.0, 0.0], chunk_id="fixed-id")
        store.upsert("docs", "updated", [0.0, 1.0], chunk_id="fixed-id")
        hits = store.search("docs", [0.0, 1.0], top_k=5)
        assert [hit.text for hit in hits] == ["updated"]

    def test_explicit_metadata_round_trips(self, tmp_path: Path) -> None:
        store = SQLiteVectorStore(tmp_path / "kb.db")
        chunk = store.upsert(
            "docs", "tagged", [1.0, 0.0], metadata={"region": "EU", "tier": 2}
        )
        assert chunk.metadata == {"region": "EU", "tier": 2}


class TestDimValidation:
    def test_upsert_dim_mismatch_raises(self, tmp_path: Path) -> None:
        store = SQLiteVectorStore(tmp_path / "kb.db")
        store.upsert("docs", "two-dim", [1.0, 0.0])
        with pytest.raises(ValueError, match="dimension mismatch"):
            store.upsert("docs", "three-dim", [1.0, 0.0, 0.0])

    def test_search_dim_mismatch_raises(self, tmp_path: Path) -> None:
        store = SQLiteVectorStore(tmp_path / "kb.db")
        store.upsert("docs", "two-dim", [1.0, 0.0])
        with pytest.raises(ValueError, match="Query vector dimension mismatch"):
            store.search("docs", [1.0, 0.0, 0.0], top_k=1)

    def test_unknown_collection_search_allowed(self, tmp_path: Path) -> None:
        store = SQLiteVectorStore(tmp_path / "kb.db")
        assert store.search("fresh", [1.0, 2.0, 3.0], top_k=1) == []

    def test_empty_vector_rejected(self, tmp_path: Path) -> None:
        store = SQLiteVectorStore(tmp_path / "kb.db")
        with pytest.raises(ValueError, match="empty vector"):
            store.upsert("docs", "empty", [])


class TestMetadataFilter:
    def test_exact_match_filter(self, tmp_path: Path) -> None:
        store = SQLiteVectorStore(tmp_path / "kb.db")
        store.upsert("docs", "eu doc", [1.0, 0.0], metadata={"region": "EU"})
        store.upsert("docs", "us doc", [1.0, 0.0], metadata={"region": "US"})
        hits = store.search(
            "docs", [1.0, 0.0], top_k=5, metadata_filter={"region": "US"}
        )
        assert [hit.text for hit in hits] == ["us doc"]

    def test_multi_key_filter(self, tmp_path: Path) -> None:
        store = SQLiteVectorStore(tmp_path / "kb.db")
        store.upsert("docs", "match", [1.0], metadata={"a": 1, "b": "x"})
        store.upsert("docs", "partial", [1.0], metadata={"a": 1, "b": "y"})
        hits = store.search("docs", [1.0], top_k=5, metadata_filter={"a": 1, "b": "x"})
        assert [hit.text for hit in hits] == ["match"]

    def test_delete_by_filter(self, tmp_path: Path) -> None:
        store = SQLiteVectorStore(tmp_path / "kb.db")
        store.upsert("docs", "eu", [1.0], metadata={"region": "EU"})
        store.upsert("docs", "us", [1.0], metadata={"region": "US"})
        deleted = store.delete("docs", metadata_filter={"region": "EU"})
        assert deleted == 1
        remaining = store.search("docs", [1.0], top_k=5)
        assert [hit.text for hit in remaining] == ["us"]


class TestDelete:
    def test_delete_by_ids(self, tmp_path: Path) -> None:
        store = SQLiteVectorStore(tmp_path / "kb.db")
        first = store.upsert("docs", "one", [1.0, 0.0])
        store.upsert("docs", "two", [0.0, 1.0])
        assert store.delete("docs", chunk_ids=[first.id]) == 1
        assert len(store.search("docs", [1.0, 0.0], top_k=5)) == 1

    def test_clear_collection(self, tmp_path: Path) -> None:
        store = SQLiteVectorStore(tmp_path / "kb.db")
        store.upsert("docs", "one", [1.0])
        store.upsert("other", "two", [1.0])
        assert store.clear("docs") == 1
        assert store.stats("docs")["collections"]["docs"]["chunks"] == 0
        assert store.stats("other")["collections"]["other"]["chunks"] == 1


class TestTtl:
    def test_expired_chunks_do_not_match(self, tmp_path: Path) -> None:
        store = SQLiteVectorStore(tmp_path / "kb.db")
        store.upsert("docs", "stale", [1.0], expires_at="2000-01-01T00:00:00+00:00")
        store.upsert("docs", "fresh", [1.0])
        hits = store.search("docs", [1.0], top_k=5)
        assert [hit.text for hit in hits] == ["fresh"]

    def test_purge_expired_removes_only_expired(self, tmp_path: Path) -> None:
        store = SQLiteVectorStore(tmp_path / "kb.db")
        store.upsert("docs", "stale", [1.0], expires_at="2000-01-01T00:00:00+00:00")
        store.upsert("docs", "fresh", [1.0])
        assert store.purge_expired() == 1
        assert store.purge_expired() == 0
        assert len(store.search("docs", [1.0], top_k=5)) == 1


class TestPersistenceAndStats:
    def test_persists_across_instances(self, tmp_path: Path) -> None:
        db_path = tmp_path / "kb.db"
        first = SQLiteVectorStore(db_path)
        first.upsert("docs", "kept", [1.0, 0.0])
        second = SQLiteVectorStore(db_path)
        hits = second.search("docs", [1.0, 0.0], top_k=5)
        assert [hit.text for hit in hits] == ["kept"]

    def test_stats_reports_collections(self, tmp_path: Path) -> None:
        store = SQLiteVectorStore(tmp_path / "kb.db")
        store.upsert("docs", "one", [1.0, 0.0])
        store.upsert("docs", "two", [0.0, 1.0])
        store.upsert("wiki", "three", [1.0, 0.0, 0.0])
        report = store.stats()
        assert report["total_chunks"] == 3
        assert report["collections"]["docs"] == {"chunks": 2, "dim": 2}
        assert report["collections"]["wiki"] == {"chunks": 1, "dim": 3}
        scoped = store.stats("docs")
        assert scoped["total_chunks"] == 2
