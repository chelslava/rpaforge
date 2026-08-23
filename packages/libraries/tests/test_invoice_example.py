"""Validation for the invoice-to-excel example (issue #742)."""

from __future__ import annotations

import importlib.util
import sys
from pathlib import Path
from typing import Any

import pytest

REPO_ROOT = Path(__file__).resolve().parents[3]
EXAMPLE_DIR = REPO_ROOT / "examples" / "invoice-to-excel"
EXAMPLE_PROCESS = EXAMPLE_DIR / "process.json"
SAMPLE_PDF = EXAMPLE_DIR / "sample" / "invoice.pdf"
REPORT_XLSX = EXAMPLE_DIR / "output" / "report.xlsx"

from rpaforge.core.diagram_converter import DiagramConverter  # noqa: E402
from rpaforge_libraries.AI.schema import validate_against_schema  # noqa: E402
from rpaforge_libraries.IDP.extraction_schemas import load_schema  # noqa: E402


def _load_script_module():
    """Import examples/invoice-to-excel/script.py as a module."""
    spec = importlib.util.spec_from_file_location(
        "invoice_to_excel_script", EXAMPLE_DIR / "script.py"
    )
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


class TestBundledSample:
    def test_sample_pdf_has_invoice_text(self) -> None:
        pypdf = pytest.importorskip("pypdf")
        reader = pypdf.PdfReader(str(SAMPLE_PDF))
        text = "\n".join(page.extract_text() or "" for page in reader.pages)
        assert "INV-2026-0042" in text
        assert "46.98" in text

    def test_sample_text_passes_invoice_schema(self) -> None:
        """The golden extraction of the bundled sample validates strictly."""
        schema = parse = load_schema("invoice")
        golden: dict[str, Any] = {
            "vendor": {"name": "ACME GmbH"},
            "document_number": "INV-2026-0042",
            "document_date": "2026-08-01",
            "due_date": "2026-08-31",
            "currency": "EUR",
            "line_items": [
                {
                    "description": "Widget",
                    "quantity": 2,
                    "unit_price": 9.99,
                    "amount": 19.98,
                },
                {
                    "description": "Gadget",
                    "quantity": 1,
                    "unit_price": 19.5,
                    "amount": 19.5,
                },
            ],
            "subtotal": 39.48,
            "tax_breakdown": [{"name": "VAT", "rate": 19, "amount": 7.5}],
            "total": 46.98,
        }
        errors = validate_against_schema(golden, schema)
        assert errors == []
        assert parse is not None


class TestDiagramConversion:
    """Acceptance: process.json passes the DiagramConverter smoke-check."""

    def _diagram(self) -> dict[str, Any]:
        with open(EXAMPLE_PROCESS, encoding="utf-8") as fh:
            return dict(json.load(fh)) if (json := __import__("json")) else {}

    def test_example_converts_to_expected_chain(self) -> None:
        diagram = self._diagram()
        process = DiagramConverter().convert(diagram)
        calls = [
            (a.library, a.activity) for task in process.tasks for a in task.activities
        ]
        assert ("IDP", "Parse PDF") in calls
        parse_index = calls.index(("IDP", "Parse PDF"))
        assert calls[parse_index + 1] == ("IDP", "Get Extraction Schema")
        assert calls[parse_index + 2] == ("AI", "Extract Structured Data")
        assert calls[parse_index + 3] == ("DataFrames", "From List")
        assert calls[-1] == ("DataFrames", "Write Excel")

    def test_output_variables_chained(self) -> None:
        diagram = self._diagram()
        process = DiagramConverter().convert(diagram)
        outputs = {
            a.activity: a.output_variable
            for task in process.tasks
            for a in task.activities
        }
        assert outputs["Parse PDF"] == "invoiceDoc"
        assert outputs["Get Extraction Schema"] == "invoiceSchema"
        assert outputs["Extract Structured Data"] == "extraction"


class TestScriptEndToEnd:
    """Acceptance: script.py produces report.xlsx from the bundled sample."""

    @pytest.fixture(autouse=True)
    def _mock_llm(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setenv("RPAFORGE_LLM_PROVIDER", "openai-compatible")
        monkeypatch.setenv("RPAFORGE_LLM_MODEL", "fake-model")
        payload = (
            '{"vendor": {"name": "ACME GmbH"}, '
            '"document_number": "INV-2026-0042", '
            '"document_date": "2026-08-01", "currency": "EUR", '
            '"line_items": ['
            '{"description": "Widget", "quantity": 2, "unit_price": 9.99, "amount": 19.98},'
            '{"description": "Gadget", "quantity": 1, "unit_price": 19.5, "amount": 19.5}],'
            '"subtotal": 39.48, "total": 46.98}'
        )

        class _FakeClient:
            def chat(self, *_a: Any, **_kw: Any):
                from rpaforge.llm.client import LLMResult

                return LLMResult(text=payload, model="fake")

        import rpaforge_libraries.AI.library as ai_module

        def _fake_build(*_args: Any, **_kwargs: Any) -> Any:
            return _FakeClient()

        monkeypatch.setattr(ai_module, "_build_client", _fake_build)

    def test_script_produces_report_xlsx(self, polars_check: None = None) -> None:
        dataframes = pytest.importorskip("polars")
        openpyxl = pytest.importorskip("openpyxl")
        del polars_check, dataframes, openpyxl

        REPORT_XLSX.unlink(missing_ok=True)
        module = _load_script_module()

        exit_code = module.main()

        assert exit_code == 0
        assert REPORT_XLSX.is_file()
