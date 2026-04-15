"""Tests for DesktopUI library."""

from __future__ import annotations


class TestDesktopUI:
    """Tests for DesktopUI library."""

    def test_import_library(self):
        """Test importing DesktopUI library."""
        from rpaforge_libraries.DesktopUI import DesktopUI

        lib = DesktopUI()
        assert lib is not None
        assert lib._backend == "uia"
        assert lib._timeout == 10

    def test_library_is_decorated(self):
        """Test library has activity decorator metadata."""
        from rpaforge_libraries.DesktopUI import DesktopUI

        assert hasattr(DesktopUI, "_library_meta")
        assert DesktopUI._library_name == "DesktopUI"

    def test_backend_initialization(self):
        """Test different backend initialization."""
        from rpaforge_libraries.DesktopUI import DesktopUI

        lib_uia = DesktopUI(backend="uia")
        assert lib_uia._backend == "uia"

        lib_win32 = DesktopUI(backend="win32")
        assert lib_win32._backend == "win32"

    def test_parse_selector_id(self):
        """Test parsing ID selector."""
        from rpaforge_libraries.DesktopUI import DesktopUI

        lib = DesktopUI()
        selector_type, value = lib._parse_selector("id:btnOK")
        assert selector_type == "id"
        assert value == "btnOK"

    def test_parse_selector_name(self):
        """Test parsing name selector."""
        from rpaforge_libraries.DesktopUI import DesktopUI

        lib = DesktopUI()
        selector_type, value = lib._parse_selector("name:Submit")
        assert selector_type == "name"
        assert value == "Submit"

    def test_parse_selector_class(self):
        """Test parsing class selector."""
        from rpaforge_libraries.DesktopUI import DesktopUI

        lib = DesktopUI()
        selector_type, value = lib._parse_selector("class:Button")
        assert selector_type == "class"
        assert value == "Button"

    def test_parse_selector_automation(self):
        """Test parsing automation selector."""
        from rpaforge_libraries.DesktopUI import DesktopUI

        lib = DesktopUI()
        selector_type, value = lib._parse_selector("automation:btnSubmit")
        assert selector_type == "automation"
        assert value == "btnSubmit"

    def test_parse_selector_auto(self):
        """Test parsing auto selector."""
        from rpaforge_libraries.DesktopUI import DesktopUI

        lib = DesktopUI()
        selector_type, value = lib._parse_selector("SomeButton")
        assert selector_type == "auto"
        assert value == "SomeButton"

    def test_parse_selector_with_colon_in_value(self):
        """Test parsing selector with colon in value."""
        from rpaforge_libraries.DesktopUI import DesktopUI

        lib = DesktopUI()
        selector_type, value = lib._parse_selector("id:btn:OK")
        assert selector_type == "id"
        assert value == "btn:OK"

    def test_parse_timeout_seconds(self):
        """Test parsing timeout in seconds."""
        from rpaforge_libraries.DesktopUI import DesktopUI

        lib = DesktopUI()
        assert lib._parse_timeout("10s") == 10.0
        assert lib._parse_timeout("30s") == 30.0

    def test_parse_timeout_minutes(self):
        """Test parsing timeout in minutes."""
        from rpaforge_libraries.DesktopUI import DesktopUI

        lib = DesktopUI()
        assert lib._parse_timeout("1m") == 60.0
        assert lib._parse_timeout("2m") == 120.0

    def test_parse_timeout_milliseconds(self):
        """Test parsing timeout in milliseconds."""
        from rpaforge_libraries.DesktopUI import DesktopUI

        lib = DesktopUI()
        assert lib._parse_timeout("500ms") == 0.5
        assert lib._parse_timeout("1000ms") == 1.0

    def test_parse_timeout_hours(self):
        """Test parsing timeout in hours."""
        from rpaforge_libraries.DesktopUI import DesktopUI

        lib = DesktopUI()
        assert lib._parse_timeout("1h") == 3600.0
        assert lib._parse_timeout("2h") == 7200.0

    def test_parse_timeout_numeric(self):
        """Test parsing numeric timeout."""
        from rpaforge_libraries.DesktopUI import DesktopUI

        lib = DesktopUI()
        assert lib._parse_timeout("10") == 10.0
        assert lib._parse_timeout("30.5") == 30.5


class TestDesktopUIMultiInstance:
    """Tests for multi-application and multi-window support."""

    def test_initial_state_empty(self):
        """Test initial state has no applications or windows."""
        from rpaforge_libraries.DesktopUI import DesktopUI

        lib = DesktopUI()
        assert lib._apps == {}
        assert lib._windows == {}
        assert lib._current_app_id is None
        assert lib._current_window_id is None

    def test_list_applications_empty(self):
        """Test list_applications returns empty list initially."""
        from rpaforge_libraries.DesktopUI import DesktopUI

        lib = DesktopUI()
        assert lib.list_applications() == []

    def test_list_windows_empty(self):
        """Test list_windows returns empty list initially."""
        from rpaforge_libraries.DesktopUI import DesktopUI

        lib = DesktopUI()
        assert lib.list_windows() == []

    def test_get_current_application_raises_when_none(self):
        """Test get_current_application raises when no app is active."""
        from rpaforge_libraries.DesktopUI import DesktopUI

        lib = DesktopUI()
        with pytest.raises(ValueError, match="No application is currently active"):
            lib.get_current_application()

    def test_get_current_window_raises_when_none(self):
        """Test get_current_window raises when no window is active."""
        from rpaforge_libraries.DesktopUI import DesktopUI

        lib = DesktopUI()
        with pytest.raises(ValueError, match="No window is currently active"):
            lib.get_current_window()

    def test_switch_application_raises_when_not_found(self):
        """Test switch_application raises when app_id not found."""
        from rpaforge_libraries.DesktopUI import DesktopUI

        lib = DesktopUI()
        with pytest.raises(ValueError, match="Application 'nonexistent' not found"):
            lib.switch_application("nonexistent")

    def test_close_application_raises_when_none(self):
        """Test close_application raises when no app to close."""
        from rpaforge_libraries.DesktopUI import DesktopUI

        lib = DesktopUI()
        with pytest.raises(ValueError, match="No application to close"):
            lib.close_application()

    def test_wait_for_window_raises_without_app(self):
        """Test wait_for_window raises when no app is connected."""
        from rpaforge_libraries.DesktopUI import DesktopUI

        lib = DesktopUI()
        with pytest.raises(ValueError, match="No application connected"):
            lib.wait_for_window("Some Window")


class TestDesktopUIKeywords:
    """Tests for DesktopUI keyword signatures."""

    def test_keywords_exist(self):
        """Test that all expected keywords exist."""
        from rpaforge_libraries.DesktopUI import DesktopUI

        lib = DesktopUI()

        keywords = [
            "open_application",
            "connect_to_application",
            "wait_for_window",
            "switch_window",
            "click_element",
            "double_click_element",
            "input_text",
            "press_keys",
            "get_element_text",
            "get_window_text",
            "wait_until_element_exists",
            "wait_until_element_visible",
            "close_window",
            "close_application",
            "take_screenshot",
            "validate_selector",
            "get_element_attribute",
            "wait_until_element_contains_text",
            "get_element_properties",
            "set_screenshot_on_failure",
            "switch_application",
            "list_applications",
            "list_windows",
            "get_current_application",
            "get_current_window",
        ]

        for keyword in keywords:
            assert hasattr(lib, keyword), f"Missing keyword: {keyword}"

    def test_open_application_signature(self):
        """Test open_application keyword signature."""
        import inspect

        from rpaforge_libraries.DesktopUI import DesktopUI

        sig = inspect.signature(DesktopUI.open_application)
        params = list(sig.parameters.keys())

        assert "executable" in params
        assert "args" in params
        assert "app_id" in params

    def test_input_text_signature(self):
        """Test input_text keyword signature."""
        import inspect

        from rpaforge_libraries.DesktopUI import DesktopUI

        sig = inspect.signature(DesktopUI.input_text)
        params = list(sig.parameters.keys())

        assert "selector" in params
        assert "text" in params
        assert "clear" in params

    def test_wait_for_window_signature(self):
        """Test wait_for_window keyword signature."""
        import inspect

        from rpaforge_libraries.DesktopUI import DesktopUI

        sig = inspect.signature(DesktopUI.wait_for_window)
        params = list(sig.parameters.keys())

        assert "title" in params
        assert "timeout" in params
        assert "exact" in params
        assert "window_id" in params

    def test_switch_application_signature(self):
        """Test switch_application keyword signature."""
        import inspect

        from rpaforge_libraries.DesktopUI import DesktopUI

        sig = inspect.signature(DesktopUI.switch_application)
        params = list(sig.parameters.keys())

        assert "app_id" in params

    def test_switch_window_signature(self):
        """Test switch_window keyword signature."""
        import inspect

        from rpaforge_libraries.DesktopUI import DesktopUI

        sig = inspect.signature(DesktopUI.switch_window)
        params = list(sig.parameters.keys())

        assert "window_id" in params
        assert "title" in params
        assert "index" in params

    def test_close_application_signature(self):
        """Test close_application keyword signature."""
        import inspect

        from rpaforge_libraries.DesktopUI import DesktopUI

        sig = inspect.signature(DesktopUI.close_application)
        params = list(sig.parameters.keys())

        assert "app_id" in params
        assert "all" in params

    def test_close_window_signature(self):
        """Test close_window keyword signature."""
        import inspect

        from rpaforge_libraries.DesktopUI import DesktopUI

        sig = inspect.signature(DesktopUI.close_window)
        params = list(sig.parameters.keys())

        assert "window_id" in params
        assert "title" in params


class TestDesktopUIActivityDecorators:
    """Tests for DesktopUI activity decorators."""

    def test_open_application_has_activity_metadata(self):
        """Test open_application has activity metadata."""
        from rpaforge_libraries.DesktopUI import DesktopUI

        method = DesktopUI.open_application
        assert hasattr(method, "_activity_meta")

    def test_connect_to_application_has_activity_metadata(self):
        """Test connect_to_application has activity metadata."""
        from rpaforge_libraries.DesktopUI import DesktopUI

        method = DesktopUI.connect_to_application
        assert hasattr(method, "_activity_meta")

    def test_input_keywords_exist(self):
        """Test input keywords exist."""
        from rpaforge_libraries.DesktopUI import DesktopUI

        input_keywords = [
            "click_element",
            "double_click_element",
            "input_text",
            "press_keys",
        ]

        for kw_name in input_keywords:
            method = getattr(DesktopUI, kw_name)
            assert callable(method)

    def test_multi_instance_keywords_have_metadata(self):
        """Test multi-instance keywords have activity metadata."""
        from rpaforge_libraries.DesktopUI import DesktopUI

        multi_instance_keywords = [
            "switch_application",
            "switch_window",
            "list_applications",
            "list_windows",
            "get_current_application",
            "get_current_window",
        ]

        for kw_name in multi_instance_keywords:
            method = getattr(DesktopUI, kw_name)
            assert hasattr(method, "_activity_meta"), f"Missing metadata for {kw_name}"


class TestDesktopUIElementAttributes:
    """Tests for element attribute retrieval."""

    def test_attribute_parsing_logic(self):
        """Test attribute name parsing logic."""
        from rpaforge_libraries.DesktopUI import DesktopUI

        lib = DesktopUI()

        text_attrs = ["text", "window_text"]
        class_attrs = ["class", "class_name"]
        id_attrs = ["id", "auto_id", "automation_id"]
        visible_attrs = ["visible", "is_visible"]
        enabled_attrs = ["enabled", "is_enabled"]

        for attr in text_attrs:
            assert attr.lower() in ("text", "window_text")

        for attr in class_attrs:
            assert attr.lower() in ("class", "class_name")

        for attr in id_attrs:
            assert attr.lower() in ("id", "auto_id", "automation_id")

        for attr in visible_attrs:
            assert attr.lower() in ("visible", "is_visible")

        for attr in enabled_attrs:
            assert attr.lower() in ("enabled", "is_enabled")


import pytest
