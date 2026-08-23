"""Invoice to Excel - end-to-end IDP example for RPAForge (issue #742).

Ties the v0.6.0 Intelligent Document Processing stack together:

    IDP.Parse PDF  ->  AI.Extract Structured Data(INVOICE schema)
        ->  DataFrames.From List(line_items)  ->  DataFrames.Write Excel

The bundled ``sample/invoice.pdf`` keeps everything except the LLM call
offline. For a fully offline run point the LLM at a local Ollama server:

    set RPAFORGE_LLM_PROVIDER=ollama          # http://localhost:11434/v1
    set RPAFORGE_LLM_MODEL=llama3.2           # any instruction-tuned model

Run from the repository root:

    python examples/invoice-to-excel/script.py

The workbook is written to ``examples/invoice-to-excel/output/report.xlsx``.
"""

from __future__ import annotations

import sys
from pathlib import Path

from rpaforge_libraries.AI.library import AI
from rpaforge_libraries.DataFrames.library import DataFrames
from rpaforge_libraries.IDP.library import IDP

SAMPLE_PDF = Path(__file__).resolve().parent / "sample" / "invoice.pdf"
OUTPUT_PATH = Path(__file__).resolve().parent / "output" / "report.xlsx"
FRAME_NAME = "line_items"


def extract_invoice(pdf_path: Path) -> dict:
    """Parse the PDF and extract typed invoice fields via the LLM."""
    idp = IDP()
    document = idp.parse_pdf(str(pdf_path))
    text = "\n".join(str(page.get("text", "")) for page in document["pages"])
    if not text.strip():
        raise RuntimeError(f"No text layer in '{pdf_path}'; use Parse Scanned PDF instead")

    schema = idp.get_extraction_schema("invoice")
    result = AI().extract_structured_data(text, schema, strict=True)
    if result["warnings"]:
        print("Warnings:", *result["warnings"], sep="\n  ")
    return result["data"]


def save_line_items_to_excel(frames: DataFrames, invoice: dict) -> str:
    """Store invoice line items in a DataFrame and write the workbook."""
    rows = [
        {
            "description": item.get("description", ""),
            "quantity": item.get("quantity", ""),
            "unit_price": item.get("unit_price", ""),
            "amount": item.get("amount", ""),
        }
        for item in invoice.get("line_items", [])
    ]
    frames.from_list(rows, frame_name=FRAME_NAME)
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    return frames.write_excel(FRAME_NAME, str(OUTPUT_PATH), sheet="Line Items")


def main() -> int:
    """Run the invoice-to-Excel workflow."""
    invoice: dict = extract_invoice(SAMPLE_PDF)
    print(
        f"Invoice {invoice.get('document_number')} "
        f"({invoice.get('vendor', {}).get('name')}): total {invoice.get('total')} "
        f"{invoice.get('currency')}"
    )
    saved = save_line_items_to_excel(DataFrames(), invoice)
    print(f"Saved line items to {saved}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
