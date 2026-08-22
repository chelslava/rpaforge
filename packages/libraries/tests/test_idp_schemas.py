"""Tests for pre-built extraction schemas (issue #741)."""

from __future__ import annotations

import json
from typing import Any

import pytest

from rpaforge.core.activity import ACTIVITY_REGISTRY
from rpaforge.llm.client import LLMResult
from rpaforge_libraries.AI.schema import parse_schema, validate_against_schema
from rpaforge_libraries.IDP import IDP
from rpaforge_libraries.IDP.extraction_schemas import (
    SCHEMA_NAMES,
    Schemas,
    load_schema,
)

GOLDEN_INVOICE: dict[str, Any] = {
    "vendor": {"name": "Acme GmbH", "tax_id": "DE123456789"},
    "customer": {"name": "Beta OÜ"},
    "document_number": "INV-2026-0042",
    "document_date": "2026-08-01",
    "due_date": "2026-08-31",
    "currency": "EUR",
    "line_items": [
        {"description": "Widget", "quantity": 2, "unit_price": 9.99, "amount": 19.98},
        {"description": "Gadget", "quantity": 1, "unit_price": 19.5, "amount": 19.5},
    ],
    "subtotal": 39.48,
    "tax_breakdown": [{"name": "VAT", "rate": 19, "amount": 7.5}],
    "total": 46.98,
}

GOLDEN_RECEIPT: dict[str, Any] = {
    "merchant": {"name": "Corner Store", "address": "Main St 1"},
    "receipt_number": "R-777",
    "timestamp": "2026-08-21T18:30:00",
    "currency": "USD",
    "payment_method": "card",
    "line_items": [{"description": "Coffee", "quantity": 1, "amount": 3.5}],
    "tax": 0.28,
    "total": 3.78,
}

GOLDEN_PURCHASE_ORDER: dict[str, Any] = {
    "buyer": {"name": "Beta OÜ"},
    "supplier": {"name": "Acme GmbH"},
    "po_number": "PO-1001",
    "order_date": "2026-07-15",
    "currency": "EUR",
    "line_items": [
        {"sku": "W-1", "description": "Widget", "quantity": 10, "unit_price": 9.0}
    ],
    "total": 90.0,
    "payment_terms": "Net 30",
}


class TestGoldenRoundTrip:
    """Acceptance: each schema validates its own golden sample output."""

    @pytest.mark.parametrize(
        ("doc_type", "golden"),
        [
            ("invoice", GOLDEN_INVOICE),
            ("receipt", GOLDEN_RECEIPT),
            ("purchase_order", GOLDEN_PURCHASE_ORDER),
        ],
    )
    def test_golden_sample_validates(
        self, doc_type: str, golden: dict[str, Any]
    ) -> None:
        schema = load_schema(doc_type)
        parsed = parse_schema(schema)  # must be accepted by our validator subset
        errors = validate_against_schema(golden, parsed)
        assert errors == []

    def test_golden_rejects_missing_required(self) -> None:
        broken = {k: v for k, v in GOLDEN_INVOICE.items() if k != "total"}
        errors = validate_against_schema(broken, parse_schema(load_schema("invoice")))
        assert any("total" in error for error in errors)


class TestLoader:
    def test_unknown_type_lists_options(self) -> None:
        with pytest.raises(KeyError, match="invoice"):
            load_schema("spaceship")

    def test_case_and_separator_normalization(self) -> None:
        assert load_schema("Purchase-Order") == load_schema("purchase_order")
        assert load_schema("RECEIPT") == load_schema("receipt")

    def test_names_constant_covers_bundles(self) -> None:
        assert SCHEMA_NAMES == ("invoice", "receipt", "purchase_order")
        for name in SCHEMA_NAMES:
            schema = load_schema(name)
            assert schema["type"] == "object"
            assert isinstance(schema.get("version"), int)

    def test_namespace_attribute_access(self) -> None:
        holder = Schemas()
        assert holder.INVOICE["title"].startswith("Invoice")
        with pytest.raises(AttributeError):
            _ = holder.SPACESHIP


class TestActivityEndToEnd:
    """Acceptance: Parse PDF -> Extract Structured Data(schema=INVOICE)."""

    def test_get_extraction_schema_activity(self) -> None:
        meta = ACTIVITY_REGISTRY["IDP.get_extraction_schema"]
        assert meta.name == "Get Extraction Schema"
        idp = IDP()
        schema = idp.get_extraction_schema("invoice")
        assert schema["type"] == "object"
        assert "vendor" in schema["properties"]

    def test_parse_pdf_then_extract_structured_data_mocked(
        self, tmp_path: Any, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """Full pipeline on a real minimal PDF with a mocked provider."""
        pypdf = pytest.importorskip("pypdf")
        from rpaforge_libraries.AI import AI
        from rpaforge_libraries.IDP.library import _require_document  # noqa: F401

        writer = pypdf.PdfWriter()
        writer.add_blank_page(width=200, height=200)
        pdf_path = tmp_path / "invoice.pdf"
        with open(pdf_path, "wb") as fh:
            writer.write(fh)

        # Parse PDF (blank page -> empty text is fine; extraction input mocked)
        idp = IDP()
        document = idp.parse_pdf(str(pdf_path))
        text = "\n".join(
            page["text"] or "ACME INV-2026-0042 EUR 46.98" for page in document["pages"]
        )

        payload = json.dumps(
            {
                "vendor": {"name": "Acme GmbH"},
                "document_number": "INV-2026-0042",
                "currency": "EUR",
                "total": 46.98,
            }
        )

        class _FakeClient:
            def chat(self, *_a: Any, **_kw: Any):
                return LLMResult(text=payload, model="fake")

        def _fake_build(*_args: Any, **_kwargs: Any) -> Any:
            return _FakeClient()

        import rpaforge_libraries.AI.library as ai_module

        monkeypatch.setattr(ai_module, "_build_client", _fake_build)

        result = AI().extract_structured_data(
            text, idp.get_extraction_schema("invoice"), model="m", strict=True
        )

        assert result["warnings"] == []
        assert result["data"]["document_number"] == "INV-2026-0042"
        assert result["data"]["total"] == pytest.approx(46.98)
        # Coercion through the pydantic layer normalizes ints for number props.
        assert isinstance(result["data"]["total"], float)
