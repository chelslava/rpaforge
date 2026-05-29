"""Unit tests for DesktopUI Library - testing actual implementation."""

from __future__ import annotations

import sys

import pytest

from rpaforge_libraries.DesktopUI import DesktopUI


class TestDesktopUITimeoutParsing:
    """Tests for timeout parsing."""

    def test_parse_timeout_seconds(self):
        """Test parsing timeout in seconds."""
        desktop = DesktopUI()
        assert desktop._parse_timeout("30s") == 30.0

    def test_parse_timeout_minutes(self):
        """Test parsing timeout in minutes."""
        desktop = DesktopUI()
        assert desktop._parse_timeout("2m") == 120.0

    def test_parse_timeout_milliseconds(self):
        """Test parsing timeout in milliseconds."""
        desktop = DesktopUI()
        assert desktop._parse_timeout("500ms") == 0.5

    def test_parse_timeout_hours(self):
        """Test parsing timeout in hours."""
        desktop = DesktopUI()
        assert desktop._parse_timeout("1h") == 3600.0

    def test_parse_timeout_numeric(self):
        """Test parsing numeric timeout."""
        desktop = DesktopUI()
        assert desktop._parse_timeout("45") == 45.0

    def test_parse_timeout_invalid_defaults_to_zero(self):
        """Test invalid timeout defaults to zero."""
        desktop = DesktopUI()
        assert desktop._parse_timeout("invalid") == 0


class TestDesktopUISelectorParsing:
    """Tests for selector parsing."""

    def test_parse_selector_with_colon(self):
        """Test parsing selector with colon returns tuple."""
        desktop = DesktopUI()
        result = desktop._parse_selector("id:button1")
        assert result == ("id", "button1")

    def test_parse_selector_name(self):
        """Test name selector."""
        desktop = DesktopUI()
        result = desktop._parse_selector("name:Submit")
        assert result == ("name", "Submit")

    def test_parse_selector_class(self):
        """Test class selector."""
        desktop = DesktopUI()
        result = desktop._parse_selector("class:Button")
        assert result == ("class", "Button")

    def test_parse_selector_automation(self):
        """Test automation selector."""
        desktop = DesktopUI()
        result = desktop._parse_selector("automation:btn123")
        assert result == ("automation", "btn123")

    def test_parse_selector_auto(self):
        """Test auto selector."""
        desktop = DesktopUI()
        result = desktop._parse_selector("auto:12345")
        assert result == ("auto", "12345")

    def test_parse_selector_with_multiple_colons(self):
        """Test selector with multiple colons."""
        desktop = DesktopUI()
        result = desktop._parse_selector("name:Hello:World")
        assert result == ("name", "Hello:World")

    def test_parse_selector_without_colon(self):
        """Test selector without colon defaults to auto."""
        desktop = DesktopUI()
        result = desktop._parse_selector("button1")
        assert result == ("auto", "button1")

    def test_parse_selector_empty(self):
        """Test empty selector."""
        desktop = DesktopUI()
        result = desktop._parse_selector("")
        assert result == ("auto", "")


class TestDesktopUIInitialization:
    """Tests for DesktopUI initialization."""

    def test_default_backend_is_uia(self):
        """Test default backend is uia."""
        desktop = DesktopUI()
        assert desktop._backend == "uia"

    def test_explicit_backend(self):
        """Test explicit backend."""
        desktop = DesktopUI(backend="win32")
        assert desktop._backend == "win32"

    def test_initial_state(self):
        """Test initial state values."""
        desktop = DesktopUI()
        assert len(desktop._apps) == 0
        assert len(desktop._windows) == 0
        assert desktop._current_app_id is None
        assert desktop._current_window_id is None


class TestDesktopUIActivityDecorators:
    """Tests for activity metadata."""

    def test_library_has_metadata(self):
        """Test library has metadata."""
        from rpaforge_libraries.DesktopUI import DesktopUI

        assert hasattr(DesktopUI, "_library_meta")

    def test_library_name(self):
        """Test library name."""
        from rpaforge_libraries.DesktopUI import DesktopUI

        assert DesktopUI._library_name == "DesktopUI"

    def test_connect_has_metadata(self):
        """Test connect_to_application has metadata."""
        desktop = DesktopUI()
        assert hasattr(desktop.connect_to_application, "_activity_meta")

    def test_keywords_exist(self):
        """Test that expected keywords exist."""
        desktop = DesktopUI()
        assert hasattr(desktop, "connect_to_application")
        assert hasattr(desktop, "switch_application")
        assert hasattr(desktop, "list_applications")
        assert hasattr(desktop, "wait_for_window")
        assert hasattr(desktop, "switch_window")
        assert hasattr(desktop, "close_application")
        assert hasattr(desktop, "take_screenshot")
        assert hasattr(desktop, "click_element")
        assert hasattr(desktop, "input_text")


class TestDesktopUIImportError:
    """Tests for import error handling."""

    @pytest.mark.skipif(sys.platform != "win32", reason="Windows-only test")
    def test_connect_raises_import_error(self):
        """Test that connect raises helpful error message when pywinauto not installed."""
        desktop = DesktopUI()

        with pytest.raises(ImportError, match="pywinauto is required"):
            desktop.connect_to_application(process_id=1234)
