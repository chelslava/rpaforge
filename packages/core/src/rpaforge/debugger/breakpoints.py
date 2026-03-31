"""
RPAForge Breakpoint System.

Implementation of breakpoints for Robot Framework execution.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import TYPE_CHECKING
from uuid import uuid4

if TYPE_CHECKING:
    from pathlib import Path


class BreakpointType(Enum):
    """Type of breakpoint."""

    LINE = "line"
    CONDITIONAL = "conditional"
    HIT_COUNT = "hit_count"


@dataclass
class Breakpoint:
    """Represents a breakpoint in the debugger.

    Breakpoints can be:
    - Simple line breakpoints (stop when reaching a line)
    - Conditional breakpoints (stop when condition is true)
    - Hit count breakpoints (stop after N passes)
    """

    file: str
    line: int
    id: str = field(default_factory=lambda: str(uuid4())[:8])
    enabled: bool = True
    condition: str | None = None
    hit_count: int = 0
    hit_condition: str | None = None  # e.g., ">5", "==10", "%2"

    @property
    def type(self) -> BreakpointType:
        """Determine the breakpoint type."""
        if self.condition:
            return BreakpointType.CONDITIONAL
        if self.hit_condition:
            return BreakpointType.HIT_COUNT
        return BreakpointType.LINE

    def should_stop(self, context: dict) -> bool:
        """Check if execution should stop at this breakpoint.

        :param context: Execution context with variables.
        :returns: True if execution should stop.
        """
        if not self.enabled:
            return False

        self.hit_count += 1

        if self.type == BreakpointType.CONDITIONAL:
            return self._evaluate_condition(context)
        elif self.type == BreakpointType.HIT_COUNT:
            return self._evaluate_hit_condition()
        return True

    def _evaluate_condition(self, context: dict) -> bool:
        """Evaluate the breakpoint condition.

        :param context: Execution context with variables.
        :returns: True if condition is satisfied.
        """
        try:
            result = eval(self.condition, {"__builtins__": {}}, context)
            return bool(result)
        except Exception:
            return False

    def _evaluate_hit_condition(self) -> bool:
        """Evaluate the hit count condition.

        :returns: True if hit condition is satisfied.
        """
        if not self.hit_condition:
            return False

        try:
            if self.hit_condition.startswith(">"):
                return self.hit_count > int(self.hit_condition[1:])
            elif self.hit_condition.startswith(">="):
                return self.hit_count >= int(self.hit_condition[2:])
            elif self.hit_condition.startswith("=="):
                return self.hit_count == int(self.hit_condition[2:])
            elif self.hit_condition.startswith("%"):
                return self.hit_count % int(self.hit_condition[1:]) == 0
            else:
                return self.hit_count == int(self.hit_condition)
        except (ValueError, IndexError):
            return False

    def reset(self) -> None:
        """Reset the hit count."""
        self.hit_count = 0


class BreakpointManager:
    """Manages all breakpoints in the debugger."""

    def __init__(self):
        self._breakpoints: dict[str, Breakpoint] = {}
        self._file_breakpoints: dict[str, list[Breakpoint]] = {}

    def add(
        self,
        file: str,
        line: int,
        condition: str | None = None,
        hit_condition: str | None = None,
    ) -> Breakpoint:
        """Add a new breakpoint.

        :param file: File path.
        :param line: Line number.
        :param condition: Optional condition expression.
        :param hit_condition: Optional hit count condition.
        :returns: The created breakpoint.
        """
        bp = Breakpoint(
            file=file,
            line=line,
            condition=condition,
            hit_condition=hit_condition,
        )
        self._breakpoints[bp.id] = bp

        if file not in self._file_breakpoints:
            self._file_breakpoints[file] = []
        self._file_breakpoints[file].append(bp)

        return bp

    def remove(self, breakpoint_id: str) -> bool:
        """Remove a breakpoint by ID.

        :param breakpoint_id: ID of the breakpoint to remove.
        :returns: True if breakpoint was removed.
        """
        if breakpoint_id not in self._breakpoints:
            return False

        bp = self._breakpoints.pop(breakpoint_id)
        if bp.file in self._file_breakpoints:
            self._file_breakpoints[bp.file] = [
                b for b in self._file_breakpoints[bp.file] if b.id != breakpoint_id
            ]
        return True

    def get(self, breakpoint_id: str) -> Breakpoint | None:
        """Get a breakpoint by ID.

        :param breakpoint_id: ID of the breakpoint.
        :returns: The breakpoint or None.
        """
        return self._breakpoints.get(breakpoint_id)

    def get_for_file(self, file: str) -> list[Breakpoint]:
        """Get all breakpoints for a file.

        :param file: File path.
        :returns: List of breakpoints.
        """
        return self._file_breakpoints.get(file, [])

    def get_at(self, file: str, line: int) -> Breakpoint | None:
        """Get breakpoint at specific file and line.

        :param file: File path.
        :param line: Line number.
        :returns: The breakpoint or None.
        """
        for bp in self.get_for_file(file):
            if bp.line == line:
                return bp
        return None

    def toggle(self, breakpoint_id: str) -> bool:
        """Toggle a breakpoint's enabled state.

        :param breakpoint_id: ID of the breakpoint.
        :returns: New enabled state.
        """
        bp = self.get(breakpoint_id)
        if bp:
            bp.enabled = not bp.enabled
            return bp.enabled
        return False

    def clear(self, file: str | None = None) -> int:
        """Clear breakpoints.

        :param file: Optional file to clear breakpoints for.
        :returns: Number of breakpoints cleared.
        """
        if file:
            count = len(self._file_breakpoints.get(file, []))
            for bp in self._file_breakpoints.get(file, []):
                self._breakpoints.pop(bp.id, None)
            self._file_breakpoints.pop(file, None)
            return count

        count = len(self._breakpoints)
        self._breakpoints.clear()
        self._file_breakpoints.clear()
        return count

    def all(self) -> list[Breakpoint]:
        """Get all breakpoints.

        :returns: List of all breakpoints.
        """
        return list(self._breakpoints.values())

    def check(
        self,
        file: str,
        line: int,
        context: dict,
    ) -> Breakpoint | None:
        """Check if execution should stop at file:line.

        :param file: Current file.
        :param line: Current line.
        :param context: Execution context with variables.
        :returns: Breakpoint to stop at, or None.
        """
        for bp in self.get_for_file(file):
            if bp.line == line and bp.should_stop(context):
                return bp
        return None
