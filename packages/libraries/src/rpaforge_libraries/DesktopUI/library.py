"""
RPAForge DesktopUI Library.

Windows desktop automation using pywinauto.
"""

from __future__ import annotations

import contextlib
import logging
import re
import time
from typing import TYPE_CHECKING, Any

from rpaforge.core.activity import activity, library, tags

if TYPE_CHECKING:
    from pathlib import Path

logger = logging.getLogger("rpaforge.desktop")


@library(name="DesktopUI", category="Desktop", icon="🖥")
class DesktopUI:
    """Windows desktop automation library."""

    def __init__(self, backend: str = "uia"):
        self._backend = backend
        self._app: Any = None
        self._current_window: Any = None
        self._timeout: int = 10

    @property
    def _pywinauto(self):
        try:
            from pywinauto import Application

            return Application
        except ImportError as err:
            raise ImportError(
                "pywinauto is required for DesktopUI library. "
                "Install it with: pip install rpaforge-libraries[desktop]"
            ) from err

    @activity(name="Open Application", category="Desktop")
    @tags("application", "startup")
    def open_application(
        self,
        executable: str | Path,
        args: str = "",
        timeout: str = "30s",
    ) -> str:
        Application = self._pywinauto

        cmd = str(executable)
        if args:
            cmd = f'"{cmd}" {args}'

        self._app = Application(backend=self._backend).start(cmd)

        logger.info(f"Started application: {executable}")
        return str(self._app.process)

    @activity(name="Connect To Application", category="Desktop")
    @tags("application", "startup")
    def connect_to_application(
        self,
        process_id: int | None = None,
        window_title: str | None = None,
    ) -> str:
        Application = self._pywinauto

        if process_id:
            self._app = Application(backend=self._backend).connect(process=process_id)
        elif window_title:
            self._app = Application(backend=self._backend).connect(
                title_re=f".*{window_title}.*"
            )
        else:
            raise ValueError("Either process_id or window_title must be provided")

        logger.info(f"Connected to application (PID: {self._app.process})")
        return str(self._app.process)

    @activity(name="Wait For Window", category="Desktop")
    @tags("window", "navigation")
    def wait_for_window(
        self,
        title: str,
        timeout: str = "30s",
        exact: bool = False,
    ) -> None:
        timeout_secs = self._parse_timeout(timeout)
        start = time.time()

        while time.time() - start < timeout_secs:
            try:
                if exact:
                    self._current_window = self._app.window(title=title)
                else:
                    self._current_window = self._app.window(title_re=f".*{title}.*")

                if self._current_window.exists():
                    logger.info(f"Found window: {title}")
                    return
            except Exception:
                pass

            time.sleep(0.5)

        raise TimeoutError(f"Window '{title}' not found within {timeout}")

    @activity(name="Switch Window", category="Desktop")
    @tags("window", "navigation")
    def switch_window(
        self,
        title: str | None = None,
        index: int | None = None,
    ) -> None:
        if title:
            self._current_window = self._app.window(title_re=f".*{title}.*")
        elif index is not None:
            windows = self._app.windows()
            self._current_window = windows[index]
        else:
            raise ValueError("Either title or index must be provided")

        self._current_window.set_focus()
        logger.info(f"Switched to window: {self._current_window.window_text()}")

    @activity(name="Click Element", category="Desktop")
    @tags("input", "mouse")
    def click_element(
        self,
        selector: str,
        timeout: str = "10s",
    ) -> None:
        element = self._find_element(selector, timeout)
        element.click()
        logger.info(f"Clicked element: {selector}")

    @activity(name="Double Click Element", category="Desktop")
    @tags("input", "mouse")
    def double_click_element(
        self,
        selector: str,
        timeout: str = "10s",
    ) -> None:
        element = self._find_element(selector, timeout)
        element.double_click()
        logger.info(f"Double-clicked element: {selector}")

    @activity(name="Input Text", category="Desktop")
    @tags("input", "keyboard")
    def input_text(
        self,
        selector: str | None,
        text: str,
        clear: bool = True,
        timeout: str = "10s",
    ) -> None:
        if selector:
            element = self._find_element(selector, timeout)
            if clear:
                with contextlib.suppress(Exception):
                    element.set_text("")
            element.type_keys(text)
        else:
            from pywinauto.keyboard import send_keys

            send_keys(text)

        logger.info(f"Input text: {text[:50]}...")

    @activity(name="Press Keys", category="Desktop")
    @tags("input", "keyboard")
    def press_keys(self, keys: str) -> None:
        from pywinauto.keyboard import send_keys

        send_keys(keys)
        logger.info(f"Pressed keys: {keys}")

    @activity(name="Get Element Text", category="Desktop")
    @tags("element", "get")
    def get_element_text(
        self,
        selector: str,
        timeout: str = "10s",
    ) -> str:
        element = self._find_element(selector, timeout)
        text = element.window_text()
        logger.info(f"Got text from element: {text[:50]}...")
        return text

    @activity(name="Get Window Text", category="Desktop")
    @tags("window", "get")
    def get_window_text(self) -> str:
        if not self._current_window:
            raise ValueError("No window selected. Use Wait For Window first.")
        return self._current_window.window_text()

    @activity(name="Wait Until Element Exists", category="Desktop")
    @tags("element", "wait")
    def wait_until_element_exists(
        self,
        selector: str,
        timeout: str = "30s",
    ) -> None:
        self._find_element(selector, timeout)
        logger.info(f"Element exists: {selector}")

    @activity(name="Wait Until Element Visible", category="Desktop")
    @tags("element", "wait")
    def wait_until_element_visible(
        self,
        selector: str,
        timeout: str = "30s",
    ) -> None:
        timeout_secs = self._parse_timeout(timeout)
        start = time.time()

        while time.time() - start < timeout_secs:
            element = self._find_element(selector, "1s", raise_error=False)
            if element and element.is_visible():
                logger.info(f"Element visible: {selector}")
                return
            time.sleep(0.5)

        raise TimeoutError(f"Element '{selector}' not visible within {timeout}")

    @activity(name="Close Window", category="Desktop")
    @tags("window", "close")
    def close_window(
        self,
        title: str | None = None,
    ) -> None:
        if title:
            window = self._app.window(title_re=f".*{title}.*")
            window.close()
        elif self._current_window:
            self._current_window.close()
        else:
            raise ValueError("No window to close")

        logger.info(f"Closed window: {title or 'current'}")

    @activity(name="Close Application", category="Desktop")
    @tags("application", "close")
    def close_application(self) -> None:
        if self._app:
            self._app.kill()
            logger.info("Application closed")
            self._app = None
            self._current_window = None

    @activity(name="Take Screenshot", category="Desktop")
    @tags("screenshot")
    def take_screenshot(
        self,
        filename: str = "screenshot.png",
    ) -> str:
        if not self._current_window:
            raise ValueError("No window selected")

        self._current_window.capture_as_image().save(filename)
        logger.info(f"Screenshot saved: {filename}")
        return filename

    def _find_element(
        self,
        selector: str,
        timeout: str = "10s",
        raise_error: bool = True,
    ) -> Any:
        if not self._current_window:
            raise ValueError("No window selected. Use Wait For Window first.")

        timeout_secs = self._parse_timeout(timeout)
        start = time.time()

        selector_type, selector_value = self._parse_selector(selector)

        while time.time() - start < timeout_secs:
            try:
                if selector_type == "id":
                    element = self._current_window.child_window(auto_id=selector_value)
                elif selector_type == "name":
                    element = self._current_window.child_window(title=selector_value)
                elif selector_type == "class":
                    element = self._current_window.child_window(
                        class_name=selector_value
                    )
                elif selector_type == "automation":
                    element = self._current_window.child_window(auto_id=selector_value)
                else:
                    element = self._current_window.child_window(
                        title_re=f".*{selector_value}.*"
                    )

                if element.exists():
                    return element
            except Exception:
                pass

            time.sleep(0.5)

        if raise_error:
            raise TimeoutError(f"Element '{selector}' not found within {timeout}")
        return None

    def _parse_selector(self, selector: str) -> tuple[str, str]:
        if ":" in selector:
            selector_type, selector_value = selector.split(":", 1)
            return selector_type.lower(), selector_value
        return "auto", selector

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
