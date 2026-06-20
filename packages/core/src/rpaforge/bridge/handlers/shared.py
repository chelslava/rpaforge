"""Shared utilities for bridge handlers."""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

from rpaforge.version import VERSION

if TYPE_CHECKING:
    from collections.abc import Callable


def emit(event_dict: dict, emit_event: Callable[[dict], None] | None) -> None:
    """Emit an event if emit_event callback is available."""
    if emit_event:
        emit_event(event_dict)


def get_status(runner_active: bool, paused: bool) -> str:
    """Get current process status."""
    if not runner_active:
        return "idle"
    if paused:
        return "paused"
    return "running"


def get_capabilities() -> dict[str, Any]:
    """Return engine capabilities."""
    from rpaforge.core.activity import list_libraries

    return {
        "version": VERSION,
        "features": {
            "debugger": True,
            "breakpoints": True,
            "stepping": True,
            "variableWatching": True,
            "nativePython": True,
        },
        "libraries": [lib.name for lib in list_libraries()],
    }


def get_webui_instance(engine) -> Any:
    """Get WebUI library instance or raise error."""
    from rpaforge.bridge.protocol import JSONRPCError

    webui = engine.executor._libraries.get("WebUI")
    if webui is None:
        raise JSONRPCError(
            code=-32001, message="WebUI not initialized. Open a browser first."
        )
    return webui


def get_desktopui_instance(engine) -> Any:
    """Get DesktopUI library instance or raise error."""
    from rpaforge.bridge.protocol import JSONRPCError

    desktopui = engine.executor._libraries.get("DesktopUI")
    if desktopui is None:
        raise JSONRPCError(
            code=-32001,
            message="DesktopUI not initialized. Open an application first.",
        )
    return desktopui
