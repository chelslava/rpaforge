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

    def test_library_attributes(self):
        """Test library attributes."""
        from rpaforge_libraries.DesktopUI import DesktopUI

        assert DesktopUI.ROBOT_LIBRARY_SCOPE == "GLOBAL"
        assert DesktopUI.ROBOT_LIBRARY_VERSION == "0.1.0"

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

    def test_parse_timeout_combined(self):
        """Test parsing combined timeout."""
        from rpaforge_libraries.DesktopUI import DesktopUI

        lib = DesktopUI()
        assert lib._parse_timeout("1m 30s") == 90.0


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
        assert "timeout" in params

    def test_input_text_signature(self):
        """Test input_text keyword signature."""
        import inspect

        from rpaforge_libraries.DesktopUI import DesktopUI

        sig = inspect.signature(DesktopUI.input_text)
        params = list(sig.parameters.keys())

        assert "selector" in params
        assert "text" in params
        assert "clear" in params
        assert "timeout" in params
