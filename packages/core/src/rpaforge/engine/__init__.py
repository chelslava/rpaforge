"""
RPAForge Engine Module.

Core execution engine with debugging, recording, and IPC capabilities.
"""

from rpaforge.core.execution import (
    ActivityCall,
    ActivityResult,
    ExecutionResult,
    ExecutionStatus,
    Process,
    ProcessBuilder,
    Task,
    TaskBuilder,
)
from rpaforge.core.runner import (
    Breakpoint,
    CallFrame,
    ProcessRunner,
    RunnerState,
    StudioEngine,
)

__all__ = [
    "StudioEngine",
    "ProcessRunner",
    "ProcessBuilder",
    "Process",
    "Task",
    "TaskBuilder",
    "ActivityCall",
    "ActivityResult",
    "ExecutionResult",
    "ExecutionStatus",
    "Breakpoint",
    "CallFrame",
    "RunnerState",
]
