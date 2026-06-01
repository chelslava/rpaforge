"""Debugger handlers: breakpoints, stepping, variables, call stack."""

from __future__ import annotations

import logging
from typing import Any

logger = logging.getLogger("rpaforge.bridge")


def setup_debugger_handlers(cls: type) -> None:
    """Add debugger methods to BridgeHandlers class."""

    def _handle_set_breakpoint(self, params: dict) -> dict[str, Any]:
        node_id = params.get("nodeId", "")
        line = params.get("line", 0)
        condition = params.get("condition")
        hit_condition = params.get("hitCondition")

        if not self._runner:
            bp_data = {
                "nodeId": node_id,
                "line": line,
                "condition": condition,
                "hitCondition": hit_condition,
            }
            self._pending_breakpoints.append(bp_data)

            return {
                "breakpointId": f"pending-{len(self._pending_breakpoints)}",
                "nodeId": node_id,
                "line": line,
                "enabled": True,
                "pending": True,
            }

        bp = self._runner.add_breakpoint(
            node_id=node_id,
            line=line,
            condition=condition,
            hit_condition=hit_condition,
        )

        return {
            "breakpointId": bp.id,
            "nodeId": bp.node_id,
            "line": bp.line,
            "enabled": bp.enabled,
        }

    def _handle_remove_breakpoint(self, params: dict) -> dict[str, Any]:
        bp_id = params.get("breakpointId", "")
        if self._runner:
            removed = self._runner.remove_breakpoint(bp_id)
            return {"removed": removed}
        return {"removed": False}

    def _handle_toggle_breakpoint(self, params: dict) -> dict[str, Any]:
        bp_id = params.get("breakpointId", "")
        if self._runner:
            enabled = self._runner.toggle_breakpoint(bp_id)
            return {"enabled": enabled}
        return {"enabled": None}

    def _handle_get_breakpoints(self, _params: dict) -> dict[str, Any]:
        if not self._runner:
            return {"breakpoints": []}

        breakpoints = [
            {
                "id": bp.id,
                "nodeId": bp.node_id,
                "line": bp.line,
                "enabled": bp.enabled,
                "condition": bp.condition,
                "hitCount": bp.hit_count,
            }
            for bp in self._runner.get_breakpoints()
        ]

        return {"breakpoints": breakpoints}

    def _handle_step_over(self, _params: dict) -> dict[str, Any]:
        if self._runner and self._runner.is_paused:
            self._runner.step_over()
            return {"status": "stepping"}
        return {"status": "not_paused"}

    def _handle_step_into(self, _params: dict) -> dict[str, Any]:
        if self._runner and self._runner.is_paused:
            self._runner.step_into()
            return {"status": "stepping"}
        return {"status": "not_paused"}

    def _handle_step_out(self, _params: dict) -> dict[str, Any]:
        if self._runner and self._runner.is_paused:
            self._runner.step_out()
            return {"status": "stepping"}
        return {"status": "not_paused"}

    def _handle_continue(self, _params: dict) -> dict[str, Any]:
        if self._runner and self._runner.is_paused:
            self._runner.resume()
            return {"status": "running"}
        return {"status": "not_paused"}

    def _handle_get_variables(self, _params: dict) -> dict[str, Any]:
        if self._runner:
            raw_vars = self._runner.get_variables()
            df_library = self._engine.executor._libraries.get("DataFrames")
            variables = []
            for name, value in raw_vars.items():
                if (
                    df_library is not None
                    and isinstance(value, str)
                    and value in getattr(df_library, "_frames", {})
                ):
                    frame = df_library._frames[value]
                    rows, cols = frame.shape
                    try:
                        preview = frame.head(20).to_dicts()
                    except Exception as e:
                        logger.debug(
                            f"Failed to generate dataframe preview for {value}: {e}"
                        )
                        preview = []
                    variables.append(
                        {
                            "name": name,
                            "value": {
                                "__type": "dataframe",
                                "frame_name": value,
                                "shape": {"rows": rows, "cols": cols},
                                "columns": frame.columns,
                                "preview": preview,
                            },
                            "type": "dataframe",
                        }
                    )
                else:
                    variables.append(
                        {
                            "name": name,
                            "value": value,
                            "type": type(value).__name__,
                        }
                    )
            return {"variables": variables}
        return {"variables": []}

    def _handle_get_call_stack(self, _params: dict) -> dict[str, Any]:
        if not self._runner:
            return {"callStack": []}

        stack = [
            {
                "activity": frame.activity,
                "library": frame.library,
                "line": frame.line,
                "nodeId": frame.node_id,
            }
            for frame in self._runner.get_call_stack()
        ]

        return {"callStack": stack}

    cls._handle_set_breakpoint = _handle_set_breakpoint
    cls._handle_remove_breakpoint = _handle_remove_breakpoint
    cls._handle_toggle_breakpoint = _handle_toggle_breakpoint
    cls._handle_get_breakpoints = _handle_get_breakpoints
    cls._handle_step_over = _handle_step_over
    cls._handle_step_into = _handle_step_into
    cls._handle_step_out = _handle_step_out
    cls._handle_continue = _handle_continue
    cls._handle_get_variables = _handle_get_variables
    cls._handle_get_call_stack = _handle_get_call_stack
