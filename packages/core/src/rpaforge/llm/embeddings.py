"""Embedding providers for the knowledge base (issue #902).

Three embedders behind one :class:`Embedder` protocol:

- :class:`HashingEmbedder` — deterministic local feature hashing
  (blake2b over word + character trigram tokens), zero dependencies and
  zero network. The offline default: ``RPAFORGE_EMBEDDINGS_PROVIDER``
  unset resolves to it, and it doubles as the test fake.
- :class:`OpenAICompatEmbedder` — ``POST /embeddings`` (OpenAI format,
  batched). Covers OpenAI, vLLM and Ollama's OpenAI-compatible surface.
- :class:`OllamaEmbedder` — Ollama's native ``POST /api/embeddings``.

``httpx`` is required only by the two API embedders and imported lazily
via :func:`rpaforge.llm.client.load_httpx` (extra ``[llm]`` /
``[embeddings]``).
"""

from __future__ import annotations

import hashlib
import os
import re
from collections.abc import Sequence
from typing import Any, Protocol, cast, runtime_checkable

from rpaforge.config import (
    ENV_EMBEDDINGS_API_KEY,
    ENV_EMBEDDINGS_BASE_URL,
    ENV_EMBEDDINGS_DIM,
    ENV_EMBEDDINGS_MODEL,
    ENV_EMBEDDINGS_PROVIDER,
)
from rpaforge.llm.client import (
    DEFAULT_PROVIDER_BASE_URLS,
    LLMConnectionError,
    LLMError,
    LLMResponseError,
    load_httpx,
)

#: Vector dimension of the default offline :class:`HashingEmbedder`.
DEFAULT_EMBEDDING_DIM = 256
#: Default model names per API provider.
DEFAULT_OPENAI_EMBEDDING_MODEL = "text-embedding-3-small"
DEFAULT_OLLAMA_EMBEDDING_MODEL = "nomic-embed-text"
#: Native (non-OpenAI-compatible) Ollama endpoint root.
DEFAULT_OLLAMA_BASE_URL = "http://localhost:11434"
#: Texts per ``/embeddings`` request.
DEFAULT_EMBEDDING_BATCH_SIZE = 64

_TOKEN_RE = re.compile(r"[a-z0-9]+")


@runtime_checkable
class Embedder(Protocol):
    """Protocol for text embedding backends."""

    def embed(self, texts: Sequence[str]) -> list[list[float]]:
        """Return one vector per input text, in input order."""


class HashingEmbedder:
    """Deterministic offline feature-hashing embedder.

    Words and character trigrams are hashed with blake2b into a fixed
    ``dim``-bucket bag-of-features vector, then L2-normalized. Not
    semantic-quality, but stable across processes and machines — good
    enough for tests, demos and offline smoke runs.
    """

    def __init__(self, dim: int = DEFAULT_EMBEDDING_DIM) -> None:
        if dim < 8:
            raise ValueError("HashingEmbedder dim must be at least 8")
        self.dim = dim

    def _tokens(self, text: str) -> list[str]:
        words = _TOKEN_RE.findall(text.lower())
        tokens = list(words)
        for word in words:
            tokens.extend(word[index : index + 3] for index in range(len(word) - 2))
        return tokens

    def embed(self, texts: Sequence[str]) -> list[list[float]]:
        """Hash every text into a normalized ``dim``-dimensional vector."""
        vectors: list[list[float]] = []
        for text in texts:
            buckets = [0.0] * self.dim
            for token in self._tokens(text):
                digest = hashlib.blake2b(token.encode("utf-8"), digest_size=8).digest()
                index = int.from_bytes(digest, "big") % self.dim
                buckets[index] += 1.0
            norm = sum(value * value for value in buckets) ** 0.5
            if norm > 0.0:
                buckets = [value / norm for value in buckets]
            vectors.append(buckets)
        return vectors


class _ApiEmbedder:
    """Shared plumbing for HTTP embedding backends."""

    def __init__(
        self,
        *,
        model: str,
        base_url: str,
        api_key: str = "",
        timeout_s: float = 120.0,
        client: Any | None = None,
    ) -> None:
        if not model:
            raise LLMError("Embedding model must not be empty")
        if not base_url:
            raise LLMError("Embedding base URL must not be empty")
        self.model = model
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self.timeout_s = timeout_s
        self._client = client

    def _get_client(self) -> Any:
        if self._client is None:
            httpx = load_httpx()
            headers: dict[str, str] = {}
            if self.api_key:
                headers["Authorization"] = f"Bearer {self.api_key}"
            self._client = httpx.Client(timeout=self.timeout_s, headers=headers)
        return self._client

    def _post(self, path: str, payload: dict[str, Any]) -> dict[str, Any]:
        try:
            response = self._get_client().post(path, json=payload)
        except Exception as err:
            raise LLMConnectionError(f"Embedding request failed: {err}") from err
        if response.status_code >= 400:
            raise LLMResponseError(
                f"Embedding request returned {response.status_code}: "
                f"{response.text[:300]}"
            )
        try:
            return cast(dict[str, Any], response.json())
        except ValueError as err:
            raise LLMResponseError(
                f"Embedding response was not valid JSON: {err}"
            ) from err

    @staticmethod
    def _batched(texts: Sequence[str], size: int) -> list[list[str]]:
        items = list(texts)
        return [
            items[start : start + size] for start in range(0, len(items), max(1, size))
        ]


class OpenAICompatEmbedder(_ApiEmbedder):
    """Embedder for the OpenAI ``/embeddings`` surface (batched).

    Works with OpenAI, vLLM and Ollama's OpenAI-compatible endpoint
    (``base_url`` ending in ``/v1``).
    """

    def embed(self, texts: Sequence[str]) -> list[list[float]]:
        """Embed ``texts`` in batches of ``DEFAULT_EMBEDDING_BATCH_SIZE``."""
        vectors: list[list[float]] = []
        for batch in self._batched(texts, DEFAULT_EMBEDDING_BATCH_SIZE):
            payload = self._post(
                f"{self.base_url}/embeddings",
                {"model": self.model, "input": batch},
            )
            data = payload.get("data")
            if not isinstance(data, list) or len(data) != len(batch):
                raise LLMResponseError(
                    "Embedding response 'data' does not match the batch size"
                )
            ordered = sorted(data, key=lambda entry: entry.get("index", 0))
            for entry in ordered:
                embedding = entry.get("embedding")
                if not isinstance(embedding, list):
                    raise LLMResponseError(
                        "Embedding response entry has no 'embedding' array"
                    )
                vectors.append([float(value) for value in embedding])
        return vectors


class OllamaEmbedder(_ApiEmbedder):
    """Embedder for Ollama's native ``/api/embeddings`` endpoint.

    The endpoint accepts one prompt per request, so texts are embedded
    sequentially.
    """

    def embed(self, texts: Sequence[str]) -> list[list[float]]:
        """Embed ``texts`` one ``/api/embeddings`` request at a time."""
        vectors: list[list[float]] = []
        for text in texts:
            payload = self._post(
                f"{self.base_url}/api/embeddings",
                {"model": self.model, "prompt": text},
            )
            embedding = payload.get("embedding")
            if not isinstance(embedding, list):
                raise LLMResponseError(
                    "Ollama embedding response has no 'embedding' array"
                )
            vectors.append([float(value) for value in embedding])
        return vectors


def resolve_embedder(
    provider: str | None = None,
    base_url: str | None = None,
) -> Embedder:
    """Build an embedder from explicit args with ``RPAFORGE_EMBEDDINGS_*`` fallbacks.

    Providers: ``hashing`` (default when unset — fully offline),
    ``openai`` / ``openai-compatible`` / ``vllm`` (batched
    ``/embeddings``) and ``ollama`` (native ``/api/embeddings``).
    """
    resolved_provider = (
        (provider or os.environ.get(ENV_EMBEDDINGS_PROVIDER, "") or "hashing")
        .strip()
        .lower()
    )
    resolved_base_url = (
        base_url or os.environ.get(ENV_EMBEDDINGS_BASE_URL, "") or ""
    ).strip()
    model = os.environ.get(ENV_EMBEDDINGS_MODEL, "").strip()
    api_key = os.environ.get(ENV_EMBEDDINGS_API_KEY, "").strip()

    if resolved_provider == "hashing":
        raw_dim = os.environ.get(ENV_EMBEDDINGS_DIM, "").strip()
        dim = int(raw_dim) if raw_dim.isdigit() else DEFAULT_EMBEDDING_DIM
        return HashingEmbedder(dim=dim)
    if resolved_provider == "ollama":
        return OllamaEmbedder(
            model=model or DEFAULT_OLLAMA_EMBEDDING_MODEL,
            base_url=resolved_base_url or DEFAULT_OLLAMA_BASE_URL,
            api_key=api_key,
        )
    if resolved_provider in ("openai", "openai-compatible", "vllm"):
        return OpenAICompatEmbedder(
            model=model or DEFAULT_OPENAI_EMBEDDING_MODEL,
            base_url=resolved_base_url
            or DEFAULT_PROVIDER_BASE_URLS.get(resolved_provider, ""),
            api_key=api_key,
        )
    raise LLMError(
        f"Unknown embeddings provider '{resolved_provider}'. Supported: "
        "hashing, openai, openai-compatible, vllm, ollama."
    )
