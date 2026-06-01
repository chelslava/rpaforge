"""
RPAForge WebUI Library.

Web automation using Playwright with multi-browser and multi-window support.
"""

from __future__ import annotations

import contextlib
import logging
from typing import TYPE_CHECKING, Any

from rpaforge.core.activity import activity, library, output, param, tags
from rpaforge_libraries.i18n import _ as _t

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
        self._page_browser: dict[str, str] = {}
        self._current_browser_id: str | None = None
        self._current_page_id: str | None = None
        self._timeout: int = 30000
        self._screenshot_on_failure: bool = False
        self._screenshot_dir: str = "."

    def _ensure_playwright(self) -> None:
        if self._playwright is not None:
            return
        try:
            from playwright.sync_api import sync_playwright
        except ImportError as err:
            raise ImportError(
                "playwright is required for WebUI library. "
                "Install it with: pip install rpaforge-libraries[web] && playwright install"
            ) from err

        import asyncio
        import concurrent.futures

        try:
            asyncio.get_running_loop()
            running_in_loop = True
        except RuntimeError:
            running_in_loop = False

        if running_in_loop:
            # sync_playwright creates its own event loop internally; calling it
            # from within an already-running asyncio loop causes a conflict on
            # some platforms.  Run it in a dedicated thread to get a clean loop.
            with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
                self._playwright = pool.submit(
                    lambda: sync_playwright().start()
                ).result()
        else:
            self._playwright = sync_playwright().start()

    def __del__(self) -> None:
        with contextlib.suppress(Exception):
            self.close_browser(all=True)

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
            raise ValueError(
                _t("library.browser_instance_already_exists", instance_id=instance_id)
            )

        browser_launcher = getattr(self._playwright, browser_type)
        self._browsers[instance_id] = browser_launcher.launch(headless=is_headless)

        context = self._browsers[instance_id].new_context()
        page = context.new_page()
        page.set_default_timeout(self._timeout)

        self._contexts[instance_id] = context
        self._pages[instance_id] = page
        self._page_browser[instance_id] = instance_id
        self._current_browser_id = instance_id
        self._current_page_id = instance_id

        if url:
            page.goto(url)

        logger.info(
            _t(
                "library.opened_browser_id",
                browser_type=browser_type,
                instance_id=instance_id,
            )
        )
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
            raise ValueError(_t("library.no_browser_open_use_open_browser_first"))

        import uuid

        instance_id = page_id or f"page_{uuid.uuid4().hex[:8]}"

        if instance_id in self._pages:
            raise ValueError(
                _t("library.page_instance_already_exists", instance_id=instance_id)
            )

        browser = self._browsers[self._current_browser_id]
        context = browser.new_context()
        page = context.new_page()
        page.set_default_timeout(self._timeout)

        self._contexts[instance_id] = context
        self._pages[instance_id] = page
        self._page_browser[instance_id] = self._current_browser_id
        self._current_page_id = instance_id

        if url:
            page.goto(url)

        logger.info(_t("library.created_new_page_id", instance_id=instance_id))
        return instance_id

    @activity(name="Switch Browser", category="Web")
    @tags("browser", "navigation")
    @output("Current browser ID")
    def switch_browser(self, browser_id: str) -> str:
        if browser_id not in self._browsers:
            raise ValueError(
                _t("library.browser_instance_not_found", browser_id=browser_id)
            )

        self._current_browser_id = browser_id
        if browser_id in self._pages:
            self._current_page_id = browser_id

        logger.info(_t("library.switched_to_browser", browser_id=browser_id))
        return browser_id

    @activity(name="Switch Page", category="Web")
    @tags("browser", "page", "navigation")
    @output("Current page ID")
    def switch_page(self, page_id: str) -> str:
        if page_id not in self._pages:
            raise ValueError(_t("library.page_instance_not_found", page_id=page_id))

        self._current_page_id = page_id
        logger.info(_t("library.switched_to_page", page_id=page_id))
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
            raise ValueError(_t("library.no_browser_is_currently_active"))
        return self._current_browser_id

    @activity(name="Get Current Page", category="Web")
    @tags("browser", "page", "info")
    @output("Current page ID")
    def get_current_page(self) -> str:
        if not self._current_page_id:
            raise ValueError(_t("library.no_page_is_currently_active"))
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
            logger.info(_t("library.navigated_to", url=url))
        elif action == "back":
            self._page.go_back()
            logger.info(_t("library.navigated_back"))
        elif action == "forward":
            self._page.go_forward()
            logger.info(_t("library.navigated_forward"))
        elif action == "refresh":
            self._page.reload()
            logger.info(_t("library.page_refreshed"))

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
        logger.info(_t("library.page_loaded"))

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
        import re

        from playwright.sync_api import expect

        timeout_ms = int(self._parse_timeout(timeout) * 1000)

        if case_sensitive:
            pattern = re.compile(re.escape(text))
        else:
            pattern = re.compile(re.escape(text), re.IGNORECASE)

        try:
            expect(self._page.locator(selector)).to_contain_text(
                pattern, timeout=timeout_ms
            )
            logger.info(f"Element contains text: {text}")
            return True
        except Exception as exc:
            raise TimeoutError(
                f"Element '{selector}' did not contain text '{text}' within {timeout}"
            ) from exc

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

    @activity(name="Inspect Page", category="Web")
    def inspect_page(self, _include_frames: bool = True) -> dict[str, Any]:
        self._ensure_page()
        elements = self._page.evaluate(
            """() => {
            function getXPath(el) {
                if (el.id) return '//' + el.tagName.toLowerCase() + '[@id=\'' + el.id + '\']';
                const parts = [];
                let current = el;
                while (current && current.nodeType === 1) {
                    let idx = 1;
                    let sibling = current.previousSibling;
                    while (sibling) {
                        if (sibling.nodeType === 1 && sibling.tagName === current.tagName) idx++;
                        sibling = sibling.previousSibling;
                    }
                    const tag = current.tagName.toLowerCase();
                    parts.unshift(idx > 1 ? tag + '[' + idx + ']' : tag);
                    current = current.parentElement;
                }
                return '/' + parts.join('/');
            }

            function getCSSPath(el) {
                if (el.id) return el.tagName.toLowerCase() + '#' + CSS.escape(el.id);
                const classes = Array.from(el.classList).slice(0, 3);
                if (classes.length > 0) return el.tagName.toLowerCase() + '.' + classes.map(c => CSS.escape(c)).join('.');
                return el.tagName.toLowerCase();
            }

            function getReliableSelector(el, xpath, cssPath) {
                if (el.id) return {type: 'id', value: '#' + CSS.escape(el.id), reliability: 1.0};
                const role = el.getAttribute('role');
                const text = (el.textContent || '').trim().slice(0, 50);
                if (role && text) return {type: 'role+text', value: '[role="' + role + '"]', reliability: 0.85};
                if (el.classList.length > 0) return {type: 'css', value: cssPath, reliability: 0.6};
                return {type: 'xpath', value: xpath, reliability: 0.4};
            }

            const selectors = 'input, button, a, select, textarea, [role]';
            const nodes = Array.from(document.querySelectorAll(selectors));
            return nodes.map(el => {
                const rect = el.getBoundingClientRect();
                const xpath = getXPath(el);
                const cssPath = getCSSPath(el);
                return {
                    tag: el.tagName.toLowerCase(),
                    id: el.id || null,
                    classes: Array.from(el.classList),
                    text: (el.textContent || '').trim().slice(0, 100),
                    xpath: xpath,
                    cssPath: cssPath,
                    reliableSelector: getReliableSelector(el, xpath, cssPath),
                    rect: {x: rect.x, y: rect.y, width: rect.width, height: rect.height}
                };
            });
        }"""
        )
        return {"elements": elements, "total": len(elements), "url": self._page.url}

    @activity(name="Highlight Element", category="Web")
    def highlight_element(
        self, selector: str, color: str = "yellow", duration: int = 3000
    ) -> None:
        self._ensure_page()
        self._page.evaluate(
            """([selector, color, duration]) => {
            const el = document.querySelector(selector) ||
                (selector.startsWith('/') || selector.startsWith('(')
                    ? document.evaluate(selector, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue
                    : null);
            if (!el) return;
            const rect = el.getBoundingClientRect();
            const overlay = document.createElement('div');
            overlay.style.cssText = [
                'position:fixed',
                'pointer-events:none',
                'z-index:2147483647',
                'left:' + (rect.left + window.scrollX) + 'px',
                'top:' + (rect.top + window.scrollY) + 'px',
                'width:' + rect.width + 'px',
                'height:' + rect.height + 'px',
                'background:' + color,
                'opacity:0.5',
                'border:2px solid darkorange',
                'box-sizing:border-box'
            ].join(';');
            const badge = document.createElement('span');
            badge.textContent = el.tagName.toLowerCase();
            badge.style.cssText = 'position:absolute;top:0;left:0;background:darkorange;color:#fff;font-size:10px;padding:1px 3px;font-family:monospace';
            overlay.appendChild(badge);
            document.body.appendChild(overlay);
            setTimeout(() => overlay.remove(), duration);
        }""",
            [selector, color, duration],
        )

    @activity(name="Test Selector", category="Web")
    def test_selector(self, selector: str) -> dict[str, Any]:
        self._ensure_page()
        result = self._page.evaluate(
            """(selector) => {
            let count = 0;
            let visible = null;
            let enabled = null;
            let warning = null;

            const isXPath = selector.startsWith('/') || selector.startsWith('(') || selector.startsWith('.');
            if (isXPath && (selector.startsWith('/') || selector.startsWith('('))) {
                try {
                    const xr = document.evaluate(selector, document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
                    count = xr.snapshotLength;
                } catch(e) {
                    return {valid: false, unique: false, count: 0, visible: null, enabled: null, warning: 'XPath error: ' + e.message};
                }
            } else {
                try {
                    const nodes = document.querySelectorAll(selector);
                    count = nodes.length;
                } catch(e) {
                    return {valid: false, unique: false, count: 0, visible: null, enabled: null, warning: 'CSS selector error: ' + e.message};
                }
            }

            if (count === 0) return {valid: false, unique: false, count: 0, visible: null, enabled: null, warning: 'No elements found'};

            const first = selector.startsWith('/') || selector.startsWith('(')
                ? document.evaluate(selector, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue
                : document.querySelector(selector);

            if (first) {
                const r = first.getBoundingClientRect();
                visible = r.width > 0 && r.height > 0 && window.getComputedStyle(first).display !== 'none';
                enabled = !first.disabled;
            }

            if (count > 1) warning = count + ' elements matched — selector is not unique';

            return {valid: true, unique: count === 1, count: count, visible: visible, enabled: enabled, warning: warning};
        }""",
            selector,
        )
        return result

    @activity(name="Get XPath From Point", category="Web")
    def get_xpath_from_point(self, x: int, y: int) -> dict[str, str]:
        self._ensure_page()
        result = self._page.evaluate(
            """([x, y]) => {
            const el = document.elementFromPoint(x, y);
            if (!el) return {xpath: '', css: '', tag: '', text: ''};

            function getXPath(node) {
                if (node.id) return '//' + node.tagName.toLowerCase() + '[@id=\'' + node.id + '\']';
                const parts = [];
                let cur = node;
                while (cur && cur.nodeType === 1) {
                    let idx = 1;
                    let sib = cur.previousSibling;
                    while (sib) {
                        if (sib.nodeType === 1 && sib.tagName === cur.tagName) idx++;
                        sib = sib.previousSibling;
                    }
                    const tag = cur.tagName.toLowerCase();
                    parts.unshift(idx > 1 ? tag + '[' + idx + ']' : tag);
                    cur = cur.parentElement;
                }
                return '/' + parts.join('/');
            }

            function getCSSPath(node) {
                if (node.id) return node.tagName.toLowerCase() + '#' + CSS.escape(node.id);
                const classes = Array.from(node.classList).slice(0, 3);
                if (classes.length > 0) return node.tagName.toLowerCase() + '.' + classes.map(c => CSS.escape(c)).join('.');
                return node.tagName.toLowerCase();
            }

            return {
                xpath: getXPath(el),
                css: getCSSPath(el),
                tag: el.tagName.toLowerCase(),
                text: (el.textContent || '').trim().slice(0, 100)
            };
        }""",
            [x, y],
        )
        return result

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
            raise ValueError(_t("library.no_page_to_close"))

        if target_id in self._pages:
            self._pages[target_id].close()
            del self._pages[target_id]
            if target_id in self._contexts:
                self._contexts[target_id].close()
                del self._contexts[target_id]
            self._page_browser.pop(target_id, None)
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
            self._page_browser.clear()
            self._current_browser_id = None
            self._current_page_id = None

            if self._playwright:
                self._playwright.stop()
                self._playwright = None

            logger.info(_t("library.all_browsers_closed_success"))
            return []

        target_id = browser_id or self._current_browser_id
        if not target_id:
            raise ValueError(_t("library.no_browser_to_close"))

        if target_id in self._browsers:
            for page_id in list(self._pages.keys()):
                if self._page_browser.get(page_id) == target_id:
                    with contextlib.suppress(Exception):
                        self._pages[page_id].close()
                    with contextlib.suppress(Exception):
                        if page_id in self._contexts:
                            self._contexts[page_id].close()
                    self._pages.pop(page_id, None)
                    self._contexts.pop(page_id, None)
                    self._page_browser.pop(page_id, None)

            self._browsers[target_id].close()
            del self._browsers[target_id]

            if not self._browsers and self._playwright:
                self._playwright.stop()
                self._playwright = None

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
            raise ValueError(_t("library.no_browserpage_open_use_open_browser_fir"))

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
