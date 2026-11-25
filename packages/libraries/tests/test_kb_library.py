"""Tests for the KB knowledge-base library (issue #902)."""

from __future__ import annotations

from pathlib import Path

import pytest

from rpaforge.kb.sqlite_store import SQLiteVectorStore
from rpaforge.llm.embeddings import HashingEmbedder
from rpaforge_libraries.KB import KB


@pytest.fixture()
def kb(tmp_path: Path) -> KB:
    """KB library on a temp store with a deterministic offline embedder."""
    return KB(
        store=SQLiteVectorStore(tmp_path / "kb.db"),
        embedder=HashingEmbedder(),
    )


class TestUpsertDocuments:
    def test_upsert_and_search_roundtrip(self, kb: KB) -> None:
        result = kb.upsert_documents(
            collection="docs",
            texts=[
                "The refund policy for EU customers is 30 days",
                "Quarterly revenue grew by twelve percent",
            ],
        )
        assert result == {"collection": "docs", "documents": 2, "chunks": 2}

        found = kb.search("refund policy EU", collection="docs", top_k=1)
        assert found["hits"], found
        assert "refund policy for EU" in found["hits"][0]["text"]

    def test_no_documents_raises(self, kb: KB) -> None:
        with pytest.raises(ValueError, match="requires 'texts' or 'files'"):
            kb.upsert_documents(collection="docs", texts=[])

    def test_files_are_read(self, kb: KB, tmp_path: Path) -> None:
        doc = tmp_path / "policy.txt"
        doc.write_text("escalation path: tier one then tier two", encoding="utf-8")
        result = kb.upsert_documents(collection="docs", files=[str(doc)])
        assert result["documents"] == 1
        found = kb.search("escalation path tier", collection="docs", top_k=1)
        assert found["hits"], found
        assert "escalation path" in found["hits"][0]["text"]

    def test_missing_file_raises(self, kb: KB, tmp_path: Path) -> None:
        with pytest.raises(ValueError, match="File not found"):
            kb.upsert_documents(collection="docs", files=[str(tmp_path / "ghost.txt")])

    def test_chunking_splits_long_documents(self, kb: KB) -> None:
        long_text = " ".join(f"sentence {index} about logistics" for index in range(80))
        result = kb.upsert_documents(
            collection="chunks",
            texts=[long_text],
            chunk_chars=200,
            chunk_overlap=20,
        )
        assert result["chunks"] > 1
        hits = kb.search("sentence about logistics", collection="chunks", top_k=3)
        assert hits["hits"]
        assert all(len(hit["text"]) <= 200 for hit in hits["hits"])

    def test_metadata_attached_to_chunks(self, kb: KB) -> None:
        kb.upsert_documents(
            collection="meta",
            texts=["policy text"],
            metadata={"region": "EU", "version": 2},
        )
        hits = kb.search("policy text", collection="meta", top_k=1)
        assert hits["hits"][0]["metadata"] == {"region": "EU", "version": 2}

    def test_mask_secrets_redacts_secret_shaped_text(self, kb: KB) -> None:
        kb.upsert_documents(
            collection="secrets",
            texts=["the api_key: sk-proj-supersecret123 rotates monthly"],
            mask_secrets=True,
        )
        hits = kb.search("api_key rotates monthly", collection="secrets", top_k=5)
        assert hits["hits"], "expected at least one hit"
        for hit in hits["hits"]:
            assert "sk-proj-supersecret123" not in hit["text"]
        assert any("[REDACTED]" in hit["text"] for hit in hits["hits"])

    def test_mask_secrets_disabled_keeps_text(self, kb: KB) -> None:
        kb.upsert_documents(
            collection="plain",
            texts=["api_key: sk-proj-supersecret123 rotates monthly"],
            mask_secrets=False,
        )
        hits = kb.search("api_key rotates", collection="plain", top_k=5)
        assert any("sk-proj-supersecret123" in hit["text"] for hit in hits["hits"])


class TestSearch:
    def test_empty_query_raises(self, kb: KB) -> None:
        with pytest.raises(ValueError, match="non-empty query"):
            kb.search("   ")

    def test_metadata_filter(self, kb: KB) -> None:
        kb.upsert_documents(
            collection="filtered",
            texts=["refund policy EU"],
            metadata={"region": "EU"},
        )
        kb.upsert_documents(
            collection="filtered",
            texts=["refund policy US"],
            metadata={"region": "US"},
        )
        hits = kb.search(
            "refund policy",
            collection="filtered",
            top_k=5,
            filter={"region": "US"},
        )
        assert len(hits["hits"]) == 1
        assert hits["hits"][0]["metadata"]["region"] == "US"

    def test_min_score_drops_weak_hits(self, kb: KB) -> None:
        kb.upsert_documents(collection="scored", texts=["exact topic match"])
        hits = kb.search(
            "completely unrelated query words",
            collection="scored",
            top_k=5,
            min_score=0.99,
        )
        assert hits["hits"] == []

    def test_result_shape(self, kb: KB) -> None:
        kb.upsert_documents(collection="shape", texts=["some text"])
        found = kb.search("some text", collection="shape", top_k=2)
        assert found["query"] == "some text"
        assert found["collection"] == "shape"
        hit = found["hits"][0]
        assert set(hit.keys()) == {"id", "text", "score", "metadata"}


class TestDeleteAndStats:
    def test_delete_with_filter(self, kb: KB) -> None:
        kb.upsert_documents(
            collection="doomed",
            texts=["keep me"],
            metadata={"keep": True},
        )
        kb.upsert_documents(
            collection="doomed",
            texts=["drop me"],
            metadata={"keep": False},
        )
        result = kb.delete(collection="doomed", filter={"keep": False})
        assert result == {"collection": "doomed", "deleted": 1}
        remaining = kb.search("keep me", collection="doomed", top_k=5)
        assert len(remaining["hits"]) == 1

    def test_purge_expired_only(self, kb: KB) -> None:
        kb.upsert_documents(collection="ttl", texts=["live text"])
        result = kb.delete(collection="ttl", purge_expired_only=True)
        assert result["deleted"] == 0
        assert kb.search("live text", collection="ttl", top_k=1)["hits"]

    def test_stats(self, kb: KB) -> None:
        kb.upsert_documents(collection="one", texts=["a", "b"])
        kb.upsert_documents(collection="two", texts=["c"])
        report = kb.stats()
        assert report["total_chunks"] == 3
        assert report["collections"]["one"]["chunks"] == 2
        scoped = kb.stats(collection="two")
        assert scoped["total_chunks"] == 1

    def test_dim_mismatch_between_embedders(self, tmp_path: Path) -> None:
        store = SQLiteVectorStore(tmp_path / "kb.db")
        kb_256 = KB(store=store, embedder=HashingEmbedder(dim=256))
        kb_64 = KB(store=store, embedder=HashingEmbedder(dim=64))
        kb_256.upsert_documents(collection="mixed", texts=["first"])
        with pytest.raises(ValueError, match="dimension mismatch"):
            kb_64.search("first", collection="mixed")
