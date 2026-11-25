# Knowledge Base (RAG Memory)

RPAForge ships a local-first knowledge base: embed documents into a local
vector store and retrieve the most relevant chunks by cosine similarity —
from diagram activities *and* from inside agentic loops, where agents get
persistent memory that survives across iterations and runs.

Introduced with issue #902. The store is SQLite (WAL mode) in the platform
app-data directory; embeddings default to a fully offline hashing embedder,
so the feature works with **no network, no API keys and no extra
dependencies**.

## Activities (KB library)

| Activity | Purpose |
|---|---|
| `KB Upsert Documents` | Chunk (window + overlap) and embed texts or UTF-8 files |
| `KB Search` | Top-k semantic search with scores and metadata filters |
| `KB Delete` | Delete by metadata filter, or purge TTL-expired chunks |
| `KB Stats` | Per-collection chunk counts and embedding dimensions |

Text is masked for secret-shaped values (passwords, API keys, bearer
tokens — the same masking used in run logs) **before** it enters the
index; disable with `mask_secrets: false`.

```python
from rpaforge import StudioEngine

engine = StudioEngine()
builder = engine.create_process("Index And Query")
builder.add_task("Index And Query").add_activity(
    "KB",
    "upsert_documents",
    collection="policies",
    texts=["Refund policy: EU customers get 30 days"],
).add_activity(
    "KB",
    "search",
    query="refund period",
    collection="policies",
    top_k=3,
    output_variable="kb_hits",
)
result = engine.run(builder.build())
print(result.variables["kb_hits"]["hits"])
```

## Agent memory: the `kb.search` tool

Agentic loops whitelist activities via `allowed_activities`. Add
`kb.search` to the whitelist and the agent can query the same knowledge
base as a built-in tool — no library import, no extra wiring:

```yaml
- type: agentic-loop
  goal: "Answer the customer question using internal policies"
  allowed_activities:
    - kb.search
    - Flow.log_message
```

The tool takes `query` (required), `collection`, `top_k` and `filter`
(a JSON object string with exact-match metadata filters). Results come
back as ranked hits with scores and metadata, appended to the agent
transcript as observations.

## Embedding providers

Configuration resolves from the environment (or pass an `embedder` to the
`KB` library constructor in Python):

| Variable | Meaning |
|---|---|
| `RPAFORGE_EMBEDDINGS_PROVIDER` | `hashing` (default), `openai`, `openai-compatible`, `vllm`, `ollama` |
| `RPAFORGE_EMBEDDINGS_MODEL` | Model name (per-provider default otherwise) |
| `RPAFORGE_EMBEDDINGS_BASE_URL` | Endpoint override |
| `RPAFORGE_EMBEDDINGS_API_KEY` | API key / token |
| `RPAFORGE_EMBEDDINGS_DIM` | Hashing embedder dimension (default 256) |

- **`hashing`** (default): deterministic local feature hashing — offline,
  dependency-free, stable across machines. Quality is bag-of-words level;
  use it for tests and demos.
- **`openai` / `openai-compatible` / `vllm`**: batched OpenAI
  `/embeddings` calls (e.g. `text-embedding-3-small`).
- **`ollama`**: native `POST /api/embeddings` (e.g. `nomic-embed-text`).

The API providers need `httpx`:

```bash
pip install 'rpaforge-core[embeddings]'   # or [llm] — both provide httpx
```

## Collections, dimensions and TTL

Every collection pins the vector dimension of its first upsert; mixing
embedders (e.g. hashing and OpenAI) in one collection raises a dimension
mismatch error instead of silently returning garbage scores. Chunks may
carry a TTL (`ttl_seconds` on upsert): expired chunks stop matching and
are removed by `KB Delete` with `purge_expired_only: true`.

## Storage location

`SQLiteVectorStore` follows the queues-store conventions (WAL, per-process
lock, injectable path). Default database:
`<app-data>/kb/kb.db` (`RPAFORGE_DATA_DIR` overrides the root). Point
`store=` at a different path to keep collections isolated per process or
per tenant.
