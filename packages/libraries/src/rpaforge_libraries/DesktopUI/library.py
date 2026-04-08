"""
RPAForge DesktopUI Library.

Windows desktop automation using pywinauto.
"""

from __future__ import annotations

import contextlib
from typing import TYPE_CHECKING, Any

from robot.api import logger
from robot.api.deco import keyword, library

if TYPE_CHECKING:
    from pathlib import Path


@library(scope="GLOBAL", auto_keywords=True)
class DesktopUI:
    """Windows desktop automation library.

    This library provides keywords for automating Windows desktop
    applications using pywinauto as the backend.

    == Supported Technologies ==

    - Win32 applications
    - WPF applications
    - Windows Forms
    - Java Swing (partial support)

    == Example ==

    | *** Settings ***   |                        |              |
    | Library            | RPAForge.DesktopUI     |              |
    |                    |                        |              |
    | *** Tasks ***      |                        |              |
    | Open And Type      |                        |              |
    |                    | Open Application       | notepad.exe  |
    |                    | Wait For Window        | Notepad      |
    |                    | Input Text             | Hello World  |
    |                    | Close Window           |              |
    """

    ROBOT_LIBRARY_SCOPE = "GLOBAL"
    ROBOT_LIBRARY_VERSION = "0.1.0"

    def __init__(self, backend: str = "uia"):
        """Initialize the DesktopUI library.

        :param backend: Backend to use ('uia' for UI Automation, 'win32' for Win32 API).
        """
        self._backend = backend
        self._app: Any = None
        self._current_window: Any = None
        self._timeout: int = 10

    @property
    def _pywinauto(self):
        """Lazy import of pywinauto."""
        try:
            from pywinauto import Application

            return Application
        except ImportError as err:
            raise ImportError(
                "pywinauto is required for DesktopUI library. "
                "Install it with: pip install rpaforge-libraries[desktop]"
            ) from err

    @keyword(tags=["application", "startup"])
    def open_application(
        self,
        executable: str | Path,
        args: str = "",
        timeout: str = "30s",  # noqa: ARG002
    ) -> str:
        """Open a desktop application.

        :param executable: Path to the executable or application name.
        :param args: Command line arguments.
        :param timeout: Timeout for application to start.
        :returns: Process ID of the started application.

        Example:
            | Open Application    notepad.exe
            | Open Application    C:/Program Files/App/app.exe    --verbose
        """
        Application = self._pywinauto

        cmd = str(executable)
        if args:
            cmd = f'"{cmd}" {args}'

        self._app = Application(backend=self._backend).start(cmd)

        logger.info(f"Started application: {executable}")
        return str(self._app.process)

    @keyword(tags=["application", "startup"])
    def connect_to_application(
        self,
        process_id: int | None = None,
        window_title: str | None = None,
    ) -> str:
        """Connect to a running application.

        :param process_id: Process ID to connect to.
        :param window_title: Window title to find the application.
        :returns: Process ID of the connected application.

        Example:
            | Connect To Application    process_id=1234
            | Connect To Application    window_title=Calculator
        """
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

    @keyword(tags=["window", "navigation"])
    def wait_for_window(
        self,
        title: str,
        timeout: str = "30s",
        exact: bool = False,
    ) -> None:
        """Wait for a window to appear.

        :param title: Window title (or partial title).
        :param timeout: Maximum time to wait.
        :param exact: Whether to match title exactly.

        Example:
            | Wait For Window    Notepad
            | Wait For Window    Untitled - Notepad    exact=True
        """
        import time

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

    @keyword(tags=["window", "navigation"])
    def switch_window(
        self,
        title: str | None = None,
        index: int | None = None,
    ) -> None:
        """Switch to a different window.

        :param title: Window title to switch to.
        :param index: Window index (0-based).

        Example:
            | Switch Window    title=Calculator
            | Switch Window    index=1
        """
        if title:
            self._current_window = self._app.window(title_re=f".*{title}.*")
        elif index is not None:
            windows = self._app.windows()
            self._current_window = windows[index]
        else:
            raise ValueError("Either title or index must be provided")

        self._current_window.set_focus()
        logger.info(f"Switched to window: {self._current_window.window_text()}")

    @keyword(tags=["input", "mouse"])
    def click_element(
        self,
        selector: str,
        timeout: str = "10s",
    ) -> None:
        """Click on an element.

        :param selector: Element selector (automation_id, name, or class).
        :param timeout: Timeout for element to appear.

        Example:
            | Click Element    id:btnOK
            | Click Element    name:Submit
        """
        element = self._find_element(selector, timeout)
        element.click()
        logger.info(f"Clicked element: {selector}")

    @keyword(tags=["input", "mouse"])
    def double_click_element(
        self,
        selector: str,
        timeout: str = "10s",
    ) -> None:
        """Double-click on an element.

        :param selector: Element selector.
        :param timeout: Timeout for element to appear.
        """
        element = self._find_element(selector, timeout)
        element.double_click()
        logger.info(f"Double-clicked element: {selector}")

    @keyword(tags=["input", "keyboard"])
    def input_text(
        self,
        selector: str | None,
        text: str,
        clear: bool = True,
        timeout: str = "10s",
    ) -> None:
        """Input text into an element.

        :param selector: Element selector (None for current focused element).
        :param text: Text to input.
        :param clear: Whether to clear existing text first.
        :param timeout: Timeout for element to appear.

        Example:
            | Input Text    id:txtName    John Doe
            | Input Text    ${None}    Direct typing
        """
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

    @keyword(tags=["input", "keyboard"])
    def press_keys(self, keys: str) -> None:
        """Press keyboard keys.

        :param keys: Keys to press (e.g., '{ENTER}', '{CTRL}c').

        Example:
            | Press Keys    {ENTER}
            | Press Keys    {CTRL}s
        """
        from pywinauto.keyboard import send_keys

        send_keys(keys)
        logger.info(f"Pressed keys: {keys}")

    @keyword(tags=["element", "get"])
    def get_element_text(
        self,
        selector: str,
        timeout: str = "10s",
    ) -> str:
        """Get text from an element.

        :param selector: Element selector.
        :param timeout: Timeout for element to appear.
        :returns: Text content of the element.

        Example:
            | ${text}=    Get Element Text    id:lblStatus
            | Log    ${text}
        """
        element = self._find_element(selector, timeout)
        text = element.window_text()
        logger.info(f"Got text from element: {text[:50]}...")
        return text

    @keyword(tags=["window", "get"])
    def get_window_text(self) -> str:
        """Get text from the current window.

        :returns: Text content of the current window.
        """
        if not self._current_window:
            raise ValueError("No window selected. Use Wait For Window first.")
        return self._current_window.window_text()

    @keyword(tags=["element", "wait"])
    def wait_until_element_exists(
        self,
        selector: str,
        timeout: str = "30s",
    ) -> None:
        """Wait until an element exists.

        :param selector: Element selector.
        :param timeout: Maximum time to wait.
        """
        self._find_element(selector, timeout)
        logger.info(f"Element exists: {selector}")

    @keyword(tags=["element", "wait"])
    def wait_until_element_visible(
        self,
        selector: str,
        timeout: str = "30s",
    ) -> None:
        """Wait until an element is visible.

        :param selector: Element selector.
        :param timeout: Maximum time to wait.
        """
        import time

        timeout_secs = self._parse_timeout(timeout)
        start = time.time()

        while time.time() - start < timeout_secs:
            element = self._find_element(selector, "1s", raise_error=False)
            if element and element.is_visible():
                logger.info(f"Element visible: {selector}")
                return
            time.sleep(0.5)

        raise TimeoutError(f"Element '{selector}' not visible within {timeout}")

    @keyword(tags=["window", "close"])
    def close_window(
        self,
        title: str | None = None,
    ) -> None:
        """Close a window.

        :param title: Window title (None for current window).

        Example:
            | Close Window
            | Close Window    title=Calculator
        """
        if title:
            window = self._app.window(title_re=f".*{title}.*")
            window.close()
        elif self._current_window:
            self._current_window.close()
        else:
            raise ValueError("No window to close")

        logger.info(f"Closed window: {title or 'current'}")

    @keyword(tags=["application", "close"])
    def close_application(self) -> None:
        """Close the application."""
        if self._app:
            self._app.kill()
            logger.info("Application closed")
            self._app = None
            self._current_window = None

    @keyword(tags=["screenshot"])
    def take_screenshot(
        self,
        filename: str = "screenshot.png",
    ) -> str:
        """Take a screenshot of the current window.

        :param filename: Output filename.
        :returns: Path to the screenshot file.
        """
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
        """Find an element by selector.

        :param selector: Element selector (id:name, name:value, class:value).
        :param timeout: Timeout for element to appear.
        :param raise_error: Whether to raise error if not found.
        :returns: Element or None.
        """
        import time

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
        """Parse a selector string.

        :param selector: Selector in format 'type:value' or just 'value'.
        :returns: Tuple of (selector_type, selector_value).
        """
        if ":" in selector:
            selector_type, selector_value = selector.split(":", 1)
            return selector_type.lower(), selector_value
        return "auto", selector

    def _parse_timeout(self, timeout: str) -> float:
        """Parse timeout string to seconds.

        :param timeout: Timeout string (e.g., '10s', '1m', '500ms').
        :returns: Timeout in seconds.
        """
        from robot.utils import timestr_to_secs

        return timestr_to_secs(timeout)
