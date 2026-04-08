"""
RPAForge Debugger Module.

Provides debugging capabilities for Robot Framework execution:
- Breakpoints (line, conditional, hit count)
- Step execution (over, into, out)
- Variable watching
- Call stack inspection
"""

from rpaforge.debugger.breakpoints import Breakpoint, BreakpointManager
from rpaforge.debugger.debugger import Debugger, DebuggerState
from rpaforge.debugger.stepper import StepMode, Stepper
from rpaforge.debugger.watcher import VariableWatcher

__all__ = [
    "Debugger",
    "DebuggerState",
    "Breakpoint",
    "BreakpointManager",
    "Stepper",
    "StepMode",
    "VariableWatcher",
]
