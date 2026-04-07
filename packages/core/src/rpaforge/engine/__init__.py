"""
RPAForge Engine Module.

This module provides the core execution engine that wraps Robot Framework
with additional capabilities for debugging, recording, and IPC communication.
"""

from rpaforge.engine.executor import StudioEngine
from rpaforge.engine.context import StudioContext
from rpaforge.engine.suite_builder import ProcessBuilder
from rpaforge.engine.activity_registry import (
    discover_all_libraries,
    discover_library_keywords,
    register_library,
    get_registry_stats,
)

__all__ = [
    "StudioEngine",
    "StudioContext",
    "ProcessBuilder",
    "discover_all_libraries",
    "discover_library_keywords",
    "register_library",
    "get_registry_stats",
]
