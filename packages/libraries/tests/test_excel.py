"""Tests for Excel library."""

from __future__ import annotations

import pytest

openpyxl_available = True
try:
    import openpyxl

    del openpyxl  # Only checking availability, not using
except ImportError:
    openpyxl_available = False


class TestExcel:
    """Tests for Excel library."""

    def test_import_library(self):
        from rpaforge_libraries.Excel import Excel

        lib = Excel()
        assert lib is not None

    def test_library_is_decorated(self):
        from rpaforge_libraries.Excel import Excel

        assert hasattr(Excel, "_library_meta")
        assert Excel._library_name == "Excel"

    @pytest.mark.skipif(not openpyxl_available, reason="openpyxl not installed")
    def test_create_workbook(self):
        from rpaforge_libraries.Excel import Excel

        lib = Excel()
        result = lib.create_workbook()
        assert result == "new_workbook"
        lib.close_workbook()

    @pytest.mark.skipif(not openpyxl_available, reason="openpyxl not installed")
    def test_get_sheet_names(self):
        from rpaforge_libraries.Excel import Excel

        lib = Excel()
        lib.create_workbook()
        names = lib.get_sheet_names()
        assert isinstance(names, list)
        assert len(names) >= 1
        lib.close_workbook()

    @pytest.mark.skipif(not openpyxl_available, reason="openpyxl not installed")
    def test_open_workbook(self, tmp_path):
        """Test opening an existing workbook."""
        import openpyxl

        from rpaforge_libraries.Excel import Excel

        # Create a real workbook file
        wb_path = tmp_path / "test.xlsx"
        wb = openpyxl.Workbook()
        wb.save(str(wb_path))
        wb.close()

        lib = Excel()
        result = lib.open_workbook(str(wb_path))
        assert result == str(wb_path)
        lib.close_workbook()

    @pytest.mark.skipif(not openpyxl_available, reason="openpyxl not installed")
    def test_write_range_multi_letter_column(self):
        """write_range must honor multi-letter (base-26) columns like AA1, AB1."""

        from rpaforge_libraries.Excel import Excel

        lib = Excel()
        lib.create_workbook()

        # Write a 2x2 block starting at AA1 across and down.
        lib.write_range("AA1", [["AA_first", "AB_second"], ["BA_third", "BB_fourth"]])
        assert lib._workbook.active["AA1"].value == "AA_first"
        assert lib._workbook.active["AB1"].value == "AB_second"
        assert lib._workbook.active["AA2"].value == "BA_third"
        assert lib._workbook.active["AB2"].value == "BB_fourth"

        # A two-letter column assigned by the openpyxl cell API confirms index.
        assert lib._workbook.active["AB1"].column == 28  # base-26: AB = 28
        lib.close_workbook()

    @pytest.mark.skipif(not openpyxl_available, reason="openpyxl not installed")
    def test_write_range_multi_digit_row(self):
        """write_range must parse row numbers with multiple digits (e.g. B12)."""

        from rpaforge_libraries.Excel import Excel

        lib = Excel()
        lib.create_workbook()
        lib.write_range("B12", [["target"]])
        assert lib._workbook.active["B12"].value == "target"
        assert lib._workbook.active["B13"].value is None  # nothing above/below
        lib.close_workbook()


class TestExcelKeywords:
    """Tests for Excel keyword signatures."""

    def test_keywords_exist(self):
        from rpaforge_libraries.Excel import Excel

        lib = Excel()

        keywords = [
            "open_workbook",
            "create_workbook",
            "close_workbook",
            "save_workbook",
            "get_sheet_names",
            "get_active_sheet",
            "set_active_sheet",
            "create_sheet",
            "delete_sheet",
            "read_cell",
            "write_cell",
            "read_range",
            "write_range",
            "find_row",
            "get_row_count",
            "get_column_count",
        ]

        for keyword in keywords:
            assert hasattr(lib, keyword), f"Missing keyword: {keyword}"

    def test_open_workbook_signature(self):
        import inspect

        from rpaforge_libraries.Excel import Excel

        sig = inspect.signature(Excel.open_workbook)
        params = list(sig.parameters.keys())

        assert "path" in params

    def test_read_cell_signature(self):
        import inspect

        from rpaforge_libraries.Excel import Excel

        sig = inspect.signature(Excel.read_cell)
        params = list(sig.parameters.keys())

        assert "cell" in params
        assert "sheet" in params

    def test_write_cell_signature(self):
        import inspect

        from rpaforge_libraries.Excel import Excel

        sig = inspect.signature(Excel.write_cell)
        params = list(sig.parameters.keys())

        assert "cell" in params
        assert "value" in params
        assert "sheet" in params
