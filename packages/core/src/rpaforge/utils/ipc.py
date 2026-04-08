"""
RPAForge IPC Bridge.

Communication bridge between Python engine and Electron UI.
"""

from __future__ import annotations

import contextlib
import json
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import TYPE_CHECKING, Any
from uuid import uuid4

if TYPE_CHECKING:
    from collections.abc import Callable


class MessageType(Enum):
    """Type of IPC message."""

    REQUEST = "request"
    RESPONSE = "response"
    EVENT = "event"
    ERROR = "error"


@dataclass
class IPCMessage:
    """An IPC message between engine and UI."""

    type: MessageType
    method: str
    params: dict[str, Any] = field(default_factory=dict)
    id: str = field(default_factory=lambda: str(uuid4())[:8])
    timestamp: datetime = field(default_factory=datetime.now)
    error: str | None = None

    def to_json(self) -> str:
        """Serialize to JSON string."""
        return json.dumps(
            {
                "type": self.type.value,
                "method": self.method,
                "params": self.params,
                "id": self.id,
                "timestamp": self.timestamp.isoformat(),
                "error": self.error,
            }
        )

    @classmethod
    def from_json(cls, data: str) -> IPCMessage:
        """Deserialize from JSON string.

        :param data: JSON string.
        :returns: IPCMessage instance.
        """
        obj = json.loads(data)
        return cls(
            type=MessageType(obj["type"]),
            method=obj["method"],
            params=obj.get("params", {}),
            id=obj.get("id", str(uuid4())[:8]),
            timestamp=(
                datetime.fromisoformat(obj["timestamp"])
                if "timestamp" in obj
                else datetime.now()
            ),
            error=obj.get("error"),
        )


class IPCBridge:
    """Bridge for IPC communication between Python and Electron.

    This class provides a JSON-RPC-like interface for the UI
    to communicate with the Python engine.

    Example:
        >>> bridge = IPCBridge()
        >>> bridge.register_handler("runProcess", lambda p: engine.run(p))
        >>> bridge.register_handler("setBreakpoint", lambda p: debugger.add_breakpoint(**p))
        >>> # In Electron: bridge.send({"method": "runProcess", "params": {...}})
    """

    def __init__(self):
        self._handlers: dict[str, Callable[[dict], Any]] = {}
        self._event_listeners: dict[str, list[Callable[[dict], None]]] = {}
        self._pending_requests: dict[str, Any] = {}

    def register_handler(
        self,
        method: str,
        handler: Callable[[dict], Any],
    ) -> None:
        """Register a handler for a method.

        :param method: Method name.
        :param handler: Handler function that takes params dict.
        """
        self._handlers[method] = handler

    def unregister_handler(self, method: str) -> None:
        """Unregister a handler.

        :param method: Method name.
        """
        self._handlers.pop(method, None)

    def on_event(self, event: str, listener: Callable[[dict], None]) -> None:
        """Register a listener for an event.

        :param event: Event name.
        :param listener: Listener function.
        """
        if event not in self._event_listeners:
            self._event_listeners[event] = []
        self._event_listeners[event].append(listener)

    def off_event(self, event: str, listener: Callable[[dict], None]) -> None:
        """Remove an event listener.

        :param event: Event name.
        :param listener: Listener function.
        """
        if event in self._event_listeners:
            self._event_listeners[event] = [
                listener_fn
                for listener_fn in self._event_listeners[event]
                if listener_fn != listener
            ]

    def handle_message(self, message: IPCMessage) -> IPCMessage:
        """Handle an incoming message.

        :param message: The incoming message.
        :returns: Response message.
        """
        if message.type == MessageType.REQUEST:
            return self._handle_request(message)
        elif message.type == MessageType.EVENT:
            self._handle_event(message)
            return IPCMessage(
                type=MessageType.RESPONSE,
                method=message.method,
                id=message.id,
            )
        else:
            return IPCMessage(
                type=MessageType.ERROR,
                method=message.method,
                id=message.id,
                error=f"Unknown message type: {message.type}",
            )

    def _handle_request(self, message: IPCMessage) -> IPCMessage:
        """Handle a request message.

        :param message: The request message.
        :returns: Response message.
        """
        handler = self._handlers.get(message.method)

        if not handler:
            return IPCMessage(
                type=MessageType.ERROR,
                method=message.method,
                id=message.id,
                error=f"No handler for method: {message.method}",
            )

        try:
            result = handler(message.params)
            return IPCMessage(
                type=MessageType.RESPONSE,
                method=message.method,
                id=message.id,
                params={"result": result},
            )
        except Exception as e:
            return IPCMessage(
                type=MessageType.ERROR,
                method=message.method,
                id=message.id,
                error=str(e),
            )

    def _handle_event(self, message: IPCMessage) -> None:
        """Handle an event message.

        :param message: The event message.
        """
        listeners = self._event_listeners.get(message.method, [])
        for listener in listeners:
            with contextlib.suppress(Exception):
                listener(message.params)

    def emit_event(self, event: str, params: dict[str, Any]) -> None:
        """Emit an event to all listeners.

        :param event: Event name.
        :param params: Event parameters.
        """
        message = IPCMessage(
            type=MessageType.EVENT,
            method=event,
            params=params,
        )
        self._handle_event(message)

    def send_request(
        self,
        method: str,
        params: dict[str, Any],
    ) -> IPCMessage:
        """Create a request message.

        :param method: Method name.
        :param params: Request parameters.
        :returns: Request message ready to send.
        """
        return IPCMessage(
            type=MessageType.REQUEST,
            method=method,
            params=params,
        )
