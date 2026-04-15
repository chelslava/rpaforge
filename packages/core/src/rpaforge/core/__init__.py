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
from rpaforge.core.executor import ErrorContext, ExecutionError, TimeoutError

__all__ = [
    "ActivityCall",
    "ActivityResult",
    "ErrorContext",
    "ExecutionError",
    "ExecutionResult",
    "ExecutionStatus",
    "Process",
    "ProcessBuilder",
    "Task",
    "TaskBuilder",
    "TimeoutError",
    "Variable",
]
