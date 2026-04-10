"""
RPAForge Bridge Events.

Event types for IPC communication between Python engine and UI.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Any


class EventType(str, Enum):
    """Types of events that can be emitted."""

    LOG = "log"
    BREAKPOINT_HIT = "breakpointHit"
    PROCESS_STARTED = "processStarted"
    PROCESS_FINISHED = "processFinished"
    PROCESS_PAUSED = "processPaused"
    PROCESS_RESUMED = "processResumed"
    VARIABLES_CHANGED = "variablesChanged"
    CALL_STACK_CHANGED = "callStackChanged"
    KEYWORD_STARTED = "keywordStarted"
    KEYWORD_FINISHED = "keywordFinished"
    ERROR = "error"


@dataclass
class BridgeEvent:
    """Base class for bridge events."""

    timestamp: datetime = field(default_factory=datetime.now)

    def to_dict(self) -> dict[str, Any]:
        return {"type": self.event_type(), "timestamp": self.timestamp.isoformat()}

    @classmethod
    def event_type(cls) -> str:
        """Return the event type string."""
        return "event"


@dataclass
class LogEvent(BridgeEvent):
    """Event for log messages."""

    level: str = "info"
    message: str = ""
    source: str | None = None

    @classmethod
    def event_type(cls) -> str:
        return EventType.LOG.value

    def to_dict(self) -> dict[str, Any]:
        result = super().to_dict()
        result.update(
            {
                "level": self.level,
                "message": self.message,
            }
        )
        if self.source:
            result["source"] = self.source
        return result


@dataclass
class BreakpointHitEvent(BridgeEvent):
    """Event when a breakpoint is hit."""

    breakpoint_id: str = ""
    file: str = ""
    line: int = 0
    condition: str | None = None

    @classmethod
    def event_type(cls) -> str:
        return EventType.BREAKPOINT_HIT.value

    def to_dict(self) -> dict[str, Any]:
        result = super().to_dict()
        result.update(
            {
                "breakpointId": self.breakpoint_id,
                "file": self.file,
                "line": self.line,
            }
        )
        if self.condition:
            result["condition"] = self.condition
        return result


@dataclass
class ProcessStartedEvent(BridgeEvent):
    """Event when a process starts."""

    process_id: str = ""
    name: str = ""

    @classmethod
    def event_type(cls) -> str:
        return EventType.PROCESS_STARTED.value

    def to_dict(self) -> dict[str, Any]:
        result = super().to_dict()
        result.update(
            {
                "processId": self.process_id,
                "name": self.name,
            }
        )
        return result


@dataclass
class ProcessFinishedEvent(BridgeEvent):
    """Event when a process finishes."""

    status: str = "pass"
    duration: float = 0.0
    message: str | None = None

    @classmethod
    def event_type(cls) -> str:
        return EventType.PROCESS_FINISHED.value

    def to_dict(self) -> dict[str, Any]:
        result = super().to_dict()
        result.update(
            {
                "status": self.status,
                "duration": self.duration,
            }
        )
        if self.message:
            result["message"] = self.message
        return result


@dataclass
class VariablesChangedEvent(BridgeEvent):
    """Event when variables change."""

    variables: list[dict[str, Any]] = field(default_factory=list)

    @classmethod
    def event_type(cls) -> str:
        return EventType.VARIABLES_CHANGED.value

    def to_dict(self) -> dict[str, Any]:
        result = super().to_dict()
        result["variables"] = self.variables
        return result


@dataclass
class CallStackChangedEvent(BridgeEvent):
    """Event when call stack changes."""

    call_stack: list[dict[str, Any]] = field(default_factory=list)

    @classmethod
    def event_type(cls) -> str:
        return EventType.CALL_STACK_CHANGED.value

    def to_dict(self) -> dict[str, Any]:
        result = super().to_dict()
        result["callStack"] = self.call_stack
        return result


@dataclass
class KeywordStartedEvent(BridgeEvent):
    """Event when a keyword starts."""

    name: str = ""
    file: str = ""
    line: int = 0
    args: list[Any] = field(default_factory=list)

    @classmethod
    def event_type(cls) -> str:
        return EventType.KEYWORD_STARTED.value

    def to_dict(self) -> dict[str, Any]:
        result = super().to_dict()
        result.update(
            {
                "name": self.name,
                "file": self.file,
                "line": self.line,
                "args": self.args,
            }
        )
        return result


@dataclass
class KeywordFinishedEvent(BridgeEvent):
    """Event when a keyword finishes."""

    name: str = ""
    status: str = "pass"
    result: Any | None = None

    @classmethod
    def event_type(cls) -> str:
        return EventType.KEYWORD_FINISHED.value

    def to_dict(self) -> dict[str, Any]:
        result = super().to_dict()
        result.update(
            {
                "name": self.name,
                "status": self.status,
            }
        )
        if self.result is not None:
            result["result"] = self.result
        return result


@dataclass
class ErrorEvent(BridgeEvent):
    """Event for errors."""

    code: int = 0
    message: str = ""
    details: str | None = None

    @classmethod
    def event_type(cls) -> str:
        return EventType.ERROR.value

    def to_dict(self) -> dict[str, Any]:
        result = super().to_dict()
        result.update(
            {
                "code": self.code,
                "message": self.message,
            }
        )
        if self.details:
            result["details"] = self.details
        return result


@dataclass
class ProcessPausedEvent(BridgeEvent):
    """Event when a process pauses at breakpoint or step."""

    file: str | None = None
    line: int | None = None
    node_id: str | None = None
    reason: str = "breakpoint"

    @classmethod
    def event_type(cls) -> str:
        return EventType.PROCESS_PAUSED.value

    def to_dict(self) -> dict[str, Any]:
        result = super().to_dict()
        result["reason"] = self.reason
        if self.file is not None:
            result["file"] = self.file
        if self.line is not None:
            result["line"] = self.line
        if self.node_id is not None:
            result["nodeId"] = self.node_id
        return result


@dataclass
class ProcessResumedEvent(BridgeEvent):
    """Event when a process resumes from pause."""

    @classmethod
    def event_type(cls) -> str:
        return EventType.PROCESS_RESUMED.value

    def to_dict(self) -> dict[str, Any]:
        return super().to_dict()
