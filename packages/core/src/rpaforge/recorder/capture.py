"""
RPAForge Event Capture.

Captures user input events for recording automation.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Any, TYPE_CHECKING
from uuid import uuid4

if TYPE_CHECKING:
    from collections.abc import Callable


class EventType(Enum):
    """Type of recorded event."""

    MOUSE_CLICK = "mouse_click"
    MOUSE_DOUBLE_CLICK = "mouse_double_click"
    MOUSE_MOVE = "mouse_move"
    MOUSE_SCROLL = "mouse_scroll"
    KEY_PRESS = "key_press"
    KEY_TYPE = "key_type"
    WINDOW_FOCUS = "window_focus"
    ELEMENT_HOVER = "element_hover"


@dataclass
class RecordedEvent:
    """A single recorded user event."""

    type: EventType
    timestamp: datetime
    x: int = 0
    y: int = 0
    key: str = ""
    element: dict[str, Any] = field(default_factory=dict)
    window: dict[str, Any] = field(default_factory=dict)
    modifiers: list[str] = field(default_factory=list)
    duration_ms: int = 0
    id: str = field(default_factory=lambda: str(uuid4())[:8])


class EventCapture:
    """Captures user input events for recording.

    This class provides the infrastructure for capturing
    user actions (clicks, typing, etc.) during recording.

    Example:
        >>> capture = EventCapture()
        >>> capture.start()
        >>> # User performs actions...
        >>> events = capture.stop()
        >>> for event in events:
        ...     print(f"{event.type}: {event.element}")
    """

    def __init__(self):
        self._events: list[RecordedEvent] = []
        self._is_recording = False
        self._start_time: datetime | None = None
        self._on_event: Callable[[RecordedEvent], None] | None = None
        self._backend: str = "desktop"  # 'desktop' or 'web'

    @property
    def is_recording(self) -> bool:
        """Check if recording is active."""
        return self._is_recording

    @property
    def event_count(self) -> int:
        """Get the number of recorded events."""
        return len(self._events)

    def set_backend(self, backend: str) -> None:
        """Set the recording backend.

        :param backend: 'desktop' or 'web'.
        """
        self._backend = backend

    def on_event(self, callback: Callable[[RecordedEvent], None]) -> None:
        """Set callback for when an event is recorded.

        :param callback: Function to call with each event.
        """
        self._on_event = callback

    def start(self) -> None:
        """Start recording events."""
        self._events.clear()
        self._is_recording = True
        self._start_time = datetime.now()

    def stop(self) -> list[RecordedEvent]:
        """Stop recording and return events.

        :returns: List of recorded events.
        """
        self._is_recording = False
        return self._events.copy()

    def pause(self) -> None:
        """Pause recording (events are not recorded)."""
        self._is_recording = False

    def resume(self) -> None:
        """Resume recording."""
        self._is_recording = True

    def record(self, event: RecordedEvent) -> None:
        """Record an event manually.

        :param event: The event to record.
        """
        if self._is_recording:
            self._events.append(event)
            if self._on_event:
                self._on_event(event)

    def record_click(
        self,
        x: int,
        y: int,
        element: dict[str, Any] | None = None,
        window: dict[str, Any] | None = None,
        double: bool = False,
    ) -> None:
        """Record a mouse click event.

        :param x: X coordinate.
        :param y: Y coordinate.
        :param element: Element information.
        :param window: Window information.
        :param double: Whether it's a double-click.
        """
        event = RecordedEvent(
            type=EventType.MOUSE_DOUBLE_CLICK if double else EventType.MOUSE_CLICK,
            timestamp=datetime.now(),
            x=x,
            y=y,
            element=element or {},
            window=window or {},
        )
        self.record(event)

    def record_type(
        self,
        text: str,
        element: dict[str, Any] | None = None,
        window: dict[str, Any] | None = None,
    ) -> None:
        """Record a typing event.

        :param text: Text typed.
        :param element: Element information.
        :param window: Window information.
        """
        event = RecordedEvent(
            type=EventType.KEY_TYPE,
            timestamp=datetime.now(),
            key=text,
            element=element or {},
            window=window or {},
        )
        self.record(event)

    def record_key(
        self,
        key: str,
        modifiers: list[str] | None = None,
        element: dict[str, Any] | None = None,
    ) -> None:
        """Record a key press event.

        :param key: Key pressed.
        :param modifiers: Modifier keys (ctrl, shift, alt).
        :param element: Element information.
        """
        event = RecordedEvent(
            type=EventType.KEY_PRESS,
            timestamp=datetime.now(),
            key=key,
            element=element or {},
            modifiers=modifiers or [],
        )
        self.record(event)

    def clear(self) -> None:
        """Clear all recorded events."""
        self._events.clear()

    def get_events(
        self,
        event_type: EventType | None = None,
    ) -> list[RecordedEvent]:
        """Get recorded events, optionally filtered by type.

        :param event_type: Optional event type filter.
        :returns: List of events.
        """
        if event_type:
            return [e for e in self._events if e.type == event_type]
        return self._events.copy()
