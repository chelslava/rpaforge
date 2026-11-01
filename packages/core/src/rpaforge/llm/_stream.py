"""Shared Server-Sent Events parsing for streaming LLM responses (issue #820).

Both adapters consume SSE bodies from their respective streaming endpoints
(``stream: true`` on the OpenAI-compatible ``chat/completions`` route and
on the Anthropic Messages API). This module turns a streaming ``httpx``
response into ``(event_name, data)`` tuples per the SSE wire format:
``event:``/``data:`` field lines, colon-prefixed comment lines, blank-line
event dispatch, and ``\\r\\n`` line endings.
"""

from __future__ import annotations

from collections.abc import Iterator
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    import httpx

__all__ = ["DONE_SENTINEL", "iter_sse_events"]

#: Literal data payload that terminates OpenAI-compatible SSE streams.
DONE_SENTINEL = "[DONE]"


def iter_sse_events(response: httpx.Response) -> Iterator[tuple[str | None, str]]:
    """Yield ``(event_name, data)`` pairs from an SSE response body.

    ``event_name`` is ``None`` when the server omits ``event:`` lines
    (OpenAI-compatible streams send ``data:`` only). Multi-line ``data:``
    fields are joined with ``\\n``; a final event without a trailing blank
    line is still dispatched when the body ends.
    """
    event_name: str | None = None
    data_lines: list[str] = []
    for line in response.iter_lines():
        if line.endswith("\r"):
            line = line[:-1]
        if not line:
            if data_lines:
                yield event_name, "\n".join(data_lines)
                event_name = None
                data_lines = []
            continue
        if line.startswith(":"):
            continue
        if line.startswith("event:"):
            event_name = line[len("event:") :].strip()
        elif line.startswith("data:"):
            payload = line[len("data:") :]
            data_lines.append(payload[1:] if payload.startswith(" ") else payload)
    if data_lines:
        yield event_name, "\n".join(data_lines)
