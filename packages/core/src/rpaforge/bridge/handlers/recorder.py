"""Bridge handlers for explicit, session-only process recording."""

from __future__ import annotations

import asyncio
import contextlib
import logging
import sys
import uuid
from datetime import datetime, timezone
from typing import Any

from rpaforge.bridge.protocol import JSONRPCError, JSONRPCErrorCode

logger = logging.getLogger("rpaforge.bridge.recorder")


class _DesktopRecorder:
    """Best-effort Windows recorder using optional pynput and UI Automation."""

    _CONTROL_KEYS = {
        "alt",
        "backspace",
        "cmd",
        "ctrl",
        "delete",
        "down",
        "end",
        "enter",
        "esc",
        "home",
        "insert",
        "left",
        "page_down",
        "page_up",
        "right",
        "shift",
        "space",
        "tab",
        "up",
    } | {f"f{index}" for index in range(1, 13)}

    def __init__(self, callback: Any) -> None:
        self._callback = callback
        self._mouse_listener: Any = None
        self._keyboard_listener: Any = None
        self._action_count = 0

    def start(self) -> bool:
        if sys.platform != "win32":
            return False
        if self._mouse_listener is not None:
            return True
        try:
            from pynput import keyboard, mouse
        except ImportError:
            logger.debug("Desktop recording unavailable: pynput is not installed")
            return False

        self._action_count = 0
        try:
            self._mouse_listener = mouse.Listener(on_click=self._on_click)
            self._keyboard_listener = keyboard.Listener(on_press=self._on_press)
            self._mouse_listener.start()
            self._keyboard_listener.start()
        except Exception:
            logger.debug("Desktop recording could not start", exc_info=True)
            self.stop()
            return False
        return True

    def stop(self) -> int:
        for listener in (self._mouse_listener, self._keyboard_listener):
            if listener is None:
                continue
            with contextlib.suppress(Exception):
                listener.stop()
            with contextlib.suppress(Exception):
                listener.join(timeout=1)
        self._mouse_listener = None
        self._keyboard_listener = None
        action_count = self._action_count
        self._action_count = 0
        return action_count

    @property
    def is_active(self) -> bool:
        """Return whether global desktop listeners are currently attached."""
        return self._mouse_listener is not None

    def _emit(self, action: dict[str, Any]) -> None:
        self._action_count += 1
        self._callback(action)

    def _on_click(self, x: int, y: int, _button: Any, pressed: bool) -> None:
        if not pressed:
            return
        try:
            from rpaforge_libraries.Spy import get_element_at_point_desktop

            element = get_element_at_point_desktop(x, y)
        except Exception:
            logger.debug("Desktop element lookup failed", exc_info=True)
            return
        selector = (element or {}).get("reliableSelector")
        if not selector or not selector.get("value"):
            return
        self._emit(
            {
                "id": f"desktop-recording-{uuid.uuid4()}",
                "type": "click",
                "selector": selector,
                "allCandidates": [selector],
                "timestamp": int(datetime.now(timezone.utc).timestamp() * 1000),
                "source": "desktop",
            }
        )

    def _on_press(self, key: Any) -> None:
        key_name = getattr(key, "name", None) or str(key).removeprefix("Key.")
        if key_name not in self._CONTROL_KEYS:
            return
        self._emit(
            {
                "id": f"desktop-recording-{uuid.uuid4()}",
                "type": "keypress",
                "selector": {"type": "keyboard", "value": "", "reliability": 1.0},
                "allCandidates": [],
                "timestamp": int(datetime.now(timezone.utc).timestamp() * 1000),
                "value": key_name,
                "source": "desktop",
            }
        )


def setup_recorder_handlers(cls: type) -> None:
    """Add recorder controls backed by the registered WebUI library."""

    def _get_webui_instance(self: Any) -> Any | None:
        return self._engine.executor._libraries.get("WebUI")

    def _get_desktop_recorder(self: Any) -> _DesktopRecorder:
        recorder = getattr(self, "_desktop_recorder", None)
        if recorder is None:
            recorder = _DesktopRecorder(
                lambda event: _emit_recording_event(self, event)
            )
            self._desktop_recorder = recorder
        return recorder

    def _emit_recording_event(self: Any, event: dict[str, Any]) -> None:
        self._emit(
            {
                "type": "recordingAction",
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "action": event,
            }
        )

    async def _handle_start_recording(
        self: Any, _params: dict[str, Any]
    ) -> dict[str, Any]:
        webui = _get_webui_instance(self)
        desktop_recorder = _get_desktop_recorder(self)
        desktop_available = await asyncio.to_thread(desktop_recorder.start)
        web_available = False
        try:
            if webui is not None:
                result = await asyncio.to_thread(
                    webui.start_recording,
                    lambda event: _emit_recording_event(self, event),
                )
                web_available = bool(result["capabilities"].get("web"))
        except Exception as exc:
            if not desktop_available:
                logger.info("Recorder could not start: %s", exc)
                raise JSONRPCError(
                    code=JSONRPCErrorCode.INVALID_PARAMS,
                    message=str(exc),
                ) from exc
            logger.info(
                "Web recording unavailable; continuing with desktop hooks: %s", exc
            )

        capabilities = {"web": web_available, "desktop": desktop_available}
        if not any(capabilities.values()):
            raise JSONRPCError(
                code=JSONRPCErrorCode.INVALID_PARAMS,
                message="No recording capability is available.",
            )

        self._emit(
            {
                "type": "recordingState",
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "state": "recording",
                "capabilities": capabilities,
            }
        )
        return {"recording": True, "capabilities": capabilities}

    async def _handle_stop_recording(
        self: Any, _params: dict[str, Any]
    ) -> dict[str, Any]:
        webui = _get_webui_instance(self)
        action_count = 0
        capabilities = {"web": False, "desktop": False}
        if webui is not None:
            result = await asyncio.to_thread(webui.stop_recording)
            action_count += result["actionCount"]
            capabilities["web"] = bool(result["capabilities"].get("web"))
        desktop_recorder = getattr(self, "_desktop_recorder", None)
        if desktop_recorder is not None:
            desktop_active = desktop_recorder.is_active
            action_count += await asyncio.to_thread(desktop_recorder.stop)
            capabilities["desktop"] = desktop_active
        self._emit(
            {
                "type": "recordingState",
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "state": "idle",
                "capabilities": capabilities,
            }
        )
        return {
            "recording": False,
            "actionCount": action_count,
            "capabilities": capabilities,
        }

    cls._handle_start_recording = _handle_start_recording
    cls._handle_stop_recording = _handle_stop_recording
