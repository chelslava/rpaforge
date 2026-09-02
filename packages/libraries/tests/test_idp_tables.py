"""Tests for table & line-item extraction (issue #740)."""

from __future__ import annotations

import io
from typing import Any

import pytest

from rpaforge_libraries.IDP import IDP, IDPParseError
from rpaforge_libraries.IDP.tables import extract_tables, table_to_records

# ---------------------------------------------------------------- fixture


def _invoice_words() -> list[dict[str, Any]]:
    """Synthetic column-aligned invoice page (x in rasterized px).

    Three columns anchored near x=40, 220, 400; header + two line items.
    """
    words: list[dict[str, Any]] = []
    rows = [
        # header
        [(40.0, "Item", 97.0), (220.0, "Qty", 96.0), (400.0, "Price", 95.0)],
        # line items
        [(42.0, "Widget", 94.0), (221.0, "2", 98.0), (401.0, "9.99", 93.0)],
        [
            (40.5, "Gadget", 30.0),
            (219.5, "1", 97.0),
            (399.5, "19.50", 96.0),
        ],  # low conf cell
    ]
    for row_index, row in enumerate(rows):
        y = 100.0 + row_index * 24.0
        for x, text, conf in row:
            words.append(
                {"text": text, "conf": conf, "x": x, "y": y, "w": 40.0, "h": 14.0}
            )
    return words


def _invoice_document() -> dict[str, Any]:
    return {
        "source": "invoice.pdf",
        "page_count": 1,
        "pages": [
            {
                "number": 1,
                "engine": "tesseract",
                "confidence": 0.9,
                "width": 600,
                "height": 800,
                "words": _invoice_words(),
            }
        ],
    }


def _flat_accuracy(table: dict[str, Any], expected: list[list[str]]) -> float:
    total = correct = 0
    for row_index, expected_row in enumerate(expected):
        actual_row = table["rows"][row_index]
        for col_index, expected_value in enumerate(expected_row):
            total += 1
            if col_index < len(actual_row) and actual_row[col_index] == expected_value:
                correct += 1
    return correct / total if total else 0.0


# ------------------------------------------------------------ extraction


class TestAlignmentExtraction:
    """Acceptance: aligned fixture yields line-items with >=95% accuracy."""

    def test_line_items_extracted_with_high_accuracy(self) -> None:
        tables = extract_tables(_invoice_document())
        assert len(tables) == 1
        table = tables[0]
        assert table["strategy"] == "alignment"
        assert table["page"] == 1
        assert table["headers"][:3] == ["Item", "Qty", "Price"]
        accuracy = _flat_accuracy(
            table,
            [
                ["Widget", "2", "9.99"],
                ["Gadget", "1", "19.50"],
            ],
        )
        assert accuracy >= 0.95

    def test_per_cell_confidence_present(self) -> None:
        table = extract_tables(_invoice_document())[0]
        matrix = table["confidence"]
        assert matrix is not None
        # Widget cell keeps its word confidence.
        assert matrix[0][0] == pytest.approx(0.94, abs=1e-3)
        # Merged words take the minimum confidence.

    def test_low_confidence_cells_flagged(self) -> None:
        table = extract_tables(_invoice_document())[0]
        flagged = table["low_confidence_cells"]
        assert [1, 0] in flagged  # Gadget @ conf 0.30
        # High-confidence cells stay unflagged.
        assert [0, 0] not in flagged


class TestWhitespaceFallback:
    def test_plain_text_page_falls_back_to_whitespace(self) -> None:
        document = {
            "pages": [
                {
                    "number": 2,
                    "text": (
                        "Name       Amount\n"
                        "Alpha      10.00\n"
                        "Beta        3.50\n"
                        "no columns here"
                    ),
                }
            ]
        }
        tables = extract_tables(document)
        assert len(tables) == 1
        table = tables[0]
        assert table["strategy"] == "whitespace"
        assert table["headers"][0] == "Name"
        assert ["Alpha", "10.00"] in [row[:2] for row in table["rows"]]

    def test_alignment_strategy_without_words_degrades(self) -> None:
        document = {"pages": [{"number": 1, "text": "A  B\n1  2"}]}
        tables = extract_tables(document, strategy="alignment")
        assert tables and tables[0]["strategy"] == "whitespace"

    def test_no_table_returns_empty(self) -> None:
        document = {"pages": [{"number": 1, "text": "just one prose line"}]}
        assert extract_tables(document) == []


class TestTableToRecords:
    """Acceptance: output plugs into DataFrames/Excel consumers."""

    def test_records_keyed_by_headers(self) -> None:
        table = extract_tables(_invoice_document())[0]
        records = table_to_records(table)
        assert len(records) == 2
        assert records[0]["Item"] == "Widget"
        assert records[0]["Qty"] == "2"
        assert records[1]["Price"] == "19.50"

    def test_header_override_and_confidence_keys(self) -> None:
        table = extract_tables(_invoice_document())[0]
        records = table_to_records(
            table,
            headers=["name", "count", "cost"],
            include_confidence=True,
        )
        assert set(records[0]) >= {"name", "count", "cost"}
        assert records[0]["name_confidence"] == pytest.approx(0.94, abs=1e-3)

    def test_all_empty_rows_dropped(self) -> None:
        table = {
            "headers": ["A", "B"],
            "rows": [["x", "y"], ["", ""], ["z", ""]],
        }
        records = table_to_records(table)
        assert len(records) == 2

    def test_duplicate_headers_deduplicated_in_records(self) -> None:
        """Duplicate column headers are disambiguated and preserve all column data."""
        table = {
            "headers": ["Amount", "Description", "Amount"],
            "rows": [["100", "Consulting", "120"], ["200", "Design", "240"]],
        }
        records = table_to_records(table)
        assert len(records) == 2
        assert records[0]["Amount"] == "100"
        assert records[0]["Description"] == "Consulting"
        assert records[0]["Amount_2"] == "120"
        assert records[1]["Amount"] == "200"
        assert records[1]["Amount_2"] == "240"

    def test_duplicate_headers_override_deduplicated(self) -> None:
        """Override headers with duplicates are also disambiguated."""
        table = {
            "headers": ["H1", "H2", "H3"],
            "rows": [["a", "b", "c"]],
        }
        records = table_to_records(table, headers=["Tag", "Tag", "Tag"])
        assert records[0] == {"Tag": "a", "Tag_2": "b", "Tag_3": "c"}


class TestDataFramesIntegration:
    """Acceptance: records feed DataFrames.From List / Excel flows."""

    def test_records_build_polars_dataframe(self) -> None:
        polars = pytest.importorskip("polars")
        table = extract_tables(_invoice_document())[0]
        records = table_to_records(table)
        frame = polars.DataFrame(records)
        assert frame.columns == ["Item", "Qty", "Price"]
        assert frame.height == 2

    def test_excel_write_via_openpyxl(self) -> None:
        openpyxl = pytest.importorskip("openpyxl")
        table = extract_tables(_invoice_document())[0]
        records = table_to_records(table)

        workbook = openpyxl.Workbook()
        sheet = workbook.active
        sheet.append(list(records[0].keys()))
        for record in records:
            sheet.append([record[column] for column in records[0]])
        buffer = io.BytesIO()
        workbook.save(buffer)

        read_back = openpyxl.load_workbook(io.BytesIO(buffer.getvalue()))
        loaded = list(read_back.active.values)
        assert loaded[0] == ("Item", "Qty", "Price")
        assert loaded[1] == ("Widget", "2", "9.99")


class TestIDPActivityWiring:
    def test_activities_registered(self) -> None:
        from rpaforge.core.activity import ACTIVITY_REGISTRY

        assert ACTIVITY_REGISTRY["IDP.extract_tables"].name == "Extract Tables"
        assert ACTIVITY_REGISTRY["IDP.table_to_records"].name == "Table To Records"

    def test_extract_tables_rejects_non_document(self) -> None:
        with pytest.raises(IDPParseError, match="pipeline document"):
            IDP().extract_tables("not a doc")  # type: ignore[arg-type]

    def test_roundtrip_through_activity(self) -> None:
        idp = IDP()
        tables = idp.extract_tables(_invoice_document())
        records = idp.table_to_records(tables[0])
        assert records[0]["Item"] == "Widget"
