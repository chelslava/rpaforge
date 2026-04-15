"""Tests for Excel library."""

from __future__ import annotations

import pytest

openpyxl_available = True
try:
    import openpyxl  # noqa: F401
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
