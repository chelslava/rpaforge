"""
RPAForge DesktopUI Library.

Windows desktop automation using pywinauto with multi-application and multi-window support.
"""

from __future__ import annotations

import contextlib
import logging
import time
from typing import TYPE_CHECKING, Any

from rpaforge.core.activity import activity, library, output, tags

if TYPE_CHECKING:
    from pathlib import Path

logger = logging.getLogger("rpaforge.desktop")


@library(name="DesktopUI", category="Desktop", icon="🖥")
class DesktopUI:
    """Windows desktop automation library with multi-instance support."""

    def __init__(self, backend: str = "uia"):
        self._backend = backend
        self._apps: dict[str, Any] = {}
        self._windows: dict[str, Any] = {}
        self._current_app_id: str | None = None
        self._current_window_id: str | None = None
        self._timeout: int = 10
        self._screenshot_on_failure: bool = False
        self._screenshot_dir: str = "."

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

    @property
    def _app(self) -> Any:
        if self._current_app_id and self._current_app_id in self._apps:
            return self._apps[self._current_app_id]
        return None

    @property
    def _current_window(self) -> Any:
        if self._current_window_id and self._current_window_id in self._windows:
            return self._windows[self._current_window_id]
        return None

    @activity(name="Open Application", category="Desktop")
    @tags("application", "startup")
    @output("Application instance ID")
    def open_application(
        self,
        executable: str | Path,
        args: str = "",
        app_id: str | None = None,
        _timeout: str = "30s",
    ) -> str:
        Application = self._pywinauto

        import uuid

        instance_id = app_id or f"app_{uuid.uuid4().hex[:8]}"

        if instance_id in self._apps:
            raise ValueError(f"Application instance '{instance_id}' already exists")

        cmd = str(executable)
        if args:
            cmd = f'"{cmd}" {args}'

        app = Application(backend=self._backend).start(cmd)
        self._apps[instance_id] = app
        self._current_app_id = instance_id

        logger.info(f"Started application: {executable} (id: {instance_id})")
        return instance_id

    @activity(name="Connect To Application", category="Desktop")
    @tags("application", "startup")
    @output("Application instance ID")
    def connect_to_application(
        self,
        process_id: int | None = None,
        window_title: str | None = None,
        app_id: str | None = None,
    ) -> str:
        Application = self._pywinauto

        import uuid

        instance_id = app_id or f"app_{uuid.uuid4().hex[:8]}"

        if instance_id in self._apps:
            raise ValueError(f"Application instance '{instance_id}' already exists")

        if process_id:
            app = Application(backend=self._backend).connect(process=process_id)
        elif window_title:
            app = Application(backend=self._backend).connect(
                title_re=f".*{window_title}.*"
            )
        else:
            raise ValueError("Either process_id or window_title must be provided")

        self._apps[instance_id] = app
        self._current_app_id = instance_id

        logger.info(f"Connected to application (PID: {app.process}, id: {instance_id})")
        return instance_id

    @activity(name="Switch Application", category="Desktop")
    @tags("application", "navigation")
    @output("Current application ID")
    def switch_application(self, app_id: str) -> str:
        if app_id not in self._apps:
            raise ValueError(f"Application '{app_id}' not found")

        self._current_app_id = app_id
        logger.info(f"Switched to application: {app_id}")
        return app_id

    @activity(name="List Applications", category="Desktop")
    @tags("application", "info")
    @output("List of application instance IDs")
    def list_applications(self) -> list[str]:
        return list(self._apps.keys())

    @activity(name="List Windows", category="Desktop")
    @tags("window", "info")
    @output("List of window instance IDs")
    def list_windows(self) -> list[str]:
        return list(self._windows.keys())

    @activity(name="Get Current Application", category="Desktop")
    @tags("application", "info")
    @output("Current application ID")
    def get_current_application(self) -> str:
        if not self._current_app_id:
            raise ValueError("No application is currently active")
        return self._current_app_id

    @activity(name="Get Current Window", category="Desktop")
    @tags("window", "info")
    @output("Current window ID")
    def get_current_window(self) -> str:
        if not self._current_window_id:
            raise ValueError("No window is currently active")
        return self._current_window_id

    @activity(name="Wait For Window", category="Desktop")
    @tags("window", "navigation")
    @output("Window instance ID")
    def wait_for_window(
        self,
        title: str,
        timeout: str = "30s",
        exact: bool = False,
        window_id: str | None = None,
    ) -> str:
        if not self._current_app_id:
            raise ValueError(
                "No application connected. Use Open Application or Connect To Application first."
            )

        import uuid

        instance_id = window_id or f"win_{uuid.uuid4().hex[:8]}"

        timeout_secs = self._parse_timeout(timeout)
        start = time.time()

        app = self._apps[self._current_app_id]

        while time.time() - start < timeout_secs:
            try:
                if exact:
                    window = app.window(title=title)
                else:
                    window = app.window(title_re=f".*{title}.*")

                if window.exists():
                    self._windows[instance_id] = window
                    self._current_window_id = instance_id
                    logger.info(f"Found window: {title} (id: {instance_id})")
                    return instance_id
            except Exception:
                pass  # Window not found yet, retry

            time.sleep(0.5)

        raise TimeoutError(f"Window '{title}' not found within {timeout}")

    @activity(name="Switch Window", category="Desktop")
    @tags("window", "navigation")
    @output("Current window ID")
    def switch_window(
        self,
        window_id: str | None = None,
        title: str | None = None,
        index: int | None = None,
    ) -> str:
        if window_id:
            if window_id not in self._windows:
                raise ValueError(f"Window '{window_id}' not found")
            self._current_window_id = window_id
            self._windows[window_id].set_focus()
            logger.info(f"Switched to window: {window_id}")
            return window_id

        if not self._current_app_id:
            raise ValueError("No application connected")

        app = self._apps[self._current_app_id]

        if title:
            window = app.window(title_re=f".*{title}.*")
            import uuid

            instance_id = f"win_{uuid.uuid4().hex[:8]}"
            self._windows[instance_id] = window
            self._current_window_id = instance_id
            window.set_focus()
            logger.info(f"Switched to window by title: {title}")
            return instance_id
        elif index is not None:
            windows = app.windows()
            window = windows[index]
            import uuid

            instance_id = f"win_{uuid.uuid4().hex[:8]}"
            self._windows[instance_id] = window
            self._current_window_id = instance_id
            window.set_focus()
            logger.info(f"Switched to window by index: {index}")
            return instance_id
        else:
            raise ValueError("Either window_id, title, or index must be provided")

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
    @output("Text content of the element")
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
    @output("Text content of the current window")
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
        window_id: str | None = None,
        title: str | None = None,
    ) -> None:
        target_id = window_id or self._current_window_id

        if title and self._current_app_id:
            app = self._apps[self._current_app_id]
            window = app.window(title_re=f".*{title}.*")
            window.close()
            for wid, w in list(self._windows.items()):
                if w == window:
                    del self._windows[wid]
                    if self._current_window_id == wid:
                        self._current_window_id = next(iter(self._windows.keys()), None)
                    break
            logger.info(f"Closed window: {title}")
            return

        if target_id and target_id in self._windows:
            self._windows[target_id].close()
            del self._windows[target_id]
            if self._current_window_id == target_id:
                self._current_window_id = next(iter(self._windows.keys()), None)
            logger.info(f"Closed window: {target_id}")
        else:
            raise ValueError("No window to close")

    @activity(name="Close Application", category="Desktop")
    @tags("application", "close")
    @output("List of remaining application IDs")
    def close_application(
        self, app_id: str | None = None, all: bool = False
    ) -> list[str]:
        if all:
            for _aid, app in list(self._apps.items()):
                with contextlib.suppress(Exception):
                    app.kill()

            for wid in list(self._windows.keys()):
                with contextlib.suppress(Exception):
                    self._windows[wid].close()

            self._apps.clear()
            self._windows.clear()
            self._current_app_id = None
            self._current_window_id = None

            logger.info("All applications closed")
            return []

        target_id = app_id or self._current_app_id
        if not target_id:
            raise ValueError("No application to close")

        if target_id in self._apps:
            windows_to_remove = [
                wid
                for wid, w in self._windows.items()
                if hasattr(w, "parent") and w.parent() == self._apps[target_id]
            ]
            for wid in windows_to_remove:
                with contextlib.suppress(Exception):
                    self._windows[wid].close()
                del self._windows[wid]
                if self._current_window_id == wid:
                    self._current_window_id = None

            self._apps[target_id].kill()
            del self._apps[target_id]
            logger.info(f"Closed application: {target_id}")

        if self._current_app_id == target_id:
            self._current_app_id = next(iter(self._apps.keys()), None)
            if self._current_app_id and self._current_app_id not in self._windows:
                self._current_window_id = None

        return list(self._apps.keys())

    @activity(name="Take Screenshot", category="Desktop")
    @tags("screenshot")
    @output("Filename of the saved screenshot")
    def take_screenshot(
        self,
        filename: str = "screenshot.png",
    ) -> str:
        if not self._current_window:
            raise ValueError("No window selected")

        self._current_window.capture_as_image().save(filename)
        logger.info(f"Screenshot saved: {filename}")
        return filename

    @activity(name="Set Screenshot On Failure", category="Desktop")
    @tags("screenshot", "config")
    def set_screenshot_on_failure(
        self,
        enabled: bool = True,
        directory: str = ".",
    ) -> None:
        self._screenshot_on_failure = enabled
        self._screenshot_dir = directory
        logger.info(f"Screenshot on failure: {enabled}, directory: {directory}")

    def _take_failure_screenshot(self, context: str = "") -> str | None:
        if not self._screenshot_on_failure:
            return None
        if not self._current_window:
            return None
        try:
            import os

            timestamp = time.strftime("%Y%m%d_%H%M%S")
            safe_context = "".join(
                c if c.isalnum() or c in "_-" else "_" for c in context
            )[:30]
            filename = os.path.join(
                self._screenshot_dir, f"failure_{timestamp}_{safe_context}.png"
            )
            self._current_window.capture_as_image().save(filename)
            logger.error(f"Failure screenshot saved: {filename}")
            return filename
        except Exception as e:
            logger.error(f"Failed to take failure screenshot: {e}")
            return None

    @activity(name="Validate Selector", category="Desktop")
    @tags("element", "validation")
    @output("Dictionary with validation results")
    def validate_selector(
        self,
        selector: str,
        timeout: str = "5s",
    ) -> dict[str, Any]:
        element = self._find_element(selector, timeout, raise_error=False)
        if element:
            return {
                "valid": True,
                "found": True,
                "text": (
                    element.window_text() if hasattr(element, "window_text") else ""
                ),
                "visible": (
                    element.is_visible() if hasattr(element, "is_visible") else True
                ),
                "enabled": (
                    element.is_enabled() if hasattr(element, "is_enabled") else True
                ),
            }
        return {
            "valid": False,
            "found": False,
            "text": "",
            "visible": False,
            "enabled": False,
        }

    @activity(name="Get Element Attribute", category="Desktop")
    @tags("element", "get")
    @output("Attribute value")
    def get_element_attribute(
        self,
        selector: str,
        attribute: str,
        timeout: str = "10s",
    ) -> str:
        element = self._find_element(selector, timeout)
        attribute_lower = attribute.lower()
        if attribute_lower in ("text", "window_text"):
            return element.window_text()
        elif attribute_lower in ("class", "class_name"):
            return element.class_name() if hasattr(element, "class_name") else ""
        elif attribute_lower in ("id", "auto_id", "automation_id"):
            return element.automation_id() if hasattr(element, "automation_id") else ""
        elif attribute_lower in ("enabled", "is_enabled"):
            return str(element.is_enabled()) if hasattr(element, "is_enabled") else ""
        elif attribute_lower in ("visible", "is_visible"):
            return str(element.is_visible()) if hasattr(element, "is_visible") else ""
        elif attribute_lower in ("rectangle", "rect", "bounds"):
            rect = element.rectangle() if hasattr(element, "rectangle") else None
            return str(rect) if rect else ""
        else:
            try:
                value = getattr(element, attribute, None)
                if callable(value):
                    value = value()
                return str(value) if value is not None else ""
            except Exception:
                return ""

    @activity(name="Wait Until Element Contains Text", category="Desktop")
    @tags("element", "wait")
    @output("True when element contains text")
    def wait_until_element_contains_text(
        self,
        selector: str,
        text: str,
        timeout: str = "30s",
        case_sensitive: bool = False,
    ) -> bool:
        timeout_secs = self._parse_timeout(timeout)
        start = time.time()

        search_text = text if case_sensitive else text.lower()

        while time.time() - start < timeout_secs:
            element = self._find_element(selector, "1s", raise_error=False)
            if element:
                element_text = element.window_text()
                compare_text = element_text if case_sensitive else element_text.lower()
                if search_text in compare_text:
                    logger.info(f"Element contains text: {text}")
                    return True
            time.sleep(0.5)

        raise TimeoutError(
            f"Element '{selector}' did not contain text '{text}' within {timeout}"
        )

    @activity(name="Get Element Properties", category="Desktop")
    @tags("element", "get")
    @output("Dictionary with element properties")
    def get_element_properties(
        self,
        selector: str,
        timeout: str = "10s",
    ) -> dict[str, Any]:
        element = self._find_element(selector, timeout)
        properties = {
            "text": element.window_text() if hasattr(element, "window_text") else "",
            "class_name": (
                element.class_name() if hasattr(element, "class_name") else ""
            ),
            "automation_id": (
                element.automation_id() if hasattr(element, "automation_id") else ""
            ),
            "is_visible": (
                element.is_visible() if hasattr(element, "is_visible") else False
            ),
            "is_enabled": (
                element.is_enabled() if hasattr(element, "is_enabled") else False
            ),
        }
        if hasattr(element, "rectangle"):
            rect = element.rectangle()
            if rect:
                properties["rectangle"] = {
                    "left": rect.left,
                    "top": rect.top,
                    "right": rect.right,
                    "bottom": rect.bottom,
                }
        return properties

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
                pass  # Element not found yet, retry

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
