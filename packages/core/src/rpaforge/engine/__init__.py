"""
RPAForge Engine Module.

This module provides the core execution engine that wraps Robot Framework
with additional capabilities for debugging, recording, and IPC communication.
"""

from rpaforge.engine.executor import StudioEngine
from rpaforge.engine.context import StudioContext
from rpaforge.engine.suite_builder import ProcessBuilder

__all__ = [
    "StudioEngine",
    "StudioContext",
    "ProcessBuilder",
]
