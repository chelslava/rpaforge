"""
RPAForge Core Protocol Abstractions.

Protocol-based interfaces for dependency injection and testability.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Any, Protocol, runtime_checkable

if TYPE_CHECKING:
    from rpaforge.core.execution import ExecutionContext, ExecutionResult, Process


@dataclass
class ExecutionEvent:
    """An event emitted during process execution."""

    event_type: str
    data: dict[str, Any] = field(default_factory=dict)


@runtime_checkable
class Executor(Protocol):
    """Abstracts ProcessExecutor for dependency injection."""

    def run(self, process: Process) -> ExecutionResult: ...

    def add_listener(self, callback: Callable[..., None]) -> None: ...

    def remove_listener(self, callback: Callable[..., None]) -> None: ...

    @property
    def context(self) -> ExecutionContext | None: ...

    def cancel(self) -> None: ...


@runtime_checkable
class LibraryProvider(Protocol):
    """Abstracts access to the library registry."""

    def get_library(self, name: str) -> type | None: ...

    def instantiate_library(self, cls: type) -> Any: ...


@runtime_checkable
class TimeoutHandler(Protocol):
    """Abstracts subprocess/threading timeout execution."""

    def execute_with_timeout(
        self,
        func: Callable[..., Any],
        args: tuple[Any, ...],
        timeout_ms: int,
    ) -> Any: ...


@runtime_checkable
class ExpressionEvaluator(Protocol):
    """Abstracts safe_eval for condition evaluation."""

    def evaluate(self, expression: str, variables: dict[str, Any]) -> Any: ...


@runtime_checkable
class EventEmitter(Protocol):
    """Abstracts event emission during execution."""

    def emit(self, event: ExecutionEvent) -> None: ...
