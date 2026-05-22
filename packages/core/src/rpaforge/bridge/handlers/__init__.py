"""Bridge handlers subpackage.

Provides modular implementations of JSON-RPC handlers.
"""

from __future__ import annotations

import asyncio
import contextlib
import logging
import time
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from collections.abc import Callable

    from rpaforge.core.runner import ProcessRunner, StudioEngine

from rpaforge.bridge.events import (
    ProcessPausedEvent,
    ProcessResumedEvent,
)

from . import codegen, debugger, desktopui_spy, lifecycle, webui_spy

logger = logging.getLogger("rpaforge.bridge")


class BridgeHandlers:
    """Handlers for JSON-RPC methods."""

    def __init__(
        self,
        engine: StudioEngine,
        emit_event: Callable[[dict], None] | None = None,
    ):
        self._engine = engine
        self._runner: ProcessRunner | None = None
        self._emit_event = emit_event
        self._process_task: asyncio.Task | None = None
        self._process_future: asyncio.Future | None = None
        self._process_id: str | None = None
        self._cancel_requested = False
        self._paused = False
        self._terminal_event_emitted = False
        self._start_time: float = 0.0
        self._current_sourcemap: dict = {}
        self._heartbeat_interval: float = 30.0
        self._last_heartbeat: float = time.time()
        self._lifecycle_lock = asyncio.Lock()
        self._pending_breakpoints: list[dict[str, Any]] = []
        self._current_run_id: str = ""

        lifecycle.setup_lifecycle_handlers(BridgeHandlers)
        debugger.setup_debugger_handlers(BridgeHandlers)
        codegen.setup_codegen_handlers(BridgeHandlers)
        webui_spy.setup_webui_spy_handlers(BridgeHandlers)
        desktopui_spy.setup_desktopui_spy_handlers(BridgeHandlers)

        self._ensure_activities_registered()

    def _ensure_activities_registered(self) -> None:
        """Register all available libraries with graceful handling for optional deps."""
        from .shared import LIBRARY_MAPPINGS

        for lib_name, lib_module, description in LIBRARY_MAPPINGS:
            try:
                import importlib

                module = importlib.import_module(f"{lib_module}.library")
                lib_class = getattr(module, lib_name)
                self._engine.executor.register_library(lib_name, lib_class())
            except ImportError:
                logger.warning(
                    f"{lib_name} library not available ({description}). "
                    f"Install with: pip install rpaforge[{lib_name.lower()}]"
                )
            except AttributeError:
                logger.warning(f"{lib_name} class not found in {lib_module}")
            except Exception:
                logger.exception(f"Failed to register {lib_name}")

    def get_handlers(self) -> dict[str, Callable[[dict], Any]]:
        return {
            "ping": self._handle_ping,
            "getCapabilities": self._handle_get_capabilities,
            "runProcess": self._handle_run_process,
            "runDiagram": self._handle_run_diagram,
            "stopProcess": self._handle_stop_process,
            "pauseProcess": self._handle_pause_process,
            "resumeProcess": self._handle_resume_process,
            "setBreakpoint": self._handle_set_breakpoint,
            "removeBreakpoint": self._handle_remove_breakpoint,
            "toggleBreakpoint": self._handle_toggle_breakpoint,
            "getBreakpoints": self._handle_get_breakpoints,
            "stepOver": self._handle_step_over,
            "stepInto": self._handle_step_into,
            "stepOut": self._handle_step_out,
            "continue": self._handle_continue,
            "getVariables": self._handle_get_variables,
            "getCallStack": self._handle_get_call_stack,
            "getActivities": self._handle_get_activities,
            "generateCode": self._handle_generate_code,
            "formatCode": self._handle_format_code,
            "validateCode": self._handle_validate_code,
            "shutdown": self._handle_shutdown,
            "inspectPage": self._handle_inspect_page,
            "highlightElement": self._handle_highlight_element,
            "testSelector": self._handle_test_selector,
            "getXPathFromPoint": self._handle_get_xpath_from_point,
            "capturePageScreenshot": self._handle_capture_screenshot,
            "inspectDesktop": self._handle_inspect_desktop,
            "listWindows": self._handle_list_windows,
            "testDesktopSelector": self._handle_test_desktop_selector,
            "highlightDesktopElement": self._handle_highlight_desktop_element,
            "captureWebElement": self._handle_capture_web_element,
            "captureDesktopElement": self._handle_capture_desktop_element,
            "getMousePosition": self._handle_get_mouse_position,
        }

    def _emit(self, event_dict: dict) -> None:
        if self._emit_event:
            self._emit_event(event_dict)

    def _setup_runner_callbacks(self) -> None:
        if not self._runner:
            return

        def on_pause(frame, node_id):
            if self._cancel_requested:
                return
            self._paused = True
            self._emit(
                ProcessPausedEvent(
                    file="",
                    line=frame.line if frame else 0,
                    node_id=node_id or "",
                    reason="breakpoint",
                ).to_dict()
            )

        def on_resume():
            if self._cancel_requested:
                return
            self._paused = False
            self._emit(ProcessResumedEvent().to_dict())

        self._runner.on_pause(on_pause)
        self._runner.on_resume(on_resume)

        def on_cancel():
            self._emit(
                {
                    "type": "log",
                    "level": "info",
                    "message": "Process cancellation requested",
                    "source": "engine",
                    "runId": self._current_run_id,
                }
            )

        self._runner.on_cancel(on_cancel)

    def _apply_pending_breakpoints(self) -> None:
        if not self._runner or not self._pending_breakpoints:
            return

        for bp_data in self._pending_breakpoints:
            with contextlib.suppress(Exception):
                self._runner.add_breakpoint(
                    node_id=bp_data.get("nodeId", ""),
                    line=bp_data.get("line", 0),
                    condition=bp_data.get("condition"),
                    hit_condition=bp_data.get("hitCondition"),
                )

        self._pending_breakpoints.clear()


__all__ = ["BridgeHandlers"]
