"""WebUI spy handlers for element inspection and manipulation."""

from __future__ import annotations

import asyncio
import base64


def setup_webui_spy_handlers(cls: type) -> None:
    """Add WebUI spy methods to BridgeHandlers class."""

    def _get_webui_instance(self):
        webui = self._engine.executor._libraries.get("WebUI")
        if webui is None:
            from rpaforge.bridge.protocol import JSONRPCError

            raise JSONRPCError(
                code=-32001, message="WebUI not initialized. Open a browser first."
            )
        return webui

    async def _handle_inspect_page(self, params: dict) -> dict:
        webui = _get_webui_instance(self)
        include_frames = params.get("includeFrames", True)
        return webui.inspect_page(include_frames=include_frames)

    async def _handle_highlight_element(self, params: dict) -> dict:
        webui = _get_webui_instance(self)
        webui.highlight_element(
            selector=params["selector"],
            color=params.get("color", "yellow"),
            duration=params.get("duration", 3000),
        )
        return {"success": True}

    async def _handle_test_selector(self, params: dict) -> dict:
        webui = _get_webui_instance(self)
        return webui.test_selector(selector=params["selector"])

    async def _handle_get_xpath_from_point(self, params: dict) -> dict:
        webui = _get_webui_instance(self)
        return webui.get_xpath_from_point(x=params["x"], y=params["y"])

    async def _handle_capture_screenshot(self, params: dict) -> dict:
        from rpaforge.bridge.protocol import JSONRPCError, JSONRPCErrorCode

        webui = _get_webui_instance(self)
        try:
            screenshot_bytes = await asyncio.wait_for(
                asyncio.get_event_loop().run_in_executor(
                    None,
                    lambda: webui._page.screenshot(
                        full_page=params.get("fullPage", False)
                    ),
                ),
                timeout=30.0,
            )
        except asyncio.TimeoutError as err:
            raise JSONRPCError(
                JSONRPCErrorCode.INTERNAL_ERROR,
                "capturePageScreenshot timed out after 30s",
            ) from err
        return {"data": base64.b64encode(screenshot_bytes).decode(), "format": "png"}

    cls._get_webui_instance = _get_webui_instance
    cls._handle_inspect_page = _handle_inspect_page
    cls._handle_highlight_element = _handle_highlight_element
    cls._handle_test_selector = _handle_test_selector
    cls._handle_get_xpath_from_point = _handle_get_xpath_from_point
    cls._handle_capture_screenshot = _handle_capture_screenshot
