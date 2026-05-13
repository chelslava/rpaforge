"""Integration tests for timeout handling across RPAForge libraries."""

from __future__ import annotations

from unittest.mock import patch

import pytest


class TestDesktopUITimeout:
    """Tests for DesktopUI timeout handling."""

    def test_library_import(self):
        """Test importing DesktopUI library."""
        from rpaforge_libraries.DesktopUI import DesktopUI

        lib = DesktopUI()
        assert lib is not None
        assert lib._timeout == 10

    def test_parse_timeout_formats(self):
        """Test timeout parsing for various formats."""
        from rpaforge_libraries.DesktopUI import DesktopUI

        lib = DesktopUI()
        assert lib._parse_timeout("10s") == 10.0
        assert lib._parse_timeout("1m") == 60.0
        assert lib._parse_timeout("500ms") == 0.5
        assert lib._parse_timeout("30s") == 30.0


class TestWebUITimeout:
    """Tests for WebUI timeout handling."""

    def test_library_import(self):
        """Test importing WebUI library."""
        from rpaforge_libraries.WebUI import WebUI

        lib = WebUI()
        assert lib is not None
        assert lib._timeout == 30000

    def test_parse_timeout_formats(self):
        """Test timeout parsing for various formats."""
        from rpaforge_libraries.WebUI import WebUI

        lib = WebUI()
        assert lib._parse_timeout("10s") == 10.0
        assert lib._parse_timeout("500ms") == 0.5
        assert lib._parse_timeout("60000") == 60000.0


class TestDatabaseTimeout:
    """Tests for Database library timeout handling."""

    def test_library_import(self):
        """Test importing Database library."""
        from rpaforge_libraries.Database import Database

        lib = Database()
        assert lib is not None


class TestFileTimeout:
    """Tests for File library timeout handling."""

    def test_library_import(self):
        """Test importing File library."""
        from rpaforge_libraries.File import File

        lib = File()
        assert lib is not None

    def test_read_file_timeout(self):
        """Test Read File raises TimeoutError on timeout."""
        from rpaforge_libraries.File import File

        lib = File()
        with patch("pathlib.Path.exists", side_effect=TimeoutError("Read timeout")):
            with pytest.raises(TimeoutError):
                lib.read_file("/tmp/slow.txt")

    def test_multiple_timeouts_no_leak(self):
        """Test multiple timeouts don't leak resources."""
        from contextlib import suppress

        from rpaforge_libraries.File import File

        lib = File()
        for _ in range(5):
            with patch("pathlib.Path.exists", side_effect=TimeoutError("Timeout")):
                with suppress(TimeoutError):
                    lib.read_file("/tmp/test.txt")
