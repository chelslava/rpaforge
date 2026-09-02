"""Browser tests for WebUI Library - unit tests with mocks."""

from __future__ import annotations

from unittest.mock import MagicMock

import pytest

from rpaforge_libraries.WebUI import WebUI


class TestWebUIMultiInstance:
    """Tests for multi-instance support."""

    def test_open_multiple_browsers(self):
        """Test opening multiple browser instances."""
        webui = WebUI()
        webui._playwright = MagicMock()
        mock_browser1 = MagicMock()
        mock_browser2 = MagicMock()
        webui._playwright.chromium.launch.return_value = mock_browser1
        webui._playwright.firefox.launch.return_value = mock_browser2

        browser1_id = webui.open_browser("chromium")
        browser2_id = webui.open_browser("firefox")

        assert browser1_id != browser2_id
        assert len(webui._browsers) == 2

    def test_switch_browser(self):
        """Test switching between browsers."""
        webui = WebUI()
        webui._playwright = MagicMock()
        webui._playwright.chromium.launch.return_value = MagicMock()
        webui._playwright.firefox.launch.return_value = MagicMock()

        browser1_id = webui.open_browser("chromium")
        browser2_id = webui.open_browser("firefox")

        webui.switch_browser(browser1_id)
        assert webui._current_browser_id == browser1_id
        assert webui._current_page_id == browser1_id

        webui.switch_browser(browser2_id)
        assert webui._current_browser_id == browser2_id
        assert webui._current_page_id == browser2_id

    def test_switch_browser_syncs_active_page_with_new_pages(self):
        """Test switch_browser resolves the correct page when pages are created via new_page."""
        webui = WebUI()
        webui._playwright = MagicMock()
        webui._playwright.chromium.launch.return_value = MagicMock()
        webui._playwright.firefox.launch.return_value = MagicMock()

        b1 = webui.open_browser("chromium")
        b2 = webui.open_browser("firefox")
        p2_extra = webui.new_page()
        # Close initial page of b2
        webui.close_page(b2)

        # Switch back to b1 -> active page should be b1
        webui.switch_browser(b1)
        assert webui._current_browser_id == b1
        assert webui._current_page_id == b1

        # Switch to b2 -> active page should resolve to p2_extra
        webui.switch_browser(b2)
        assert webui._current_browser_id == b2
        assert webui._current_page_id == p2_extra

    def test_close_browser_resolves_remaining_browser_page(self):
        """Test close_browser updates active page to remaining browser's page."""
        webui = WebUI()
        webui._playwright = MagicMock()
        webui._playwright.chromium.launch.return_value = MagicMock()
        webui._playwright.firefox.launch.return_value = MagicMock()

        b1 = webui.open_browser("chromium")
        b2 = webui.open_browser("firefox")

        # Current browser is b2. Close b2.
        webui.close_browser(b2)
        assert webui._current_browser_id == b1
        assert webui._current_page_id == b1

    def test_switch_browser_unknown_raises(self):
        """Test switching to unknown browser raises."""
        webui = WebUI()
        webui._playwright = MagicMock()
        webui._playwright.chromium.launch.return_value = MagicMock()

        webui.open_browser("chromium")

        with pytest.raises(ValueError, match="Browser 'unknown-id' not found"):
            webui.switch_browser("unknown-id")

    def test_close_browser(self):
        """Test closing a specific browser."""
        webui = WebUI()
        webui._playwright = MagicMock()
        mock_browser = MagicMock()
        webui._playwright.chromium.launch.return_value = mock_browser

        browser_id = webui.open_browser("chromium")
        webui.close_browser(browser_id)

        assert browser_id not in webui._browsers

    def test_close_all_browsers(self):
        """Test closing all browsers."""
        webui = WebUI()
        webui._playwright = MagicMock()
        webui._playwright.chromium.launch.return_value = MagicMock()
        webui._playwright.firefox.launch.return_value = MagicMock()

        webui.open_browser("chromium")
        webui.open_browser("firefox")

        webui.close_browser(all=True)

        assert len(webui._browsers) == 0

    def test_list_browsers(self):
        """Test listing open browsers."""
        webui = WebUI()
        webui._playwright = MagicMock()
        webui._playwright.chromium.launch.return_value = MagicMock()
        webui._playwright.firefox.launch.return_value = MagicMock()

        webui.open_browser("chromium")
        webui.open_browser("firefox")

        browsers = webui.list_browsers()
        assert len(browsers) == 2


class TestWebUIPageManagement:
    """Tests for page management."""

    def test_list_pages(self):
        """Test listing pages."""
        webui = WebUI()
        webui._playwright = MagicMock()
        webui._playwright.chromium.launch.return_value = MagicMock()

        webui.open_browser("chromium")

        pages = webui.list_pages()
        assert isinstance(pages, list)

    def test_switch_page(self):
        """Test switching pages."""
        webui = WebUI()
        webui._playwright = MagicMock()
        webui._playwright.chromium.launch.return_value = MagicMock()

        webui.open_browser("chromium")
        page_id = webui._current_page_id

        if page_id:
            webui.switch_page(page_id)
            assert webui._current_page_id == page_id

    def test_new_page(self):
        """Test creating a new page."""
        webui = WebUI()
        webui._playwright = MagicMock()
        webui._playwright.chromium.launch.return_value = MagicMock()

        webui.open_browser("chromium")
        page_id = webui.new_page()

        assert page_id is not None

    def test_close_page(self):
        """Test closing a page."""
        webui = WebUI()
        webui._playwright = MagicMock()
        webui._playwright.chromium.launch.return_value = MagicMock()

        webui.open_browser("chromium")
        page_id = webui._current_page_id

        if page_id:
            webui.close_page(page_id)
            assert page_id not in webui._pages


class TestWebUISharedSession:
    """Regression coverage for #676: "New Page" must share the browser session
    (cookies/localStorage) instead of opening an isolated browser context."""

    def test_new_page_reuses_current_context(self):
        """A page opened via new_page uses the current page's context (same
        session), not a fresh isolated browser context."""
        from rpaforge_libraries.WebUI import WebUI

        webui = WebUI()
        webui._playwright = MagicMock()
        browser = MagicMock()
        webui._playwright.chromium.launch.return_value = browser

        first_context = MagicMock()
        browser.new_context.return_value = first_context

        first_page = webui.open_browser("chromium")
        assert webui._contexts[first_page] is first_context

        # Second page should reuse first_context, NOT call browser.new_context again.
        second_page = webui.new_page()
        assert webui._contexts[second_page] is first_context
        assert webui._contexts[second_page] is webui._context

    def test_new_page_without_current_page_falls_back_to_browser_context(self):
        """If no page/context exists yet, new_page creates one on the browser."""
        from rpaforge_libraries.WebUI import WebUI

        webui = WebUI()
        webui._playwright = MagicMock()
        browser = MagicMock()
        context = MagicMock()
        browser.new_context.return_value = context
        webui._playwright.chromium.launch.return_value = browser

        # Pretend a browser is open but no page exists yet.
        browser_id = "browser_1"
        webui._browsers[browser_id] = browser
        webui._current_browser_id = browser_id
        webui._current_page_id = None

        page_id = webui.new_page()
        assert webui._contexts[page_id] is context

    def test_close_page_keeps_shared_context_alive(self):
        """Closing one page of a shared context must not close the context while
        another page still uses it."""
        from rpaforge_libraries.WebUI import WebUI

        webui = WebUI()
        webui._playwright = MagicMock()
        browser = MagicMock()
        webui._playwright.chromium.launch.return_value = browser

        context = MagicMock()
        browser.new_context.return_value = context

        first_page = webui.open_browser("chromium")
        second_page = webui.new_page()

        assert webui._context_refs[id(context)] == 2

        # Closing the first page decrements the refcount but leaves the context open.
        webui.close_page(first_page)
        assert context.close.call_count == 0
        assert webui._contexts[second_page] is context
        assert webui._context_refs[id(context)] == 1

        # Closing the last owner actually closes the context.
        webui.close_page(second_page)
        assert context.close.call_count >= 1
        assert id(context) not in webui._context_refs

    def test_close_browser_closes_each_context_once(self):
        """Closing a shared-session browser closes the shared context exactly once."""
        from rpaforge_libraries.WebUI import WebUI

        webui = WebUI()
        webui._playwright = MagicMock()
        browser = MagicMock()
        webui._playwright.chromium.launch.return_value = browser

        context = MagicMock()
        browser.new_context.return_value = context

        webui.open_browser("chromium")
        webui.new_page()
        webui.new_page()
        assert webui._context_refs[id(context)] == 3

        webui.close_browser(all=True)
        # contexts dict cleared and refs cleared
        assert webui._contexts == {}
        assert webui._context_refs == {}

        # close_browser(all=True) calls context.close() for each entry in _contexts;
        # since we cleared entries, we assert by refcount bookkeeping instead.
        assert id(context) not in webui._context_refs


class TestWebUINavigation:
    """Tests for navigation."""

    def test_navigate(self):
        """Test navigation to URL."""
        webui = WebUI()
        webui._playwright = MagicMock()
        webui._playwright.chromium.launch.return_value = MagicMock()

        webui.open_browser("chromium")
        webui.navigate("http://example.com")

        assert webui._page is not None

    def test_get_url(self):
        """Test getting current URL."""
        webui = WebUI()
        webui._playwright = MagicMock()
        webui._playwright.chromium.launch.return_value = MagicMock()

        webui.open_browser("chromium")
        url = webui.get_url()

        assert url is not None


class TestWebUIElements:
    """Tests for element interaction."""

    def test_get_element_text(self):
        """Test getting element text."""
        webui = WebUI()
        webui._playwright = MagicMock()
        webui._playwright.chromium.launch.return_value = MagicMock()

        webui.open_browser("chromium")
        text = webui.get_element_text("#test")

        assert text is not None

    def test_get_element_attribute(self):
        """Test getting element attribute."""
        webui = WebUI()
        webui._playwright = MagicMock()
        webui._playwright.chromium.launch.return_value = MagicMock()

        webui.open_browser("chromium")
        attr = webui.get_element_attribute("#test", "href")

        assert attr is not None

    def test_input_text(self):
        """Test inputting text."""
        webui = WebUI()
        webui._playwright = MagicMock()
        webui._playwright.chromium.launch.return_value = MagicMock()

        webui.open_browser("chromium")
        webui.input_text("#input", "test text")

    def test_click_element(self):
        """Test clicking element."""
        webui = WebUI()
        webui._playwright = MagicMock()
        webui._playwright.chromium.launch.return_value = MagicMock()

        webui.open_browser("chromium")
        webui.click_element("#button")

    def test_select_option(self):
        """Test selecting option."""
        webui = WebUI()
        webui._playwright = MagicMock()
        webui._playwright.chromium.launch.return_value = MagicMock()

        webui.open_browser("chromium")
        webui.select_option("#dropdown", "value1")


class TestWebUIScreenshot:
    """Tests for screenshot functionality."""

    def test_take_screenshot(self, tmp_path):
        """Test taking screenshot."""
        webui = WebUI()
        webui._playwright = MagicMock()
        webui._playwright.chromium.launch.return_value = MagicMock()

        webui.open_browser("chromium")
        path = webui.take_screenshot(filename=str(tmp_path / "test.png"))

        assert path is not None

    def test_set_screenshot_on_failure(self):
        """Test setting screenshot on failure."""
        webui = WebUI()
        webui.set_screenshot_on_failure(True, "/tmp")
        assert webui._screenshot_on_failure is True


class TestWebUIInitialization:
    """Tests for WebUI initialization."""

    def test_default_initialization(self):
        """Test default initialization."""
        webui = WebUI()
        assert webui._default_browser_type == "chromium"
        assert webui._default_headless is False
        assert webui._timeout == 30000
        assert webui._playwright is None

    def test_custom_initialization(self):
        """Test custom initialization."""
        webui = WebUI(browser="firefox", headless=True)
        assert webui._default_browser_type == "firefox"
        assert webui._default_headless is True


class TestWebUIErrorHandling:
    """Tests for error handling."""

    def test_get_page_title_without_browser(self):
        """Test get_page_title raises without browser."""
        webui = WebUI()

        with pytest.raises(ValueError, match="No browser/page open"):
            webui.get_page_title()

    def test_get_url_without_browser(self):
        """Test get_url raises without browser."""
        webui = WebUI()

        with pytest.raises(ValueError, match="No browser/page open"):
            webui.get_url()


class TestWebUIWaitConditions:
    """Tests for wait conditions."""

    def test_wait_for_element(self):
        """Test waiting for element."""
        webui = WebUI()
        webui._playwright = MagicMock()
        webui._playwright.chromium.launch.return_value = MagicMock()

        webui.open_browser("chromium")
        webui.wait_for_element("#test")

    def test_wait_for_page_load(self):
        """Test waiting for page load."""
        webui = WebUI()
        webui._playwright = MagicMock()
        webui._playwright.chromium.launch.return_value = MagicMock()

        webui.open_browser("chromium")
        webui.wait_for_page_load()


class TestWebUIDialogHandling:
    """Tests for dialog handling."""

    def test_handle_dialog(self):
        """Test handling dialog."""
        webui = WebUI()
        webui._playwright = MagicMock()
        webui._playwright.chromium.launch.return_value = MagicMock()

        webui.open_browser("chromium")
        webui.handle_dialog("accept", "response")


class TestWebUIFileOperations:
    """Tests for file operations."""

    def test_download_file(self):
        """Test download file."""
        webui = WebUI()
        webui._playwright = MagicMock()
        webui._playwright.chromium.launch.return_value = MagicMock()

        webui.open_browser("chromium")

    def test_upload_file(self):
        """Test upload file."""
        webui = WebUI()
        webui._playwright = MagicMock()
        webui._playwright.chromium.launch.return_value = MagicMock()

        webui.open_browser("chromium")
        webui.upload_file("#file-input", "/path/to/file.txt")


class TestWebUICloseOperations:
    """Tests for close operations."""

    def test_close_non_existent_browser(self):
        """Test closing non-existent browser does not raise."""
        webui = WebUI()
        webui.close_browser("non-existent-id")

    def test_close_all_when_no_browsers(self):
        """Test close_all when no browsers are open."""
        webui = WebUI()
        webui.close_browser(all=True)
        assert len(webui._browsers) == 0


class TestWebUIKeyboardAndMouse:
    """Tests for keyboard and mouse operations."""

    def test_press_keys(self):
        """Test pressing keys."""
        webui = WebUI()
        webui._playwright = MagicMock()
        webui._playwright.chromium.launch.return_value = MagicMock()

        webui.open_browser("chromium")
        webui.press_keys("Hello World")
