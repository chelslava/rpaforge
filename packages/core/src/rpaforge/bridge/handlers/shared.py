"""Shared utilities for bridge handlers."""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from collections.abc import Callable


logger = logging.getLogger("rpaforge.bridge")

LIBRARY_MAPPINGS = [
    ("DesktopUI", "rpaforge_libraries.DesktopUI", "Desktop UI automation"),
    ("Excel", "rpaforge_libraries.Excel", "Excel operations"),
    ("File", "rpaforge_libraries.File", "File operations"),
    ("Flow", "rpaforge_libraries.Flow", "Flow control"),
    ("HTTP", "rpaforge_libraries.HTTP", "HTTP requests"),
    ("String", "rpaforge_libraries.String", "String operations"),
    ("DateTime", "rpaforge_libraries.DateTime", "Date/time operations"),
    ("Variables", "rpaforge_libraries.Variables", "Variable operations"),
    ("WebUI", "rpaforge_libraries.WebUI", "Web automation"),
    ("DataFrames", "rpaforge_libraries.DataFrames", "DataFrame operations"),
]


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
        "version": "0.2.0",
        "features": {
            "debugger": True,
            "breakpoints": True,
            "stepping": True,
            "variableWatching": True,
            "nativePython": True,
        },
        "libraries": [lib.name for lib in list_libraries()],
    }


def register_libraries(engine) -> None:
    """Register all available libraries with the engine."""
    import importlib

    for lib_name, lib_module, description in LIBRARY_MAPPINGS:
        try:
            module = importlib.import_module(f"{lib_module}.library")
            lib_class = getattr(module, lib_name)
            engine.executor.register_library(lib_name, lib_class())
        except ImportError:
            logger.warning(
                f"{lib_name} library not available ({description}). "
                f"Install with: pip install rpaforge[{lib_name.lower()}]"
            )
        except AttributeError:
            logger.warning(f"{lib_name} class not found in {lib_module}")
        except Exception:
            logger.exception(f"Failed to register {lib_name}")


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
