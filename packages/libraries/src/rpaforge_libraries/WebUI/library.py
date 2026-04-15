"""
RPAForge WebUI Library.

Web automation using Playwright.
"""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING, Any

from rpaforge.core.activity import activity, library, output, param, tags

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
            pass
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
                pass
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
            "is_checked": element.is_checked()
            if element.evaluate("el => el.type === 'checkbox' || el.type === 'radio'")
            else None,
            "value": element.input_value()
            if element.evaluate(
                "el => ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)"
            )
            else None,
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

    @activity(name="Close Browser", category="Web")
    @tags("browser", "close")
    def close_browser(self, all: bool = False) -> None:
        if all:
            if self._browser:
                self._browser.close()
            if self._playwright:
                self._playwright.stop()
                self._playwright = None
            self._browser = None
            self._page = None
            self._context = None
            logger.info("All browsers closed")
        else:
            if self._browser:
                self._browser.close()
                logger.info("Browser closed")
            self._browser = None
            self._page = None
            self._context = None

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
