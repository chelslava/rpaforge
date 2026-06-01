"""DesktopUI spy handlers for window inspection and element capture."""

from __future__ import annotations

import logging

logger = logging.getLogger("rpaforge.bridge")


def setup_desktopui_spy_handlers(cls: type) -> None:
    """Add DesktopUI spy methods to BridgeHandlers class."""

    def _get_desktopui_instance(self):
        desktopui = self._engine.executor._libraries.get("DesktopUI")
        if desktopui is None:
            from rpaforge.bridge.protocol import JSONRPCError

            raise JSONRPCError(
                code=-32001,
                message="DesktopUI not initialized. Open an application first.",
            )
        return desktopui

    async def _handle_inspect_desktop(self, params: dict) -> dict:
        from rpaforge.bridge.protocol import JSONRPCError, JSONRPCErrorCode

        window_handle = params.get("windowId")
        if window_handle is not None:
            return self._inspect_by_handle(int(window_handle), params)
        desktopui = _get_desktopui_instance(self)
        try:
            return desktopui.inspect_window()
        except ValueError as e:
            raise JSONRPCError(
                code=JSONRPCErrorCode.INVALID_PARAMS, message=str(e)
            ) from e

    def _inspect_by_handle(self, handle: int, params: dict) -> dict:
        from rpaforge.bridge.protocol import JSONRPCError, JSONRPCErrorCode

        if not params.get("confirmed", False):
            raise JSONRPCError(
                JSONRPCErrorCode.INVALID_PARAMS,
                "inspect_by_handle requires explicit confirmation: pass confirmed=True in params",
            )
        try:
            from pywinauto import Application

            from rpaforge_libraries.DesktopUI import DesktopUI

            app = Application(backend="uia").connect(handle=handle)
            win = app.window(handle=handle)
            temp_ui = DesktopUI()
            temp_ui._apps["__tmp__"] = app
            temp_ui._windows["__tmp__"] = win
            temp_ui._current_window_id = "__tmp__"
            return temp_ui.inspect_window()
        except ImportError as e:
            raise JSONRPCError(
                code=-32001,
                message="pywinauto is required. Install rpaforge-libraries[desktop]",
            ) from e
        except Exception as e:
            raise JSONRPCError(
                code=JSONRPCErrorCode.INVALID_PARAMS, message=str(e)
            ) from e

    async def _handle_list_windows(self, _params: dict) -> dict:
        from rpaforge.bridge.protocol import JSONRPCError

        try:
            from pywinauto import Desktop

            windows = []
            failed_windows = []
            try:
                for win in Desktop(backend="uia").windows():
                    try:
                        title = win.window_text()
                        if not title:
                            continue
                        rect = win.rectangle()
                        if (rect.right - rect.left) <= 0 or (
                            rect.bottom - rect.top
                        ) <= 0:
                            continue
                        windows.append(
                            {
                                "title": title,
                                "pid": win.process_id(),
                                "handle": win.handle,
                            }
                        )
                    except Exception as e:
                        logger.debug(f"Failed to access window properties: {e}")
                        failed_windows.append(str(e))
                        continue
            except Exception as e:
                logger.warning(f"Error enumerating windows: {e}")
            if failed_windows:
                logger.debug(f"Skipped {len(failed_windows)} windows due to errors")
            return {"windows": windows}
        except ImportError as e:
            raise JSONRPCError(
                code=-32001,
                message="pywinauto is required. Install rpaforge-libraries[desktop]",
            ) from e

    async def _handle_test_desktop_selector(self, params: dict) -> dict:
        desktopui = _get_desktopui_instance(self)
        return desktopui.test_desktop_selector(selector=params.get("selector", ""))

    async def _handle_highlight_desktop_element(self, params: dict) -> dict:
        desktopui = _get_desktopui_instance(self)
        desktopui.highlight_desktop_element(selector=params.get("selector", ""))
        return {"success": True}

    def _run_in_executor(self, func, *args, timeout: float = 30.0):
        """Run a blocking function in a thread pool."""
        import concurrent.futures

        from rpaforge.bridge.protocol import JSONRPCError, JSONRPCErrorCode

        with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
            future = pool.submit(func, *args)
            try:
                return future.result(timeout=timeout)
            except concurrent.futures.TimeoutError as err:
                raise JSONRPCError(
                    JSONRPCErrorCode.INTERNAL_ERROR,
                    f"Operation timed out after {timeout}s",
                ) from err

    async def _handle_capture_web_element(self, params: dict) -> dict:
        from rpaforge.bridge.protocol import JSONRPCError

        logger.debug("Capturing web element...")
        from rpaforge_libraries.Spy import get_element_at_point_web

        x = params.get("x", 0)
        y = params.get("y", 0)
        result = self._run_in_executor(get_element_at_point_web, x, y)
        logger.debug(f"Web element capture result: {result}")
        if result is None:
            raise JSONRPCError(
                code=-32002,
                message="No web element found at position. Make sure Chrome has remote debugging enabled (--remote-debugging-port=9222)",
            )
        return result

    async def _handle_capture_desktop_element(self, params: dict) -> dict:
        from rpaforge.bridge.protocol import JSONRPCError

        logger.debug("Capturing desktop element...")
        from rpaforge_libraries.Spy import get_element_at_point_desktop

        x = params.get("x", 0)
        y = params.get("y", 0)
        result = self._run_in_executor(get_element_at_point_desktop, x, y)
        logger.debug(f"Desktop element capture result: {result}")
        if result is None:
            raise JSONRPCError(
                code=-32003, message="No desktop element found at position"
            )
        return result

    async def _handle_get_mouse_position(self, _params: dict) -> dict:
        from rpaforge_libraries.Spy import get_mouse_position

        x, y = get_mouse_position()
        return {"x": x, "y": y}

    cls._get_desktopui_instance = _get_desktopui_instance
    cls._handle_inspect_desktop = _handle_inspect_desktop
    cls._inspect_by_handle = _inspect_by_handle
    cls._handle_list_windows = _handle_list_windows
    cls._handle_test_desktop_selector = _handle_test_desktop_selector
    cls._handle_highlight_desktop_element = _handle_highlight_desktop_element
    cls._run_in_executor = _run_in_executor
    cls._handle_capture_web_element = _handle_capture_web_element
    cls._handle_capture_desktop_element = _handle_capture_desktop_element
    cls._handle_get_mouse_position = _handle_get_mouse_position
