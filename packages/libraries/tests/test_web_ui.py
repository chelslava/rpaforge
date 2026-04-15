"""Tests for WebUI library."""

from __future__ import annotations

import pytest


class TestWebUI:
    """Tests for WebUI library."""

    def test_import_library(self):
        """Test importing WebUI library."""
        from rpaforge_libraries.WebUI import WebUI

        lib = WebUI()
        assert lib is not None
        assert lib._default_browser_type == "chromium"
        assert lib._default_headless is False
        assert lib._timeout == 30000

    def test_library_is_decorated(self):
        """Test library has activity decorator metadata."""
        from rpaforge_libraries.WebUI import WebUI

        assert hasattr(WebUI, "_library_meta")
        assert WebUI._library_name == "WebUI"

    def test_browser_initialization(self):
        """Test different browser initialization."""
        from rpaforge_libraries.WebUI import WebUI

        lib_chromium = WebUI(browser="chromium")
        assert lib_chromium._default_browser_type == "chromium"

        lib_firefox = WebUI(browser="firefox")
        assert lib_firefox._default_browser_type == "firefox"

        lib_webkit = WebUI(browser="webkit")
        assert lib_webkit._default_browser_type == "webkit"

    def test_headless_initialization(self):
        """Test headless mode initialization."""
        from rpaforge_libraries.WebUI import WebUI

        lib_headless = WebUI(headless=True)
        assert lib_headless._default_headless is True

        lib_not_headless = WebUI(headless=False)
        assert lib_not_headless._default_headless is False

    def test_parse_timeout_seconds(self):
        """Test parsing timeout in seconds."""
        from rpaforge_libraries.WebUI import WebUI

        lib = WebUI()
        assert lib._parse_timeout("10s") == 10.0
        assert lib._parse_timeout("30s") == 30.0

    def test_parse_timeout_minutes(self):
        """Test parsing timeout in minutes."""
        from rpaforge_libraries.WebUI import WebUI

        lib = WebUI()
        assert lib._parse_timeout("1m") == 60.0
        assert lib._parse_timeout("2m") == 120.0

    def test_parse_timeout_milliseconds(self):
        """Test parsing timeout in milliseconds."""
        from rpaforge_libraries.WebUI import WebUI

        lib = WebUI()
        assert lib._parse_timeout("500ms") == 0.5
        assert lib._parse_timeout("1000ms") == 1.0

    def test_ensure_page_raises_without_browser(self):
        """Test that _ensure_page raises without browser."""
        from rpaforge_libraries.WebUI import WebUI

        lib = WebUI()
        with pytest.raises(ValueError, match="No browser/page open"):
            lib._ensure_page()


class TestWebUIKeywords:
    """Tests for WebUI keyword signatures."""

    def test_keywords_exist(self):
        """Test that all expected keywords exist."""
        from rpaforge_libraries.WebUI import WebUI

        lib = WebUI()

        keywords = [
            "open_browser",
            "navigate",
            "click_element",
            "input_text",
            "press_keys",
            "select_option",
            "set_checkbox",
            "get_element_text",
            "get_element_attribute",
            "get_page_title",
            "get_url",
            "wait_for_page_load",
            "wait_for_element",
            "wait_for_selector",
            "take_screenshot",
            "close_browser",
            "validate_selector",
            "wait_until_element_contains_text",
            "handle_dialog",
            "upload_file",
            "download_file",
            "get_element_properties",
            "set_screenshot_on_failure",
        ]

        for keyword in keywords:
            assert hasattr(lib, keyword), f"Missing keyword: {keyword}"

    def test_open_browser_signature(self):
        """Test open_browser keyword signature."""
        import inspect

        from rpaforge_libraries.WebUI import WebUI

        sig = inspect.signature(WebUI.open_browser)
        params = list(sig.parameters.keys())

        assert "url" in params
        assert "browser" in params
        assert "headless" in params

    def test_input_text_signature(self):
        """Test input_text keyword signature."""
        import inspect

        from rpaforge_libraries.WebUI import WebUI

        sig = inspect.signature(WebUI.input_text)
        params = list(sig.parameters.keys())

        assert "selector" in params
        assert "text" in params
        assert "clear" in params
        assert "timeout" in params

    def test_wait_for_element_signature(self):
        """Test wait_for_element keyword signature."""
        import inspect

        from rpaforge_libraries.WebUI import WebUI

        sig = inspect.signature(WebUI.wait_for_element)
        params = list(sig.parameters.keys())

        assert "selector" in params
        assert "state" in params
        assert "timeout" in params

    def test_take_screenshot_signature(self):
        """Test take_screenshot keyword signature."""
        import inspect

        from rpaforge_libraries.WebUI import WebUI

        sig = inspect.signature(WebUI.take_screenshot)
        params = list(sig.parameters.keys())

        assert "filename" in params
        assert "full_page" in params


class TestWebUIActivityDecorators:
    """Tests for WebUI activity decorators."""

    def test_open_browser_has_activity_metadata(self):
        """Test open_browser has activity metadata."""
        from rpaforge_libraries.WebUI import WebUI

        method = WebUI.open_browser
        assert hasattr(method, "_activity_meta")

    def test_navigation_keywords_exist(self):
        """Test navigation keywords exist."""
        from rpaforge_libraries.WebUI import WebUI

        navigation_keywords = ["navigate"]

        for kw_name in navigation_keywords:
            method = getattr(WebUI, kw_name)
            assert callable(method)

    def test_input_keywords_exist(self):
        """Test input keywords exist."""
        from rpaforge_libraries.WebUI import WebUI

        input_keywords = [
            "click_element",
            "input_text",
            "press_keys",
            "select_option",
            "set_checkbox",
        ]

        for kw_name in input_keywords:
            method = getattr(WebUI, kw_name)
            assert callable(method)
