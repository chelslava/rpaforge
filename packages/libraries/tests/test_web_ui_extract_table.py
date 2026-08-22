"""Tests for the WebUI Extract Table activity (pure and mocked units)."""

from __future__ import annotations

from pathlib import Path

import pytest

from rpaforge.core.activity import ACTIVITY_REGISTRY
from rpaforge.core.diagram_converter import DiagramConverter
from rpaforge_libraries.WebUI import WebUI
from rpaforge_libraries.WebUI.library import _grid_to_records

REPO_ROOT = Path(__file__).resolve().parents[3]
EXAMPLE_PROCESS = REPO_ROOT / "examples" / "web-scraper-to-excel" / "process.json"


class TestGridToRecords:
    """Tests for the pure grid-to-records conversion."""

    def test_basic_records_keyed_by_headers(self):
        """Test a simple grid maps rows onto headers."""
        grid = [
            ["Name", "Age"],
            ["Alice", "30"],
            ["Bob", "40"],
        ]
        assert _grid_to_records(grid) == [
            {"Name": "Alice", "Age": "30"},
            {"Name": "Bob", "Age": "40"},
        ]

    def test_duplicate_headers_get_deterministic_suffixes(self):
        """Test repeated header names become Name, Name_2, Name_3."""
        grid = [
            ["Name", "Name", "Name"],
            ["a", "b", "c"],
        ]
        record = _grid_to_records(grid)[0]
        assert list(record) == ["Name", "Name_2", "Name_3"]

    def test_blank_headers_fall_back_to_column_n(self):
        """Test blank header cells fall back to column_N names."""
        grid = [
            ["A", "", "  "],
            ["1", "2", "3"],
        ]
        record = _grid_to_records(grid)[0]
        assert list(record) == ["A", "column_2", "column_3"]

    def test_empty_cells_coerce_to_empty_string(self):
        """Test missing cells coerce to '' instead of None."""
        grid = [
            ["A", "B"],
            ["x"],
        ]
        record = _grid_to_records(grid)[0]
        assert record == {"A": "x", "B": ""}
        assert all(isinstance(v, str) for v in record.values())

    def test_ragged_rows_are_truncated_to_header_width(self):
        """Test extra trailing cells beyond the header count are dropped."""
        grid = [
            ["A"],
            ["x", "ignored"],
        ]
        assert _grid_to_records(grid) == [{"A": "x"}]

    def test_non_string_cells_are_coerced(self):
        """Test None becomes '' and numbers are stringified."""
        grid = [
            ["A", "B"],
            [None, 7],
        ]
        assert _grid_to_records(grid) == [{"A": "", "B": "7"}]

    def test_header_row_variant(self):
        """Test header_row selects a lower grid row as the header."""
        grid = [
            ["Report"],
            ["City", "Zip"],
            ["Berlin", "10115"],
        ]
        assert _grid_to_records(grid, header_row=2) == [
            {"City": "Berlin", "Zip": "10115"}
        ]

    def test_max_rows_limits_data_rows(self):
        """Test max_rows caps the number of extracted records."""
        grid = [
            ["N"],
            ["1"],
            ["2"],
            ["3"],
        ]
        records = _grid_to_records(grid, max_rows=2)
        assert records == [{"N": "1"}, {"N": "2"}]

    def test_empty_grid_returns_empty_list(self):
        """Test an empty grid yields no records."""
        assert _grid_to_records([]) == []

    def test_header_row_zero_raises(self):
        """Test header_row must be 1-based."""
        with pytest.raises(ValueError, match="header_row must be >= 1"):
            _grid_to_records([["A"]], header_row=0)

    def test_header_row_out_of_range_raises(self):
        """Test header_row beyond the grid raises ValueError."""
        with pytest.raises(ValueError, match="out of range"):
            _grid_to_records([["A"], ["b"]], header_row=5)

    def test_invalid_max_rows_raises(self):
        """Test max_rows below 1 raises ValueError."""
        with pytest.raises(ValueError, match="max_rows must be >= 1"):
            _grid_to_records([["A"], ["b"]], max_rows=0)


class TestExtractTableActivity:
    """Tests for Extract Table registration and error paths."""

    def test_activity_is_registered(self):
        """Test Extract Table is registered under the WebUI library."""
        WebUI()
        meta = ACTIVITY_REGISTRY["WebUI.extract_table"]
        assert meta.name == "Extract Table"
        assert meta.library == "WebUI"
        assert meta.category == "Web"

    def test_activity_param_metadata(self):
        """Test param names, order, and types on the registry entry."""
        WebUI()
        params = {p["name"]: p for p in ACTIVITY_REGISTRY["WebUI.extract_table"].params}
        assert list(params) == ["selector", "header_row", "max_rows", "timeout"]
        assert params["selector"]["type"] == "string"
        assert params["header_row"]["type"] == "integer"
        assert params["header_row"]["default"] == 1
        assert params["max_rows"]["type"] == "integer"
        assert params["max_rows"]["default"] is None
        assert params["timeout"]["type"] == "string"
        assert params["timeout"]["default"] == "30s"

    def test_extract_table_without_page_raises(self):
        """Test calling extract_table without an open page raises."""
        lib = WebUI()
        with pytest.raises(ValueError, match="No browser/page open"):
            lib.extract_table("#customers")


class TestExampleDiagramConversion:
    """Validates the web-scraper-to-excel example through DiagramConverter."""

    def load_diagram(self) -> dict:
        """Load the example process.json diagram."""
        import json

        with open(EXAMPLE_PROCESS, encoding="utf-8") as f:
            return json.load(f)

    def test_example_converts_with_extract_table(self):
        """The example diagram must convert to a runnable activity chain."""
        diagram = self.load_diagram()
        process = DiagramConverter().convert(diagram)

        calls = [
            (a.library, a.activity) for task in process.tasks for a in task.activities
        ]
        assert ("WebUI", "Extract Table") in calls
        extract_index = calls.index(("WebUI", "Extract Table"))
        assert calls[extract_index - 1] == ("WebUI", "Wait For Page Load")
        assert calls[extract_index + 1] == ("DataFrames", "From List")
        assert calls[-1] == ("WebUI", "Close Browser")

    def test_extract_table_node_args_and_output_variable(self):
        """Extract Table node passes selector positionally and stores tableRows."""
        diagram = self.load_diagram()
        process = DiagramConverter().convert(diagram)

        node = next(
            a
            for task in process.tasks
            for a in task.activities
            if a.activity == "Extract Table"
        )
        assert node.args[0] == "#customers"
        assert node.args[1] == 1
        assert node.output_variable == "tableRows"

    def test_from_list_consumes_table_rows_variable(self):
        """From List reads ${tableRows} produced by Extract Table."""
        diagram = self.load_diagram()
        process = DiagramConverter().convert(diagram)

        from_list = next(
            a
            for task in process.tasks
            for a in task.activities
            if a.activity == "From List"
        )
        assert from_list.args[0] == "${tableRows}"
