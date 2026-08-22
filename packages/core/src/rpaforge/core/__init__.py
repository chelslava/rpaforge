"""
RPAForge Core Execution Model.

Native Python execution model without Robot Framework dependencies.
"""

from rpaforge.core.agentic import (
    EVENT_AGENTIC_ABORT,
    EVENT_AGENTIC_ITERATION,
    AgenticLoopGroup,
)
from rpaforge.core.audit import (
    REDACT_PATTERNS,
    RunRecord,
    StepRecord,
    redact_value,
    should_redact,
)
from rpaforge.core.execution import (
    EVENT_LLM_DECISION_FALLBACK,
    ActivityCall,
    ActivityResult,
    ExecutionResult,
    ExecutionStatus,
    LLMDecisionGroup,
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
    "EVENT_AGENTIC_ABORT",
    "EVENT_AGENTIC_ITERATION",
    "AgenticLoopGroup",
    "ActivityCall",
    "ActivityResult",
    "EVENT_LLM_DECISION_FALLBACK",
    "ErrorContext",
    "ExecutionError",
    "ExecutionResult",
    "ExecutionStatus",
    "EventEmitter",
    "ExecutionEvent",
    "Executor",
    "ExpressionEvaluator",
    "LLMDecisionGroup",
    "LibraryProvider",
    "Process",
    "ProcessBuilder",
    "REDACT_PATTERNS",
    "RunRecord",
    "StepRecord",
    "Task",
    "TaskBuilder",
    "TimeoutError",
    "TimeoutHandler",
    "Variable",
    "redact_value",
    "should_redact",
]
