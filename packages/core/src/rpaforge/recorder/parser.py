"""
RPAForge Action Parser.

Converts recorded events into Robot Framework keywords.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING, Any

from rpaforge.recorder.capture import EventType, RecordedEvent

if TYPE_CHECKING:
    from rpaforge.recorder.capture import EventCapture


@dataclass
class ParsedAction:
    """A parsed action ready to be converted to a keyword."""

    keyword: str
    arguments: list[Any]
    source_event: RecordedEvent
    selector: str | None = None
    selector_type: str = "auto"  # 'auto', 'css', 'xpath', 'image', 'desktop'


class ActionParser:
    """Parses recorded events into Robot Framework keywords.

    This class analyzes the sequence of recorded events and
    converts them into meaningful automation actions.

    Example:
        >>> parser = ActionParser()
        >>> events = capture.stop()
        >>> actions = parser.parse(events)
        >>> for action in actions:
        ...     print(f"{action.keyword}  {' | '.join(map(str, action.arguments))}")
    """

    def __init__(self):
        self._typing_buffer: list[RecordedEvent] = []
        self._last_click: RecordedEvent | None = None

    def parse(self, events: list[RecordedEvent]) -> list[ParsedAction]:
        """Parse recorded events into actions.

        :param events: List of recorded events.
        :returns: List of parsed actions.
        """
        actions: list[ParsedAction] = []

        for event in events:
            action = self._parse_event(event, actions)
            if action:
                actions.append(action)

        if self._typing_buffer:
            action = self._flush_typing_buffer()
            if action:
                actions.append(action)

        return actions

    def _parse_event(
        self,
        event: RecordedEvent,
        previous_actions: list[ParsedAction],
    ) -> ParsedAction | None:
        """Parse a single event.

        :param event: The event to parse.
        :param previous_actions: Previously parsed actions.
        :returns: Parsed action or None.
        """
        if event.type == EventType.MOUSE_CLICK:
            return self._parse_click(event)

        elif event.type == EventType.MOUSE_DOUBLE_CLICK:
            return self._parse_double_click(event)

        elif event.type == EventType.KEY_TYPE:
            self._typing_buffer.append(event)
            return None

        elif event.type == EventType.KEY_PRESS:
            return self._parse_key_press(event)

        elif event.type == EventType.WINDOW_FOCUS:
            return self._parse_window_focus(event)

        return None

    def _parse_click(self, event: RecordedEvent) -> ParsedAction:
        """Parse a click event.

        :param event: The click event.
        :returns: Parsed action.
        """
        self._last_click = event
        selector = self._get_selector(event)

        return ParsedAction(
            keyword="Click Element",
            arguments=[selector] if selector else [],
            source_event=event,
            selector=selector,
            selector_type=self._get_selector_type(event),
        )

    def _parse_double_click(self, event: RecordedEvent) -> ParsedAction:
        """Parse a double-click event.

        :param event: The double-click event.
        :returns: Parsed action.
        """
        selector = self._get_selector(event)

        return ParsedAction(
            keyword="Double Click Element",
            arguments=[selector] if selector else [],
            source_event=event,
            selector=selector,
            selector_type=self._get_selector_type(event),
        )

    def _parse_key_press(self, event: RecordedEvent) -> ParsedAction:
        """Parse a key press event.

        :param event: The key press event.
        :returns: Parsed action.
        """
        key = event.key.upper()

        if event.modifiers:
            combo = "+".join(event.modifiers + [key])
            return ParsedAction(
                keyword="Press Keys",
                arguments=[combo],
                source_event=event,
            )

        return ParsedAction(
            keyword="Press Key",
            arguments=[key],
            source_event=event,
        )

    def _parse_window_focus(self, event: RecordedEvent) -> ParsedAction:
        """Parse a window focus event.

        :param event: The window focus event.
        :returns: Parsed action.
        """
        window_title = event.window.get("title", "")

        return ParsedAction(
            keyword="Switch Window",
            arguments=[window_title] if window_title else [],
            source_event=event,
        )

    def _flush_typing_buffer(self) -> ParsedAction | None:
        """Flush the typing buffer into a Type Text action.

        :returns: Parsed action or None.
        """
        if not self._typing_buffer:
            return None

        text = "".join(e.key for e in self._typing_buffer)
        last_event = self._typing_buffer[-1]
        selector = self._get_selector(last_event)

        self._typing_buffer.clear()

        return ParsedAction(
            keyword="Input Text",
            arguments=[selector, text] if selector else [text],
            source_event=last_event,
            selector=selector,
        )

    def _get_selector(self, event: RecordedEvent) -> str | None:
        """Extract a selector from an event.

        :param event: The event.
        :returns: Selector string or None.
        """
        element = event.element

        if not element:
            return None

        if "id" in element:
            return f"id:{element['id']}"
        elif "xpath" in element:
            return element["xpath"]
        elif "css" in element:
            return element["css"]
        elif "automation_id" in element:
            return f"automation:{element['automation_id']}"
        elif "name" in element:
            return f"name:{element['name']}"
        elif "class" in element:
            return f"class:{element['class']}"

        return None

    def _get_selector_type(self, event: RecordedEvent) -> str:
        """Determine the selector type for an event.

        :param event: The event.
        :returns: Selector type string.
        """
        element = event.element

        if not element:
            return "coordinates"

        if "automation_id" in element:
            return "desktop"
        elif "xpath" in element or "css" in element:
            return "web"
        elif "image" in element:
            return "image"

        return "auto"

    def to_robot_keywords(self, actions: list[ParsedAction]) -> list[str]:
        """Convert actions to Robot Framework keyword lines.

        :param actions: List of parsed actions.
        :returns: List of keyword lines.
        """
        lines = []

        for action in actions:
            args_str = "    ".join(str(a) for a in action.arguments)
            if args_str:
                lines.append(f"    {action.keyword}    {args_str}")
            else:
                lines.append(f"    {action.keyword}")

        return lines
