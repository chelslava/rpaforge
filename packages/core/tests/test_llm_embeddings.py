"""Tests for embedding providers (issue #902)."""

from __future__ import annotations

import json
import math
from typing import Any

import pytest

from rpaforge.llm.client import LLMError, LLMResponseError
from rpaforge.llm.embeddings import (
    DEFAULT_EMBEDDING_DIM,
    DEFAULT_OLLAMA_BASE_URL,
    HashingEmbedder,
    OllamaEmbedder,
    OpenAICompatEmbedder,
    resolve_embedder,
)

httpx = pytest.importorskip("httpx")


def _mock_client(handler: Any) -> Any:
    return httpx.Client(transport=httpx.MockTransport(handler))


class TestHashingEmbedder:
    def test_deterministic_across_instances(self) -> None:
        first = HashingEmbedder().embed(["refund policy EU"])
        second = HashingEmbedder().embed(["refund policy EU"])
        assert first == second

    def test_normalized(self) -> None:
        vector = HashingEmbedder().embed(["some arbitrary text"])[0]
        assert len(vector) == DEFAULT_EMBEDDING_DIM
        assert math.sqrt(sum(x * x for x in vector)) == pytest.approx(1.0)

    def test_empty_text_gives_zero_vector(self) -> None:
        vector = HashingEmbedder().embed([""])[0]
        assert all(value == 0.0 for value in vector)

    def test_different_texts_differ(self) -> None:
        embedder = HashingEmbedder()
        assert embedder.embed(["alpha beta"])[0] != embedder.embed(["gamma delta"])[0]

    def test_similarity_orders_related_texts_first(self) -> None:
        embedder = HashingEmbedder()

        def dot(a: list[float], b: list[float]) -> float:
            return sum(x * y for x, y in zip(a, b, strict=False))

        query = embedder.embed(["refund policy"])[0]
        close = embedder.embed(["refund policy details"])[0]
        far = embedder.embed(["quarterly revenue report"])[0]
        assert dot(query, close) > dot(query, far)

    def test_dim_too_small_rejected(self) -> None:
        with pytest.raises(ValueError, match="at least 8"):
            HashingEmbedder(dim=4)


class TestResolveEmbedder:
    def test_default_is_hashing(self, monkeypatch: pytest.MonkeyPatch) -> None:
        for var in (
            "RPAFORGE_EMBEDDINGS_PROVIDER",
            "RPAFORGE_EMBEDDINGS_BASE_URL",
            "RPAFORGE_EMBEDDINGS_MODEL",
            "RPAFORGE_EMBEDDINGS_DIM",
        ):
            monkeypatch.delenv(var, raising=False)
        embedder = resolve_embedder()
        assert isinstance(embedder, HashingEmbedder)
        assert embedder.dim == DEFAULT_EMBEDDING_DIM

    def test_dim_env_override(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.delenv("RPAFORGE_EMBEDDINGS_PROVIDER", raising=False)
        monkeypatch.setenv("RPAFORGE_EMBEDDINGS_DIM", "64")
        assert resolve_embedder().dim == 64

    def test_openai_provider_resolves_compat_embedder(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.setenv("RPAFORGE_EMBEDDINGS_PROVIDER", "openai")
        monkeypatch.setenv("RPAFORGE_EMBEDDINGS_API_KEY", "sk-test")
        embedder = resolve_embedder()
        assert isinstance(embedder, OpenAICompatEmbedder)
        assert embedder.model == "text-embedding-3-small"
        assert embedder.base_url == "https://api.openai.com/v1"

    def test_ollama_provider_resolves_native_embedder(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.setenv("RPAFORGE_EMBEDDINGS_PROVIDER", "ollama")
        monkeypatch.delenv("RPAFORGE_EMBEDDINGS_BASE_URL", raising=False)
        monkeypatch.delenv("RPAFORGE_EMBEDDINGS_MODEL", raising=False)
        embedder = resolve_embedder()
        assert isinstance(embedder, OllamaEmbedder)
        assert embedder.model == "nomic-embed-text"
        assert embedder.base_url == DEFAULT_OLLAMA_BASE_URL

    def test_explicit_args_beat_env(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setenv("RPAFORGE_EMBEDDINGS_PROVIDER", "ollama")
        embedder = resolve_embedder(provider="hashing")
        assert isinstance(embedder, HashingEmbedder)

    def test_unknown_provider_raises(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setenv("RPAFORGE_EMBEDDINGS_PROVIDER", "nope")
        with pytest.raises(LLMError, match="Unknown embeddings provider"):
            resolve_embedder()


class TestOpenAICompatEmbedder:
    def test_batched_request_and_ordered_vectors(self) -> None:
        bodies: list[dict[str, Any]] = []

        def handler(request: httpx.Request) -> httpx.Response:
            payload = json.loads(request.content)
            bodies.append(payload)
            return httpx.Response(
                200,
                json={
                    "data": [
                        {"index": index, "embedding": [1.0, 0.5]}
                        for index in range(len(payload["input"]))
                    ]
                },
            )

        embedder = OpenAICompatEmbedder(
            model="m",
            base_url="https://api.example.com/v1",
            client=_mock_client(handler),
        )
        vectors = embedder.embed(["a", "b", "c"])
        assert len(vectors) == 3
        assert bodies[0]["input"] == ["a", "b", "c"]
        assert bodies[0]["model"] == "m"

    def test_large_input_batches(self) -> None:
        sizes: list[int] = []

        def handler(request: httpx.Request) -> httpx.Response:
            payload = json.loads(request.content)
            sizes.append(len(payload["input"]))
            return httpx.Response(
                200,
                json={
                    "data": [
                        {"index": index, "embedding": [1.0, 0.0]}
                        for index in range(len(payload["input"]))
                    ]
                },
            )

        embedder = OpenAICompatEmbedder(
            model="m",
            base_url="https://api.example.com/v1",
            client=_mock_client(handler),
        )
        vectors = embedder.embed([f"text-{index}" for index in range(150)])
        assert len(vectors) == 150
        assert sizes == [64, 64, 22]

    def test_http_error_raises_llm_response_error(self) -> None:
        def handler(request: httpx.Request) -> httpx.Response:
            return httpx.Response(500, text="boom")

        embedder = OpenAICompatEmbedder(
            model="m",
            base_url="https://api.example.com/v1",
            client=_mock_client(handler),
        )
        with pytest.raises(LLMResponseError, match="500"):
            embedder.embed(["text"])

    def test_malformed_payload_raises(self) -> None:
        def handler(request: httpx.Request) -> httpx.Response:
            return httpx.Response(200, json={"data": []})

        embedder = OpenAICompatEmbedder(
            model="m",
            base_url="https://api.example.com/v1",
            client=_mock_client(handler),
        )
        with pytest.raises(LLMResponseError, match="batch size"):
            embedder.embed(["text"])


class TestOllamaEmbedder:
    def test_sequential_prompts(self) -> None:
        payloads: list[dict[str, Any]] = []

        def handler(request: httpx.Request) -> httpx.Response:
            payload = json.loads(request.content)
            payloads.append(payload)
            return httpx.Response(200, json={"embedding": [0.5, 0.5]})

        embedder = OllamaEmbedder(
            model="nomic-embed-text",
            base_url="http://localhost:11434",
            client=_mock_client(handler),
        )
        vectors = embedder.embed(["one", "two"])
        assert vectors == [[0.5, 0.5], [0.5, 0.5]]
        assert [entry["prompt"] for entry in payloads] == ["one", "two"]
        assert payloads[0]["model"] == "nomic-embed-text"

    def test_missing_embedding_raises(self) -> None:
        def handler(request: httpx.Request) -> httpx.Response:
            return httpx.Response(200, json={"unexpected": True})

        embedder = OllamaEmbedder(
            model="m",
            base_url="http://localhost:11434",
            client=_mock_client(handler),
        )
        with pytest.raises(LLMResponseError, match="embedding"):
            embedder.embed(["text"])
