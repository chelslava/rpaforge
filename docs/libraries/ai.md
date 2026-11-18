# AI Library

The **AI** library adds LLM-powered extraction to RPAForge processes: turn unstructured text into typed, schema-validated data with automatic correction retries.

Requires the optional `[llm]` extra:

```bash
uv pip install "rpaforge-libraries[llm]"
```

## Overview

`Extract Structured Data` prompts the configured LLM provider with your text plus a JSON Schema, then validates every response against that schema. Validation failures are fed back to the model as correction requests, up to `MAX_RETRIES` round-trips, so the activity self-corrects instead of failing on the first malformed answer.

LLM access is provided by the `rpaforge.llm` core module (OpenAI-compatible, Anthropic, and Gemini adapters — the same provider set as Studio). Configure it through environment variables:

| Variable | Purpose |
|---|---|
| `RPAFORGE_LLM_PROVIDER` | `openai`, `openai-compatible`, `ollama`, `vllm`, `anthropic`, or `gemini` |
| `RPAFORGE_LLM_BASE_URL` | Override the provider endpoint (defaults per provider) |
| `RPAFORGE_LLM_MODEL` | Model name, e.g. `gpt-4o-mini` or `llama3.2` |
| `RPAFORGE_LLM_API_KEY` | API key (not required for local Ollama/vLLM) |
| `RPAFORGE_LLM_VISION_MODEL` | Multimodal model for image inputs (used by IDP VLM fallback) |
| `RPAFORGE_LLM_TIMEOUT_S` | Per-attempt HTTP timeout in seconds (default `120`) |
| `RPAFORGE_LLM_MAX_ATTEMPTS` | Total attempts per call, initial request included (default `3`; `1` disables retries) |
| `RPAFORGE_LLM_RETRY_BUDGET_S` | Wall-clock budget covering all attempts of one call (default `300`) |

A fully offline setup only needs a local Ollama server:

```bash
set RPAFORGE_LLM_PROVIDER=ollama       # http://localhost:11434/v1
set RPAFORGE_LLM_MODEL=llama3.2
```

### Transient-failure resilience

Non-streaming LLM calls retry automatically (issue #901): transport errors
and HTTP `429`/`502`/`503`/`504` responses are retried with exponential
backoff and jitter, honouring the server's `Retry-After` header (both
delta-seconds and HTTP-date forms). Auth and validation errors (`401`,
`400`, `422`, …) fail fast — retrying those cannot succeed. Retries stop
at `RPAFORGE_LLM_MAX_ATTEMPTS` attempts or when the
`RPAFORGE_LLM_RETRY_BUDGET_S` budget is exhausted, whichever comes first.

Every `llm_usage` event carries `attempts` and `retry_count`, so retries
are visible in cost and observability tooling.

Three further behaviors are worth knowing:

- **Timeouts cancel the HTTP request.** `RPAFORGE_LLM_TIMEOUT_S` is plumbed
  into `httpx`, so an attempt that stalls is aborted at the socket level
  (and then retried like any other transport failure).
- **Cancellation propagates into LLM calls.** Headless runs (`serve`,
  daemon, `rpaforge-runner`) wire the run-scoped cooperative-cancellation
  token into LLM clients: a cancel request aborts in-flight calls at the
  next attempt boundary or during backoff, instead of waiting for the
  full timeout.
- **Streaming calls are not retried.** `chat_stream` performs a single
  attempt by design — partial output may already have been delivered, and
  a replay would duplicate emitted text.

### Gemini provider quirks

The core Gemini adapter speaks Google's **OpenAI-compatible endpoint**
(`https://generativelanguage.googleapis.com/v1beta/openai`), not the native
Gemini API that Studio's diagram-generation provider uses. Consequently:

- the default base URL ends with `/v1beta/openai` — keep that shape when
  overriding `RPAFORGE_LLM_BASE_URL`;
- authentication is `Authorization: Bearer <API key>` (`RPAFORGE_LLM_API_KEY`);
- JSON mode maps to `response_format: {"type": "json_object"}` like every
  other compatible gateway (no strict JSON-schema enforcement);
- streaming follows the OpenAI SSE protocol, so it works unchanged.

---

## Activities Reference

| Activity | Parameters | Returns | Description |
|---|---|---|---|
| **Extract Structured Data** | `text`, `json_schema`, `model` (optional override), `strict` | `dict` with `data`, `warnings`, `attempts`, `model`, token usage | Extracts a typed object from unstructured text via a schema-constrained LLM call with correction retries. |

- **`json_schema`** accepts a dict or a JSON string, e.g. `{"type": "object", "properties": {...}, "required": [...]}`. A JSON-Schema subset is enforced with pydantic-based coercion.
- **`strict=True`** raises after retries are exhausted; the default `strict=False` returns best-effort data plus a `warnings` list.
- **Token usage** is included in the result dict, so cost is visible per run.

---

## Example: Extract Invoice Fields

Pair the AI library with the [IDP](idp.md) `Get Extraction Schema` activity to parse an invoice in two steps:

```python
from rpaforge_libraries.AI.library import AI
from rpaforge_libraries.IDP.library import IDP

idp = IDP()
ai = AI()

schema = idp.get_extraction_schema("invoice")
result = ai.extract_structured_data(
    text=raw_document_text,
    json_schema=schema,
    strict=True,
)
print(result["data"]["invoice_number"], result["token_usage"])
```

A complete runnable pipeline (PDF → typed fields → Excel) ships in
`examples/invoice-to-excel`.
