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
from rpaforge.core.interfaces import (
    EventEmitter,
    ExecutionEvent,
    Executor,
    ExpressionEvaluator,
    LibraryProvider,
    TimeoutHandler,
)

__all__ = [
    "ActivityCall",
    "ActivityResult",
    "ErrorContext",
    "ExecutionError",
    "ExecutionResult",
    "ExecutionStatus",
    "EventEmitter",
    "ExecutionEvent",
    "Executor",
    "ExpressionEvaluator",
    "LibraryProvider",
    "Process",
    "ProcessBuilder",
    "Task",
    "TaskBuilder",
    "TimeoutError",
    "TimeoutHandler",
    "Variable",
]
