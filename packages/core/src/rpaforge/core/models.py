"""
RPAForge debug model types.

Pure data classes shared between runner and checkpoint modules to avoid
cyclic imports.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass
class Breakpoint:
    """A breakpoint in execution."""

    id: str
    node_id: str
    line: int = 0
    enabled: bool = True
    condition: str | None = None
    hit_count: int = 0
    hit_condition: str | None = None


@dataclass
class CallFrame:
    """Call stack frame."""

    activity: str
    library: str
    line: int
    args: tuple[Any, ...]
    node_id: str = ""
