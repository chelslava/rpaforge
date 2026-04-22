"""
RPAForge WebUI Library.

Web automation using Playwright with multi-browser and multi-window support.
"""

from __future__ import annotations

import contextlib
import logging
from typing import TYPE_CHECKING, Any

from rpaforge.core.activity import activity, library, output, param, tags

if TYPE_CHECKING:
    pass

logger = logging.getLogger("rpaforge.web")

BROWSER_TYPES = ["chromium", "firefox", "webkit"]


@library(name="WebUI", category="Web", icon="🌐")
class WebUI:
    """Web automation library using Playwright with multi-instance support."""

    def __init__(self, browser: str = "chromium", headless: bool = False):
        self._default_browser_type = browser
        self._default_headless = headless
        self._playwright: Any = None
        self._browsers: dict[str, Any] = {}
        self._contexts: dict[str, Any] = {}
        self._pages: dict[str, Any] = {}
        self._current_browser_id: str | None = None
        self._current_page_id: str | None = None
        self._timeout: int = 30000
        self._screenshot_on_failure: bool = False
        self._screenshot_dir: str = "."

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

    @property
    def _page(self) -> Any:
        if self._current_page_id and self._current_page_id in self._pages:
            return self._pages[self._current_page_id]
        return None

    @property
    def _browser(self) -> Any:
        if self._current_browser_id and self._current_browser_id in self._browsers:
            return self._browsers[self._current_browser_id]
        return None

    @property
    def _context(self) -> Any:
        if self._current_page_id and self._current_page_id in self._contexts:
            return self._contexts[self._current_page_id]
        return None

    @activity(name="Open Browser", category="Web")
    @tags("browser", "startup")
    @output("Browser instance ID")
    @param(
        "browser",
        type="string",
        options=BROWSER_TYPES,
        description="Browser type to launch",
    )
    def open_browser(
        self,
        url: str | None = None,
        browser: str = "chromium",
        headless: bool = False,
        browser_id: str | None = None,
    ) -> str:
        self._ensure_playwright()

        browser_type = browser or self._default_browser_type
        is_headless = headless if headless else self._default_headless

        import uuid

        instance_id = browser_id or f"{browser_type}_{uuid.uuid4().hex[:8]}"

        if instance_id in self._browsers:
            raise ValueError(f"Browser instance '{instance_id}' already exists")

        browser_launcher = getattr(self._playwright, browser_type)
        self._browsers[instance_id] = browser_launcher.launch(headless=is_headless)

        context = self._browsers[instance_id].new_context()
        page = context.new_page()
        page.set_default_timeout(self._timeout)

        self._contexts[instance_id] = context
        self._pages[instance_id] = page
        self._current_browser_id = instance_id
        self._current_page_id = instance_id

        if url:
            page.goto(url)

        logger.info(f"Opened {browser_type} browser (id: {instance_id})")
        return instance_id

    @activity(name="New Page", category="Web")
    @tags("browser", "page")
    @output("Page ID")
    def new_page(
        self,
        url: str | None = None,
        page_id: str | None = None,
    ) -> str:
        self._ensure_playwright()

        if not self._current_browser_id:
            raise ValueError("No browser open. Use Open Browser first.")

        import uuid

        instance_id = page_id or f"page_{uuid.uuid4().hex[:8]}"

        if instance_id in self._pages:
            raise ValueError(f"Page instance '{instance_id}' already exists")

        browser = self._browsers[self._current_browser_id]
        context = browser.new_context()
        page = context.new_page()
        page.set_default_timeout(self._timeout)

        self._contexts[instance_id] = context
        self._pages[instance_id] = page
        self._current_page_id = instance_id

        if url:
            page.goto(url)

        logger.info(f"Created new page (id: {instance_id})")
        return instance_id

    @activity(name="Switch Browser", category="Web")
    @tags("browser", "navigation")
    @output("Current browser ID")
    def switch_browser(self, browser_id: str) -> str:
        if browser_id not in self._browsers:
            raise ValueError(f"Browser '{browser_id}' not found")

        self._current_browser_id = browser_id
        if browser_id in self._pages:
            self._current_page_id = browser_id

        logger.info(f"Switched to browser: {browser_id}")
        return browser_id

    @activity(name="Switch Page", category="Web")
    @tags("browser", "page", "navigation")
    @output("Current page ID")
    def switch_page(self, page_id: str) -> str:
        if page_id not in self._pages:
            raise ValueError(f"Page '{page_id}' not found")

        self._current_page_id = page_id
        logger.info(f"Switched to page: {page_id}")
        return page_id

    @activity(name="List Browsers", category="Web")
    @tags("browser", "info")
    @output("List of browser instance IDs")
    def list_browsers(self) -> list[str]:
        return list(self._browsers.keys())

    @activity(name="List Pages", category="Web")
    @tags("browser", "page", "info")
    @output("List of page instance IDs")
    def list_pages(self) -> list[str]:
        return list(self._pages.keys())

    @activity(name="Get Current Browser", category="Web")
    @tags("browser", "info")
    @output("Current browser ID")
    def get_current_browser(self) -> str:
        if not self._current_browser_id:
            raise ValueError("No browser is currently active")
        return self._current_browser_id

    @activity(name="Get Current Page", category="Web")
    @tags("browser", "page", "info")
    @output("Current page ID")
    def get_current_page(self) -> str:
        if not self._current_page_id:
            raise ValueError("No page is currently active")
        return self._current_page_id

    @activity(name="Navigate", category="Web")
    @tags("navigation")
    @param(
        "action",
        type="string",
        options=["url", "back", "forward", "refresh"],
        description="Navigation action",
    )
    def navigate(
        self,
        url: str = "",
        action: str = "url",
    ) -> None:
        self._ensure_page()
        action = action.lower()
        if action == "url":
            self._page.goto(url)
            logger.info(f"Navigated to: {url}")
        elif action == "back":
            self._page.go_back()
            logger.info("Navigated back")
        elif action == "forward":
            self._page.go_forward()
            logger.info("Navigated forward")
        elif action == "refresh":
            self._page.reload()
            logger.info("Page refreshed")

    @activity(name="Click Element", category="Web")
    @tags("input", "mouse")
    @param(
        "click_type",
        type="string",
        options=["single", "double", "right"],
        description="Type of click",
    )
    def click_element(
        self,
        selector: str,
        timeout: str = "30s",
        click_type: str = "single",
    ) -> None:
        self._ensure_page()
        timeout_ms = int(self._parse_timeout(timeout) * 1000)
        click_type = click_type.lower()
        if click_type == "double":
            self._page.dblclick(selector, timeout=timeout_ms)
        elif click_type == "right":
            self._page.click(selector, button="right", timeout=timeout_ms)
        else:
            self._page.click(selector, timeout=timeout_ms)
        logger.info(f"Clicked element ({click_type}): {selector}")

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

    @activity(name="Set Checkbox", category="Web")
    @tags("input", "form")
    def set_checkbox(
        self,
        selector: str,
        checked: bool = True,
        timeout: str = "30s",
    ) -> None:
        self._ensure_page()
        timeout_ms = int(self._parse_timeout(timeout) * 1000)
        if checked:
            self._page.check(selector, timeout=timeout_ms)
            logger.info(f"Checked: {selector}")
        else:
            self._page.uncheck(selector, timeout=timeout_ms)
            logger.info(f"Unchecked: {selector}")

    @activity(name="Get Element Text", category="Web")
    @tags("element", "get")
    @output("Text content of the element")
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
    @output("Attribute value")
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
    @output("Page title")
    def get_page_title(self) -> str:
        self._ensure_page()
        return self._page.title()

    @activity(name="Get URL", category="Web")
    @tags("element", "get")
    @output("Current page URL")
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
    @param(
        "state",
        type="string",
        options=["visible", "hidden", "attached", "detached"],
        description="Element state to wait for",
    )
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
    @output("Filename of the saved screenshot")
    def take_screenshot(
        self,
        filename: str = "screenshot.png",
        full_page: bool = False,
    ) -> str:
        self._ensure_page()
        self._page.screenshot(path=filename, full_page=full_page)
        logger.info(f"Screenshot saved: {filename}")
        return filename

    @activity(name="Set Screenshot On Failure", category="Web")
    @tags("screenshot", "config")
    def set_screenshot_on_failure(
        self,
        enabled: bool = True,
        directory: str = ".",
    ) -> None:
        self._screenshot_on_failure = enabled
        self._screenshot_dir = directory
        logger.info(f"Screenshot on failure: {enabled}, directory: {directory}")

    @activity(name="Validate Selector", category="Web")
    @tags("element", "validation")
    @output("Dictionary with validation results")
    def validate_selector(
        self,
        selector: str,
        timeout: str = "5s",
    ) -> dict[str, Any]:
        self._ensure_page()
        timeout_ms = int(self._parse_timeout(timeout) * 1000)
        try:
            element = self._page.wait_for_selector(
                selector, state="attached", timeout=timeout_ms
            )
            if element:
                return {
                    "valid": True,
                    "found": True,
                    "visible": element.is_visible(),
                    "enabled": element.is_enabled(),
                    "text": element.text_content() or "",
                }
        except Exception:
            pass  # Element not found, return default invalid state
        return {
            "valid": False,
            "found": False,
            "visible": False,
            "enabled": False,
            "text": "",
        }

    @activity(name="Wait Until Element Contains Text", category="Web")
    @tags("element", "wait")
    @output("True when element contains text")
    def wait_until_element_contains_text(
        self,
        selector: str,
        text: str,
        timeout: str = "30s",
        case_sensitive: bool = False,
    ) -> bool:
        self._ensure_page()
        import time

        timeout_secs = self._parse_timeout(timeout)
        start = time.time()
        search_text = text if case_sensitive else text.lower()

        while time.time() - start < timeout_secs:
            try:
                element_text = self._page.text_content(selector, timeout=1000) or ""
                compare_text = element_text if case_sensitive else element_text.lower()
                if search_text in compare_text:
                    logger.info(f"Element contains text: {text}")
                    return True
            except Exception:
                pass  # Element not ready yet, retry
            time.sleep(0.5)

        raise TimeoutError(
            f"Element '{selector}' did not contain text '{text}' within {timeout}"
        )

    @activity(name="Handle Dialog", category="Web")
    @tags("dialog", "alert")
    def handle_dialog(
        self,
        action: str = "accept",
        prompt_text: str = "",
    ) -> None:
        self._ensure_page()
        self._page.on(
            "dialog",
            lambda dialog: (
                dialog.accept(prompt_text) if action == "accept" else dialog.dismiss()
            ),
        )
        logger.info(f"Dialog handler set: {action}")

    @activity(name="Upload File", category="Web")
    @tags("input", "file")
    def upload_file(
        self,
        selector: str,
        file_path: str,
        timeout: str = "30s",
    ) -> None:
        self._ensure_page()
        timeout_ms = int(self._parse_timeout(timeout) * 1000)
        self._page.set_input_files(selector, file_path, timeout=timeout_ms)
        logger.info(f"Uploaded file: {file_path}")

    @activity(name="Download File", category="Web")
    @tags("download", "file")
    @output("Path where file was saved")
    def download_file(
        self,
        selector: str,
        save_path: str,
        timeout: str = "60s",
    ) -> str:
        self._ensure_page()
        timeout_ms = int(self._parse_timeout(timeout) * 1000)
        with self._page.expect_download(timeout=timeout_ms) as download_info:
            self._page.click(selector)
        download = download_info.value
        download.save_as(save_path)
        logger.info(f"Downloaded file: {save_path}")
        return save_path

    @activity(name="Get Element Properties", category="Web")
    @tags("element", "get")
    @output("Dictionary with element properties")
    def get_element_properties(
        self,
        selector: str,
        timeout: str = "10s",
    ) -> dict[str, Any]:
        self._ensure_page()
        timeout_ms = int(self._parse_timeout(timeout) * 1000)
        element = self._page.wait_for_selector(selector, timeout=timeout_ms)
        return {
            "text": element.text_content() or "",
            "inner_text": element.inner_text() or "",
            "tag_name": element.evaluate("el => el.tagName.toLowerCase()"),
            "is_visible": element.is_visible(),
            "is_enabled": element.is_enabled(),
            "is_checked": (
                element.is_checked()
                if element.evaluate(
                    "el => el.type === 'checkbox' || el.type === 'radio'"
                )
                else None
            ),
            "value": (
                element.input_value()
                if element.evaluate(
                    "el => ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)"
                )
                else None
            ),
        }

    def _take_failure_screenshot(self, context: str = "") -> str | None:
        if not self._screenshot_on_failure or not self._page:
            return None
        try:
            import os
            import time

            timestamp = time.strftime("%Y%m%d_%H%M%S")
            safe_context = "".join(
                c if c.isalnum() or c in "_-" else "_" for c in context
            )[:30]
            filename = os.path.join(
                self._screenshot_dir, f"failure_{timestamp}_{safe_context}.png"
            )
            self._page.screenshot(path=filename)
            logger.error(f"Failure screenshot saved: {filename}")
            return filename
        except Exception as e:
            logger.error(f"Failed to take failure screenshot: {e}")
            return None

    @activity(name="Close Page", category="Web")
    @tags("browser", "page", "close")
    def close_page(self, page_id: str | None = None) -> None:
        target_id = page_id or self._current_page_id
        if not target_id:
            raise ValueError("No page to close")

        if target_id in self._pages:
            self._pages[target_id].close()
            del self._pages[target_id]
            if target_id in self._contexts:
                self._contexts[target_id].close()
                del self._contexts[target_id]
            logger.info(f"Closed page: {target_id}")

        if self._current_page_id == target_id:
            self._current_page_id = next(iter(self._pages.keys()), None)

    @activity(name="Close Browser", category="Web")
    @tags("browser", "close")
    @output("List of remaining browser IDs")
    def close_browser(
        self, browser_id: str | None = None, all: bool = False
    ) -> list[str]:
        if all:
            for page_id in list(self._pages.keys()):
                with contextlib.suppress(Exception):
                    self._pages[page_id].close()
            for context_id in list(self._contexts.keys()):
                with contextlib.suppress(Exception):
                    self._contexts[context_id].close()
            for bid in list(self._browsers.keys()):
                with contextlib.suppress(Exception):
                    self._browsers[bid].close()

            self._pages.clear()
            self._contexts.clear()
            self._browsers.clear()
            self._current_browser_id = None
            self._current_page_id = None

            if self._playwright:
                self._playwright.stop()
                self._playwright = None

            logger.info("All browsers closed")
            return []

        target_id = browser_id or self._current_browser_id
        if not target_id:
            raise ValueError("No browser to close")

        if target_id in self._browsers:
            for page_id in list(self._pages.keys()):
                if page_id == target_id or page_id.startswith(f"{target_id}_"):
                    with contextlib.suppress(Exception):
                        self._pages[page_id].close()
                    self._pages.pop(page_id, None)
                    self._contexts.pop(page_id, None)

            self._browsers[target_id].close()
            del self._browsers[target_id]
            logger.info(f"Closed browser: {target_id}")

        if self._current_browser_id == target_id:
            self._current_browser_id = next(iter(self._browsers.keys()), None)
            self._current_page_id = (
                self._current_browser_id
                if self._current_browser_id in self._pages
                else None
            )

        return list(self._browsers.keys())

    def _ensure_page(self) -> None:
        if self._page is None:
            raise ValueError("No browser/page open. Use Open Browser first.")

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
            logger.warning(f"Invalid timeout format '{time_str}', defaulting to 0")
            return 0
