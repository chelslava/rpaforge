"""
RPAForge Core - Open Source RPA Studio Engine.

This package provides the core engine for RPAForge, wrapping Robot Framework
with extended debugging, recording, and execution capabilities.
"""

from rpaforge.activities import register_builtin_activities
from rpaforge.bridge import BridgeServer
from rpaforge.codegen import CodeGenerator
from rpaforge.debugger import Breakpoint, Debugger, DebuggerState
from rpaforge.engine import StudioEngine
from rpaforge.version import VERSION

register_builtin_activities()

__version__ = VERSION
__all__ = [
    "StudioEngine",
    "Debugger",
    "Breakpoint",
    "DebuggerState",
    "BridgeServer",
    "CodeGenerator",
    "register_builtin_activities",
    "__version__",
]
