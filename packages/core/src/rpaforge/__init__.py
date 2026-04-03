"""
RPAForge Core - Open Source RPA Studio Engine.

This package provides the core engine for RPAForge, wrapping Robot Framework
with extended debugging, recording, and execution capabilities.
"""

from rpaforge.bridge import BridgeServer
from rpaforge.debugger import Breakpoint, Debugger, DebuggerState
from rpaforge.engine import StudioEngine
from rpaforge.version import VERSION

__version__ = VERSION
__all__ = [
    "StudioEngine",
    "Debugger",
    "Breakpoint",
    "DebuggerState",
    "BridgeServer",
    "__version__",
]
