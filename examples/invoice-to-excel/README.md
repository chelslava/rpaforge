# Invoice to Excel

End-to-end Intelligent Document Processing example for RPAForge
(issue #742): parse a sample invoice PDF, extract typed fields with the
bundled INVOICE schema through an LLM, and export the line items to an
Excel workbook.

## Workflow

```mermaid
flowchart LR
    A[Start] --> B[IDP: Parse PDF]
    B --> C[IDP: Get Extraction Schema]
    C --> D[AI: Extract Structured Data]
    D --> E[DataFrames: From List]
    E --> F[DataFrames: Write Excel]
    F --> G[End PASS]
```

## Files

| File | Purpose |
| --- | --- |
| `script.py` | Fully runnable standalone script (direct library usage) |
| `process.json` | Visual diagram template in Studio `.process` format v1.1.0 |
| `sample/invoice.pdf` | Tiny synthetic invoice (self-generated fixture, license-safe) |
| `output/` | Created on demand; receives `report.xlsx` |

## Prerequisites

- Python 3.10+
- RPAForge packages installed from this repository:

  ```bash
  pip install -e packages/core
  pip install -e "packages/libraries[idp,llm,dataframes]"
  ```

  (`dataframes` pulls polars + xlsxwriter for the Excel export step.)

- An LLM endpoint for the extraction step (see below).

## LLM configuration

Extraction calls the pluggable `rpaforge.llm` layer configured through
environment variables:

| Variable | Example | Notes |
| --- | --- | --- |
| `RPAFORGE_LLM_PROVIDER` | `ollama` / `openai-compatible` / `anthropic` | required |
| `RPAFORGE_LLM_MODEL` | `llama3.2` | required |
| `RPAFORGE_LLM_BASE_URL` | `http://localhost:11434/v1` | optional for known providers |
| `RPAFORGE_LLM_API_KEY` | `sk-...` | cloud providers only |

### Fully offline path (Ollama)

1. Install [Ollama](https://ollama.com) and pull a model:
   `ollama pull llama3.2`
2. Point RPAForge at it:

   ```bash
   set RPAFORGE_LLM_PROVIDER=ollama
   set RPAFORGE_LLM_MODEL=llama3.2
   ```

3. Run the script - no cloud keys, no data leaving the machine.

## SDK mode (guaranteed runnable)

```bash
python examples/invoice-to-excel/script.py
```

Produces `examples/invoice-to-excel/output/report.xlsx` from the bundled
sample invoice.

## Diagram mode (Studio)

Import `process.json`, wire two bindings, and run:

- `${invoiceText}` - the parsed document text. The SDK script joins
  `invoiceDoc.pages[].text`; in Studio bind this variable to the page
  text (e.g. via Parse Scanned PDF for scans, which also emits words for
  table extraction).
- `${lineItems}` - map `extraction.data.line_items` into it (Assign
  node or a small SDK step) before `From List`.

Both bindings are called out in node descriptions inside the template;
everything else (PDF parsing, schema loading, LLM call, Excel export)
runs as drawn.
