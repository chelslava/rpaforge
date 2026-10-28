# AI Library

The **AI** library adds LLM-powered extraction to RPAForge processes: turn unstructured text into typed, schema-validated data with automatic correction retries.

Requires the optional `[llm]` extra:

```bash
uv pip install "rpaforge-libraries[llm]"
```

## Overview

`Extract Structured Data` prompts the configured LLM provider with your text plus a JSON Schema, then validates every response against that schema. Validation failures are fed back to the model as correction requests, up to `MAX_RETRIES` round-trips, so the activity self-corrects instead of failing on the first malformed answer.

LLM access is provided by the `rpaforge.llm` core module (OpenAI-compatible and Anthropic adapters). Configure it through environment variables:

| Variable | Purpose |
|---|---|
| `RPAFORGE_LLM_PROVIDER` | `openai`, `openai-compatible`, `ollama`, `vllm`, or `anthropic` |
| `RPAFORGE_LLM_BASE_URL` | Override the provider endpoint (defaults per provider) |
| `RPAFORGE_LLM_MODEL` | Model name, e.g. `gpt-4o-mini` or `llama3.2` |
| `RPAFORGE_LLM_API_KEY` | API key (not required for local Ollama/vLLM) |
| `RPAFORGE_LLM_VISION_MODEL` | Multimodal model for image inputs (used by IDP VLM fallback) |

A fully offline setup only needs a local Ollama server:

```bash
set RPAFORGE_LLM_PROVIDER=ollama       # http://localhost:11434/v1
set RPAFORGE_LLM_MODEL=llama3.2
```

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
