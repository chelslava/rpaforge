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

    def test_parse_timeout_hours(self):
        """Test parsing timeout in hours."""
        from rpaforge_libraries.WebUI import WebUI

        lib = WebUI()
        assert lib._parse_timeout("1h") == 3600.0
        assert lib._parse_timeout("2h") == 7200.0

    def test_parse_timeout_numeric(self):
        """Test parsing numeric timeout."""
        from rpaforge_libraries.WebUI import WebUI

        lib = WebUI()
        assert lib._parse_timeout("10") == 10.0
        assert lib._parse_timeout("30.5") == 30.5

    def test_ensure_page_raises_without_browser(self):
        """Test that _ensure_page raises without browser."""
        from rpaforge_libraries.WebUI import WebUI

        lib = WebUI()
        with pytest.raises(ValueError, match="No browser/page open"):
            lib._ensure_page()


class TestWebUIMultiInstance:
    """Tests for multi-browser and multi-page support."""

    def test_initial_state_empty(self):
        """Test initial state has no browsers or pages."""
        from rpaforge_libraries.WebUI import WebUI

        lib = WebUI()
        assert lib._browsers == {}
        assert lib._pages == {}
        assert lib._contexts == {}
        assert lib._current_browser_id is None
        assert lib._current_page_id is None

    def test_list_browsers_empty(self):
        """Test list_browsers returns empty list initially."""
        from rpaforge_libraries.WebUI import WebUI

        lib = WebUI()
        assert lib.list_browsers() == []

    def test_list_pages_empty(self):
        """Test list_pages returns empty list initially."""
        from rpaforge_libraries.WebUI import WebUI

        lib = WebUI()
        assert lib.list_pages() == []

    def test_get_current_browser_raises_when_none(self):
        """Test get_current_browser raises when no browser is active."""
        from rpaforge_libraries.WebUI import WebUI

        lib = WebUI()
        with pytest.raises(ValueError, match="No browser is currently active"):
            lib.get_current_browser()

    def test_get_current_page_raises_when_none(self):
        """Test get_current_page raises when no page is active."""
        from rpaforge_libraries.WebUI import WebUI

        lib = WebUI()
        with pytest.raises(ValueError, match="No page is currently active"):
            lib.get_current_page()

    def test_switch_browser_raises_when_not_found(self):
        """Test switch_browser raises when browser_id not found."""
        from rpaforge_libraries.WebUI import WebUI

        lib = WebUI()
        with pytest.raises(ValueError, match="Browser 'nonexistent' not found"):
            lib.switch_browser("nonexistent")

    def test_switch_page_raises_when_not_found(self):
        """Test switch_page raises when page_id not found."""
        from rpaforge_libraries.WebUI import WebUI

        lib = WebUI()
        with pytest.raises(ValueError, match="Page 'nonexistent' not found"):
            lib.switch_page("nonexistent")

    def test_close_browser_raises_when_none(self):
        """Test close_browser raises when no browser to close."""
        from rpaforge_libraries.WebUI import WebUI

        lib = WebUI()
        with pytest.raises(ValueError, match="No browser to close"):
            lib.close_browser()

    def test_close_page_raises_when_none(self):
        """Test close_page raises when no page to close."""
        from rpaforge_libraries.WebUI import WebUI

        lib = WebUI()
        with pytest.raises(ValueError, match="No page to close"):
            lib.close_page()


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
            "close_page",
            "validate_selector",
            "wait_until_element_contains_text",
            "handle_dialog",
            "upload_file",
            "download_file",
            "get_element_properties",
            "set_screenshot_on_failure",
            "switch_browser",
            "switch_page",
            "list_browsers",
            "list_pages",
            "get_current_browser",
            "get_current_page",
            "new_page",
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
        assert "browser_id" in params

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

    def test_switch_browser_signature(self):
        """Test switch_browser keyword signature."""
        import inspect

        from rpaforge_libraries.WebUI import WebUI

        sig = inspect.signature(WebUI.switch_browser)
        params = list(sig.parameters.keys())

        assert "browser_id" in params

    def test_switch_page_signature(self):
        """Test switch_page keyword signature."""
        import inspect

        from rpaforge_libraries.WebUI import WebUI

        sig = inspect.signature(WebUI.switch_page)
        params = list(sig.parameters.keys())

        assert "page_id" in params

    def test_close_browser_signature(self):
        """Test close_browser keyword signature."""
        import inspect

        from rpaforge_libraries.WebUI import WebUI

        sig = inspect.signature(WebUI.close_browser)
        params = list(sig.parameters.keys())

        assert "browser_id" in params
        assert "all" in params


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

    def test_multi_instance_keywords_have_metadata(self):
        """Test multi-instance keywords have activity metadata."""
        from rpaforge_libraries.WebUI import WebUI

        multi_instance_keywords = [
            "switch_browser",
            "switch_page",
            "list_browsers",
            "list_pages",
            "get_current_browser",
            "get_current_page",
            "new_page",
            "close_page",
        ]

        for kw_name in multi_instance_keywords:
            method = getattr(WebUI, kw_name)
            assert hasattr(method, "_activity_meta"), f"Missing metadata for {kw_name}"


class TestWebUIBrowserTypes:
    """Tests for browser type constants."""

    def test_browser_types_defined(self):
        """Test BROWSER_TYPES constant is defined."""
        from rpaforge_libraries.WebUI.library import BROWSER_TYPES

        assert "chromium" in BROWSER_TYPES
        assert "firefox" in BROWSER_TYPES
        assert "webkit" in BROWSER_TYPES

    def test_browser_types_count(self):
        """Test BROWSER_TYPES has expected count."""
        from rpaforge_libraries.WebUI.library import BROWSER_TYPES

        assert len(BROWSER_TYPES) == 3


class TestWebUIClickTypes:
    """Tests for click type options."""

    def test_click_element_has_options(self):
        """Test click_element has click_type options parameter."""
        from rpaforge.core.activity import ACTIVITY_REGISTRY
        from rpaforge_libraries.WebUI import WebUI

        WebUI()
        meta = ACTIVITY_REGISTRY.get("click_element")
        if meta:
            params = {p["name"]: p for p in meta.params}
            if "click_type" in params:
                assert "single" in params["click_type"]["options"]
                assert "double" in params["click_type"]["options"]
                assert "right" in params["click_type"]["options"]


class TestWebUINavigateOptions:
    """Tests for navigate action options."""

    def test_navigate_has_options(self):
        """Test navigate has action options parameter."""
        from rpaforge.core.activity import ACTIVITY_REGISTRY
        from rpaforge_libraries.WebUI import WebUI

        WebUI()
        meta = ACTIVITY_REGISTRY.get("navigate")
        if meta:
            params = {p["name"]: p for p in meta.params}
            if "action" in params:
                assert "url" in params["action"]["options"]
                assert "back" in params["action"]["options"]
                assert "forward" in params["action"]["options"]
                assert "refresh" in params["action"]["options"]
