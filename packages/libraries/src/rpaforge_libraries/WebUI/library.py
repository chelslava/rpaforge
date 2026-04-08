"""
RPAForge WebUI Library.

Web automation using Playwright.
"""

from __future__ import annotations

from typing import Any, TYPE_CHECKING

from robot.api import logger
from robot.api.deco import keyword, library

if TYPE_CHECKING:
    pass


@library(scope="GLOBAL", auto_keywords=True)
class WebUI:
    """Web automation library using Playwright.

    This library provides keywords for automating web browsers
    with Playwright as the backend.

    == Supported Browsers ==

    - Chromium (default)
    - Firefox
    - WebKit

    == Example ==

    | *** Settings ***   |                           |                    |
    | Library            | RPAForge.WebUI            |                    |
    |                    |                           |                    |
    | *** Tasks ***      |                           |                    |
    | Web Login          |                           |                    |
    |                    | Open Browser              | https://example.com |
    |                    | Input Text                | id:username        |  user  |
    |                    | Input Text                | id:password        |  pass  |
    |                    | Click Button              | id:login           |        |
    |                    | Wait For Page Load        |                    |        |
    |                    | Close Browser             |                    |        |
    """

    ROBOT_LIBRARY_SCOPE = "GLOBAL"
    ROBOT_LIBRARY_VERSION = "0.1.0"

    def __init__(self, browser: str = "chromium", headless: bool = False):
        """Initialize the WebUI library.

        :param browser: Browser to use ('chromium', 'firefox', 'webkit').
        :param headless: Run browser in headless mode.
        """
        self._browser_type = browser
        self._headless = headless
        self._playwright: Any = None
        self._browser: Any = None
        self._page: Any = None
        self._context: Any = None
        self._timeout: int = 30000  # ms

    def _ensure_playwright(self) -> None:
        """Ensure Playwright is initialized."""
        if self._playwright is None:
            try:
                from playwright.sync_api import sync_playwright

                self._playwright = sync_playwright().start()
            except ImportError as err:
                raise ImportError(
                    "playwright is required for WebUI library. "
                    "Install it with: pip install rpaforge-libraries[web] && playwright install"
                ) from err

    @keyword(tags=["browser", "startup"])
    def open_browser(
        self,
        url: str | None = None,
        browser: str | None = None,
        headless: bool | None = None,
    ) -> None:
        """Open a browser.

        :param url: URL to navigate to (optional).
        :param browser: Browser type (overrides init setting).
        :param headless: Headless mode (overrides init setting).

        Example:
            | Open Browser    https://example.com
            | Open Browser    browser=firefox    headless=True
        """
        self._ensure_playwright()

        browser_type = browser or self._browser_type
        is_headless = headless if headless is not None else self._headless

        browser_launcher = getattr(self._playwright, browser_type)
        self._browser = browser_launcher.launch(headless=is_headless)
        self._context = self._browser.new_context()
        self._page = self._context.new_page()
        self._page.set_default_timeout(self._timeout)

        if url:
            self._page.goto(url)

        logger.info(f"Opened {browser_type} browser")

    @keyword(tags=["navigation"])
    def go_to(self, url: str) -> None:
        """Navigate to a URL.

        :param url: URL to navigate to.

        Example:
            | Go To    https://example.com/page
        """
        self._ensure_page()
        self._page.goto(url)
        logger.info(f"Navigated to: {url}")

    @keyword(tags=["navigation"])
    def go_back(self) -> None:
        """Navigate back in browser history."""
        self._ensure_page()
        self._page.go_back()
        logger.info("Navigated back")

    @keyword(tags=["navigation"])
    def go_forward(self) -> None:
        """Navigate forward in browser history."""
        self._ensure_page()
        self._page.go_forward()
        logger.info("Navigated forward")

    @keyword(tags=["navigation"])
    def refresh_page(self) -> None:
        """Refresh the current page."""
        self._ensure_page()
        self._page.reload()
        logger.info("Page refreshed")

    @keyword(tags=["input", "mouse"])
    def click_element(
        self,
        selector: str,
        timeout: str = "30s",
    ) -> None:
        """Click on an element.

        :param selector: CSS selector or XPath.
        :param timeout: Timeout for element to appear.

        Example:
            | Click Element    button.submit
            | Click Element    xpath=//button[@type='submit']
        """
        self._ensure_page()
        timeout_ms = int(self._parse_timeout(timeout) * 1000)
        self._page.click(selector, timeout=timeout_ms)
        logger.info(f"Clicked element: {selector}")

    @keyword(tags=["input", "mouse"])
    def double_click_element(
        self,
        selector: str,
        timeout: str = "30s",
    ) -> None:
        """Double-click on an element.

        :param selector: CSS selector or XPath.
        :param timeout: Timeout for element to appear.
        """
        self._ensure_page()
        timeout_ms = int(self._parse_timeout(timeout) * 1000)
        self._page.dblclick(selector, timeout=timeout_ms)
        logger.info(f"Double-clicked element: {selector}")

    @keyword(tags=["input", "mouse"])
    def right_click_element(
        self,
        selector: str,
        timeout: str = "30s",
    ) -> None:
        """Right-click on an element.

        :param selector: CSS selector or XPath.
        :param timeout: Timeout for element to appear.
        """
        self._ensure_page()
        timeout_ms = int(self._parse_timeout(timeout) * 1000)
        self._page.click(selector, button="right", timeout=timeout_ms)
        logger.info(f"Right-clicked element: {selector}")

    @keyword(tags=["input", "keyboard"])
    def input_text(
        self,
        selector: str,
        text: str,
        clear: bool = True,
        timeout: str = "30s",
    ) -> None:
        """Input text into an element.

        :param selector: CSS selector or XPath.
        :param text: Text to input.
        :param clear: Whether to clear existing text first.
        :param timeout: Timeout for element to appear.

        Example:
            | Input Text    id:username    john.doe
            | Input Text    input[name='email']    test@example.com    clear=False
        """
        self._ensure_page()
        timeout_ms = int(self._parse_timeout(timeout) * 1000)

        if clear:
            self._page.fill(selector, text, timeout=timeout_ms)
        else:
            self._page.type(selector, text, timeout=timeout_ms)

        logger.info(f"Input text into {selector}")

    @keyword(tags=["input", "keyboard"])
    def press_keys(self, keys: str) -> None:
        """Press keyboard keys.

        :param keys: Keys to press (e.g., 'Enter', 'Control+a', 'ArrowDown').

        Example:
            | Press Keys    Enter
            | Press Keys    Control+a
        """
        self._ensure_page()
        self._page.keyboard.press(keys)
        logger.info(f"Pressed keys: {keys}")

    @keyword(tags=["input", "form"])
    def select_option(
        self,
        selector: str,
        value: str | list[str],
        timeout: str = "30s",
    ) -> None:
        """Select option(s) in a select element.

        :param selector: CSS selector for the select element.
        :param value: Value(s) to select.
        :param timeout: Timeout for element to appear.

        Example:
            | Select Option    select#country    US
            | Select Option    select#colors    ['red', 'blue']
        """
        self._ensure_page()
        timeout_ms = int(self._parse_timeout(timeout) * 1000)
        self._page.select_option(selector, value, timeout=timeout_ms)
        logger.info(f"Selected option: {value}")

    @keyword(tags=["input", "form"])
    def check_checkbox(
        self,
        selector: str,
        timeout: str = "30s",
    ) -> None:
        """Check a checkbox.

        :param selector: CSS selector for the checkbox.
        :param timeout: Timeout for element to appear.
        """
        self._ensure_page()
        timeout_ms = int(self._parse_timeout(timeout) * 1000)
        self._page.check(selector, timeout=timeout_ms)
        logger.info(f"Checked: {selector}")

    @keyword(tags=["input", "form"])
    def uncheck_checkbox(
        self,
        selector: str,
        timeout: str = "30s",
    ) -> None:
        """Uncheck a checkbox.

        :param selector: CSS selector for the checkbox.
        :param timeout: Timeout for element to appear.
        """
        self._ensure_page()
        timeout_ms = int(self._parse_timeout(timeout) * 1000)
        self._page.uncheck(selector, timeout=timeout_ms)
        logger.info(f"Unchecked: {selector}")

    @keyword(tags=["element", "get"])
    def get_element_text(
        self,
        selector: str,
        timeout: str = "30s",
    ) -> str:
        """Get text from an element.

        :param selector: CSS selector or XPath.
        :param timeout: Timeout for element to appear.
        :returns: Text content of the element.

        Example:
            | ${text}=    Get Element Text    h1.title
            | Log    ${text}
        """
        self._ensure_page()
        timeout_ms = int(self._parse_timeout(timeout) * 1000)
        text = self._page.text_content(selector, timeout=timeout_ms) or ""
        logger.info(f"Got text: {text[:50]}...")
        return text

    @keyword(tags=["element", "get"])
    def get_element_attribute(
        self,
        selector: str,
        attribute: str,
        timeout: str = "30s",
    ) -> str:
        """Get an attribute from an element.

        :param selector: CSS selector or XPath.
        :param attribute: Attribute name.
        :param timeout: Timeout for element to appear.
        :returns: Attribute value.
        """
        self._ensure_page()
        timeout_ms = int(self._parse_timeout(timeout) * 1000)
        value = self._page.get_attribute(selector, attribute, timeout=timeout_ms) or ""
        return value

    @keyword(tags=["element", "get"])
    def get_page_title(self) -> str:
        """Get the page title.

        :returns: Page title.
        """
        self._ensure_page()
        return self._page.title()

    @keyword(tags=["element", "get"])
    def get_url(self) -> str:
        """Get the current URL.

        :returns: Current URL.
        """
        self._ensure_page()
        return self._page.url

    @keyword(tags=["wait"])
    def wait_for_page_load(self, timeout: str = "30s") -> None:
        """Wait for page to load.

        :param timeout: Maximum time to wait.
        """
        self._ensure_page()
        timeout_ms = int(self._parse_timeout(timeout) * 1000)
        self._page.wait_for_load_state("networkidle", timeout=timeout_ms)
        logger.info("Page loaded")

    @keyword(tags=["wait"])
    def wait_for_element(
        self,
        selector: str,
        state: str = "visible",
        timeout: str = "30s",
    ) -> None:
        """Wait for an element to be in a certain state.

        :param selector: CSS selector or XPath.
        :param state: State to wait for ('visible', 'hidden', 'attached', 'detached').
        :param timeout: Maximum time to wait.

        Example:
            | Wait For Element    id:loading    state=hidden
            | Wait For Element    div.result    state=visible
        """
        self._ensure_page()
        timeout_ms = int(self._parse_timeout(timeout) * 1000)
        self._page.wait_for_selector(selector, state=state, timeout=timeout_ms)
        logger.info(f"Element {selector} is {state}")

    @keyword(tags=["wait"])
    def wait_for_selector(
        self,
        selector: str,
        timeout: str = "30s",
    ) -> None:
        """Wait for a selector to appear.

        :param selector: CSS selector or XPath.
        :param timeout: Maximum time to wait.
        """
        self.wait_for_element(selector, state="attached", timeout=timeout)

    @keyword(tags=["screenshot"])
    def take_screenshot(
        self,
        filename: str = "screenshot.png",
        full_page: bool = False,
    ) -> str:
        """Take a screenshot.

        :param filename: Output filename.
        :param full_page: Whether to capture the full page.
        :returns: Path to the screenshot file.
        """
        self._ensure_page()
        self._page.screenshot(path=filename, full_page=full_page)
        logger.info(f"Screenshot saved: {filename}")
        return filename

    @keyword(tags=["browser", "close"])
    def close_browser(self) -> None:
        """Close the browser."""
        if self._browser:
            self._browser.close()
            logger.info("Browser closed")
        self._browser = None
        self._page = None
        self._context = None

    @keyword(tags=["browser", "close"])
    def close_all_browsers(self) -> None:
        """Close all browsers and stop Playwright."""
        self.close_browser()
        if self._playwright:
            self._playwright.stop()
            self._playwright = None

    def _ensure_page(self) -> None:
        """Ensure a page is available."""
        if self._page is None:
            raise ValueError("No browser open. Use Open Browser keyword first.")

    def _parse_timeout(self, timeout: str) -> float:
        """Parse timeout string to seconds.

        :param timeout: Timeout string (e.g., '10s', '1m', '500ms').
        :returns: Timeout in seconds.
        """
        from robot.utils import timestr_to_secs

        return timestr_to_secs(timeout)
