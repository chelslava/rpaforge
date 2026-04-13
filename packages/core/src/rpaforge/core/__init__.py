"""
RPAForge Core Execution Model.

Native Python execution model without Robot Framework dependencies.
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
    Variable,
)

__all__ = [
    "ActivityCall",
    "ActivityResult",
    "ExecutionResult",
    "ExecutionStatus",
    "Process",
    "ProcessBuilder",
    "Task",
    "TaskBuilder",
    "Variable",
]
