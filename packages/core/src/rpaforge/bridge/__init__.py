"""
RPAForge Bridge Module.

IPC communication between Electron UI and Python Engine.
"""

from __future__ import annotations

from rpaforge.bridge.events import (
    BreakpointHitEvent,
    BridgeEvent,
    CallStackChangedEvent,
    ErrorEvent,
    EventType,
    KeywordFinishedEvent,
    KeywordStartedEvent,
    LogEvent,
    ProcessFinishedEvent,
    ProcessStartedEvent,
    VariablesChangedEvent,
)
from rpaforge.bridge.handlers import BridgeHandlers
from rpaforge.bridge.protocol import (
    JSONRPCError,
    JSONRPCErrorCode,
    JSONRPCNotification,
    JSONRPCRequest,
    JSONRPCResponse,
    parse_message,
)
from rpaforge.bridge.server import BridgeServer

__all__ = [
    "BridgeServer",
    "BridgeHandlers",
    "BridgeEvent",
    "EventType",
    "LogEvent",
    "BreakpointHitEvent",
    "ProcessStartedEvent",
    "ProcessFinishedEvent",
    "VariablesChangedEvent",
    "CallStackChangedEvent",
    "KeywordStartedEvent",
    "KeywordFinishedEvent",
    "ErrorEvent",
    "JSONRPCRequest",
    "JSONRPCResponse",
    "JSONRPCNotification",
    "JSONRPCError",
    "JSONRPCErrorCode",
    "parse_message",
]
