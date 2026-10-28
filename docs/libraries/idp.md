# IDP Library

The **IDP** (Intelligent Document Processing) library parses documents — PDF, DOCX and images — into a common *pipeline document* dict, recovers tables, and ships pre-built extraction schemas for invoice-style documents.

Requires the optional `[idp]` extra:

```bash
uv pip install "rpaforge-libraries[idp]"
```

## Overview

Every parser returns the same structure: a dict with `pages`, where each page carries its text and (for OCR paths) per-word or per-page confidence. Downstream activities — `Extract Tables`, `Table To Records`, or the [AI](ai.md) library — consume that document without caring where it came from.

`Parse Scanned PDF` is a **hybrid OCR** pipeline: pages are read with Tesseract and only pages whose mean word confidence falls below `min_confidence` escalate to the multimodal LLM (VLM) — so the expensive model is paid only where the cheap one is unsure. The result records provenance per page (ocr vs vlm).

---

## Activities Reference

| Activity | Parameters | Returns | Description |
|---|---|---|---|
| **Parse PDF** | `path`, `pages` (e.g. `'1,3-5'`) | Pipeline document dict | Extracts text (and structure) from a digital PDF. |
| **Parse DOCX** | `path` | Pipeline document dict | Extracts body paragraphs from a Word document. |
| **Load Image** | `path` | Pipeline document dict | Loads a TIFF/PNG/JPEG image for the OCR pipeline. |
| **Parse Scanned PDF** | `path`, `pages`, `min_confidence`, `vlm_fallback` | Pipeline document dict | Hybrid OCR: Tesseract first, VLM escalation for low-confidence pages. |
| **Get Extraction Schema** | `doc_type` (`invoice` / `receipt` / `purchase_order`) | JSON Schema dict | Loads a bundled extraction schema for `Extract Structured Data`. |
| **Extract Tables** | `doc`, `strategy` (`alignment` / `whitespace`) | Table dict(s) | Recovers table structure from a pipeline document; alignment clustering handles colspan/rowspan-free grids with per-cell confidence. |
| **Table To Records** | `table`, `headers` (optional override), `include_confidence` | List of record dicts | Converts a recovered table into row records, ready for `DataFrames.From List`. |

!!! note "VLM fallback sends images externally"
    With `vlm_fallback=True`, low-confidence page images are sent to the configured
    multimodal provider (`RPAFORGE_LLM_VISION_MODEL`). Keep it `False` for
    air-gapped installations.

---

## Example: Scanned Invoices to Records

```python
from rpaforge_libraries.IDP.library import IDP

idp = IDP()

document = idp.parse_scanned_pdf("scans/invoice.pdf", min_confidence=0.85, vlm_fallback=True)
tables = idp.extract_tables(document, strategy="alignment")
for table in tables:
    records = idp.table_to_records(table)
```

For the full pipeline — parse → LLM extraction → Excel report — see the runnable
`examples/invoice-to-excel` example and the [AI library](ai.md) page.
