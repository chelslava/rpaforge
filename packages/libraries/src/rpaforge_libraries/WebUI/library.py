"""
RPAForge WebUI Library.

Web automation using Playwright.
"""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING, Any

from rpaforge.core.activity import activity, library, tags

if TYPE_CHECKING:
    pass

logger = logging.getLogger("rpaforge.web")


@library(name="WebUI", category="Web", icon="🌐")
class WebUI:
    """Web automation library using Playwright."""

    def __init__(self, browser: str = "chromium", headless: bool = False):
        self._browser_type = browser
        self._headless = headless
        self._playwright: Any = None
        self._browser: Any = None
        self._page: Any = None
        self._context: Any = None
        self._timeout: int = 30000

    def _ensure_playwright(self) -> None:
        if self._playwright is None:
            try:
                from playwright.sync_api import sync_playwright

                self._playwright = sync_playwright().start()
            except ImportError as err:
                raise ImportError(
                    "playwright is required for WebUI library. "
                    "Install it with: pip install rpaforge-libraries[web] && playwright install"
                ) from err

    @activity(name="Open Browser", category="Web")
    @tags("browser", "startup")
    def open_browser(
        self,
        url: str | None = None,
        browser: str | None = None,
        headless: bool | None = None,
    ) -> None:
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

    @activity(name="Go To", category="Web")
    @tags("navigation")
    def go_to(self, url: str) -> None:
        self._ensure_page()
        self._page.goto(url)
        logger.info(f"Navigated to: {url}")

    @activity(name="Go Back", category="Web")
    @tags("navigation")
    def go_back(self) -> None:
        self._ensure_page()
        self._page.go_back()
        logger.info("Navigated back")

    @activity(name="Go Forward", category="Web")
    @tags("navigation")
    def go_forward(self) -> None:
        self._ensure_page()
        self._page.go_forward()
        logger.info("Navigated forward")

    @activity(name="Refresh Page", category="Web")
    @tags("navigation")
    def refresh_page(self) -> None:
        self._ensure_page()
        self._page.reload()
        logger.info("Page refreshed")

    @activity(name="Click Element", category="Web")
    @tags("input", "mouse")
    def click_element(
        self,
        selector: str,
        timeout: str = "30s",
    ) -> None:
        self._ensure_page()
        timeout_ms = int(self._parse_timeout(timeout) * 1000)
        self._page.click(selector, timeout=timeout_ms)
        logger.info(f"Clicked element: {selector}")

    @activity(name="Double Click Element", category="Web")
    @tags("input", "mouse")
    def double_click_element(
        self,
        selector: str,
        timeout: str = "30s",
    ) -> None:
        self._ensure_page()
        timeout_ms = int(self._parse_timeout(timeout) * 1000)
        self._page.dblclick(selector, timeout=timeout_ms)
        logger.info(f"Double-clicked element: {selector}")

    @activity(name="Right Click Element", category="Web")
    @tags("input", "mouse")
    def right_click_element(
        self,
        selector: str,
        timeout: str = "30s",
    ) -> None:
        self._ensure_page()
        timeout_ms = int(self._parse_timeout(timeout) * 1000)
        self._page.click(selector, button="right", timeout=timeout_ms)
        logger.info(f"Right-clicked element: {selector}")

    @activity(name="Input Text", category="Web")
    @tags("input", "keyboard")
    def input_text(
        self,
        selector: str,
        text: str,
        clear: bool = True,
        timeout: str = "30s",
    ) -> None:
        self._ensure_page()
        timeout_ms = int(self._parse_timeout(timeout) * 1000)

        if clear:
            self._page.fill(selector, text, timeout=timeout_ms)
        else:
            self._page.type(selector, text, timeout=timeout_ms)

        logger.info(f"Input text into {selector}")

    @activity(name="Press Keys", category="Web")
    @tags("input", "keyboard")
    def press_keys(self, keys: str) -> None:
        self._ensure_page()
        self._page.keyboard.press(keys)
        logger.info(f"Pressed keys: {keys}")

    @activity(name="Select Option", category="Web")
    @tags("input", "form")
    def select_option(
        self,
        selector: str,
        value: str | list[str],
        timeout: str = "30s",
    ) -> None:
        self._ensure_page()
        timeout_ms = int(self._parse_timeout(timeout) * 1000)
        self._page.select_option(selector, value, timeout=timeout_ms)
        logger.info(f"Selected option: {value}")

    @activity(name="Check Checkbox", category="Web")
    @tags("input", "form")
    def check_checkbox(
        self,
        selector: str,
        timeout: str = "30s",
    ) -> None:
        self._ensure_page()
        timeout_ms = int(self._parse_timeout(timeout) * 1000)
        self._page.check(selector, timeout=timeout_ms)
        logger.info(f"Checked: {selector}")

    @activity(name="Uncheck Checkbox", category="Web")
    @tags("input", "form")
    def uncheck_checkbox(
        self,
        selector: str,
        timeout: str = "30s",
    ) -> None:
        self._ensure_page()
        timeout_ms = int(self._parse_timeout(timeout) * 1000)
        self._page.uncheck(selector, timeout=timeout_ms)
        logger.info(f"Unchecked: {selector}")

    @activity(name="Get Element Text", category="Web")
    @tags("element", "get")
    def get_element_text(
        self,
        selector: str,
        timeout: str = "30s",
    ) -> str:
        self._ensure_page()
        timeout_ms = int(self._parse_timeout(timeout) * 1000)
        text = self._page.text_content(selector, timeout=timeout_ms) or ""
        logger.info(f"Got text: {text[:50]}...")
        return text

    @activity(name="Get Element Attribute", category="Web")
    @tags("element", "get")
    def get_element_attribute(
        self,
        selector: str,
        attribute: str,
        timeout: str = "30s",
    ) -> str:
        self._ensure_page()
        timeout_ms = int(self._parse_timeout(timeout) * 1000)
        value = self._page.get_attribute(selector, attribute, timeout=timeout_ms) or ""
        return value

    @activity(name="Get Page Title", category="Web")
    @tags("element", "get")
    def get_page_title(self) -> str:
        self._ensure_page()
        return self._page.title()

    @activity(name="Get URL", category="Web")
    @tags("element", "get")
    def get_url(self) -> str:
        self._ensure_page()
        return self._page.url

    @activity(name="Wait For Page Load", category="Web")
    @tags("wait")
    def wait_for_page_load(self, timeout: str = "30s") -> None:
        self._ensure_page()
        timeout_ms = int(self._parse_timeout(timeout) * 1000)
        self._page.wait_for_load_state("networkidle", timeout=timeout_ms)
        logger.info("Page loaded")

    @activity(name="Wait For Element", category="Web")
    @tags("wait")
    def wait_for_element(
        self,
        selector: str,
        state: str = "visible",
        timeout: str = "30s",
    ) -> None:
        self._ensure_page()
        timeout_ms = int(self._parse_timeout(timeout) * 1000)
        self._page.wait_for_selector(selector, state=state, timeout=timeout_ms)
        logger.info(f"Element {selector} is {state}")

    @activity(name="Wait For Selector", category="Web")
    @tags("wait")
    def wait_for_selector(
        self,
        selector: str,
        timeout: str = "30s",
    ) -> None:
        self.wait_for_element(selector, state="attached", timeout=timeout)

    @activity(name="Take Screenshot", category="Web")
    @tags("screenshot")
    def take_screenshot(
        self,
        filename: str = "screenshot.png",
        full_page: bool = False,
    ) -> str:
        self._ensure_page()
        self._page.screenshot(path=filename, full_page=full_page)
        logger.info(f"Screenshot saved: {filename}")
        return filename

    @activity(name="Close Browser", category="Web")
    @tags("browser", "close")
    def close_browser(self) -> None:
        if self._browser:
            self._browser.close()
            logger.info("Browser closed")
        self._browser = None
        self._page = None
        self._context = None

    @activity(name="Close All Browsers", category="Web")
    @tags("browser", "close")
    def close_all_browsers(self) -> None:
        self.close_browser()
        if self._playwright:
            self._playwright.stop()
            self._playwright = None

    def _ensure_page(self) -> None:
        if self._page is None:
            raise ValueError("No browser open. Use Open Browser first.")

    def _parse_timeout(self, timeout: str) -> float:
        return _parse_time_string(timeout)


def _parse_time_string(time_str: str) -> float:
    """Parse time string to seconds (e.g., '10s', '1m', '500ms')."""
    time_str = time_str.strip().lower()

    if time_str.endswith("ms"):
        return float(time_str[:-2]) / 1000
    elif time_str.endswith("s"):
        return float(time_str[:-1])
    elif time_str.endswith("m"):
        return float(time_str[:-1]) * 60
    elif time_str.endswith("h"):
        return float(time_str[:-1]) * 3600
    else:
        try:
            return float(time_str)
        except ValueError:
            return float(time_str)
