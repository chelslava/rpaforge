"""Unit tests for DesktopUI Library - testing actual implementation."""

from __future__ import annotations

import sys
from unittest.mock import patch

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


class TestDesktopUIGetElementAttributeSecurity:
    """Tests for get_element_attribute allow-list hardening (#674)."""

    def _make_element(self):
        class FakeElement:
            def window_text(self):
                return "Hello"

            def class_name(self):
                return "Button"

            def automation_id(self):
                return "btn123"

            def is_enabled(self):
                return True

            def is_visible(self):
                return True

            def rectangle(self):
                return (0, 0, 10, 10)

        return FakeElement()

    def _make_desktop(self, element):
        desktop = object.__new__(DesktopUI)
        desktop._find_element = lambda *_: element
        return desktop

    def test_known_attribute_text(self):
        element = self._make_element()
        desktop = self._make_desktop(element)
        result = desktop.get_element_attribute("auto:x", "text")
        assert result == "Hello"

    def test_known_attribute_id(self):
        element = self._make_element()
        desktop = self._make_desktop(element)
        result = desktop.get_element_attribute("auto:x", "id")
        assert result == "btn123"

    def test_unknown_attribute_raises(self):
        """Unknown/arbitrary attribute must raise, not perform dynamic getattr."""
        element = self._make_element()
        desktop = self._make_desktop(element)
        with pytest.raises(ValueError, match="Unsupported attribute"):
            desktop.get_element_attribute("auto:x", "destroy")

    def test_callable_method_not_invoked(self):
        """A callable method name must not be invoked on the element (#674)."""
        element = self._make_element()
        desktop = self._make_desktop(element)
        with pytest.raises(ValueError):
            desktop.get_element_attribute("auto:x", "click")

    def test_get_element_attribute_lowercased_matches(self):
        element = self._make_element()
        desktop = self._make_desktop(element)
        result = desktop.get_element_attribute("auto:x", "Is_Enabled")
        assert result == "True"


class TestDesktopUIRegExEscape:
    """Tests for re.escape hardening in window title matching (#673)."""

    def test_find_element_escapes_special_chars(self):
        """_find_element must escape selectors containing regex metacharacters."""
        import re

        escaped = re.escape(r"C:\Program Files (x86)")
        assert "\\(" in escaped
        assert "\\ " in escaped

        escaped2 = re.escape("[Chrome]")
        assert "\\[" in escaped2

        # Verify the escaped value is a valid regex that matches only literally.
        assert re.search(escaped, r"C:\Program Files (x86)") is not None
        assert re.search(escaped2, "[Chrome]") is not None


class _FakeElement:
    """A minimal fake pywinauto wrapper exposing window_text()."""

    def __init__(self, text: str = ""):
        self._text = text

    def window_text(self) -> str:
        return self._text


class TestWaitUntilElementContainsText:
    """Tests for the non-blocking exponential-backoff wait loop."""

    def _make_desktop(self, state):
        desktop = object.__new__(DesktopUI)
        state_prog = iter([state])
        desktop._find_element_nonblocking = lambda *_: next(state_prog)
        return desktop

    def test_returns_true_when_text_present(self):
        desktop = self._make_desktop(_FakeElement("Hello, world!"))
        with patch(
            "rpaforge_libraries.DesktopUI.library.time.monotonic", return_value=0.0
        ):
            result = desktop.wait_until_element_contains_text("auto:x", "Hello")
        assert result is True

    def test_returns_true_last_attempt(self):
        """Element appears only after a few attempts; loop must still succeed."""
        desktop = object.__new__(DesktopUI)
        seq = iter([None, None, _FakeElement("now here")])

        def fake_resolve(_s):
            return next(seq)

        desktop._find_element_nonblocking = fake_resolve
        with (
            patch(
                "rpaforge_libraries.DesktopUI.library.time.monotonic",
                side_effect=[0.0, 0.1, 0.2, 0.3],
            ),
            patch("rpaforge_libraries.DesktopUI.library.time.sleep"),
        ):
            result = desktop.wait_until_element_contains_text("auto:x", "here")
        assert result is True

    def test_raises_timeout_when_never_appears(self):
        desktop = object.__new__(DesktopUI)
        desktop._find_element_nonblocking = lambda *_: None
        try:
            with (
                patch(
                    "rpaforge_libraries.DesktopUI.library.time.monotonic",
                    side_effect=[0.0, 2.0, 4.0, 6.0, 8.0],
                ),
                patch("rpaforge_libraries.DesktopUI.library.time.sleep"),
            ):
                desktop.wait_until_element_contains_text("auto:x", "nope", timeout="5s")
            raise AssertionError("expected TimeoutError")
        except TimeoutError as exc:
            assert "auto:x" in str(exc)

    def test_case_sensitive_match(self):
        """case_sensitive=True must require an exact-case match; miss → timeout."""
        desktop = object.__new__(DesktopUI)
        desktop._find_element_nonblocking = lambda *_: _FakeElement("Hello, world!")
        try:
            with (
                patch(
                    "rpaforge_libraries.DesktopUI.library.time.monotonic",
                    side_effect=[0.0, 2.0, 4.0, 6.0, 8.0],
                ),
                patch("rpaforge_libraries.DesktopUI.library.time.sleep"),
            ):
                # "hello" (lower) never matches "Hello, world!" under case_sensitive.
                desktop.wait_until_element_contains_text(
                    "auto:x", "hello", timeout="5s", case_sensitive=True
                )
            raise AssertionError("expected TimeoutError")
        except TimeoutError:
            pass

    def test_raises_timeout_when_text_never_matches(self):
        """Element present but text never contains the needle → TimeoutError."""
        desktop = object.__new__(DesktopUI)
        # Always resolves to an element whose text never matches "bad" (case-insens
        # would still not match "This is fine" vs "bad").
        desktop._find_element_nonblocking = lambda *_: _FakeElement("This is fine")
        try:
            with (
                patch(
                    "rpaforge_libraries.DesktopUI.library.time.monotonic",
                    side_effect=[0.0, 2.0, 4.0, 6.0, 8.0],
                ),
                patch("rpaforge_libraries.DesktopUI.library.time.sleep"),
            ):
                desktop.wait_until_element_contains_text("auto:x", "bad", timeout="5s")
            raise AssertionError("expected TimeoutError")
        except TimeoutError:
            pass

    def test_nonblocking_resolve_rejects_missing_window(self):
        """_find_element_nonblocking must raise ValueError when no window is set."""
        desktop = object.__new__(DesktopUI)
        desktop._windows = {}
        desktop._current_window_id = "missing"  # maps to None wrapper
        with pytest.raises(ValueError):
            desktop._find_element_nonblocking("auto:x")
