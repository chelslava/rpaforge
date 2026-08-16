"""Structured NDJSON and telemetry logging for unattended robot runner."""

from __future__ import annotations

import json
import sys
import threading
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, TextIO


@dataclass(frozen=True)
class RunnerEvent:
    """A structured telemetry event generated during execution."""

    event: str
    timestamp: str = field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat()
    )
    data: dict[str, Any] = field(default_factory=dict)

    def to_json(self) -> str:
        """Convert event to a single JSON line."""
        payload = {"event": self.event, "timestamp": self.timestamp, **self.data}
        return json.dumps(payload, ensure_ascii=False)


class EventLogger:
    """Thread-safe event logger supporting plain text and NDJSON streaming."""

    def __init__(
        self,
        stream: TextIO | None = None,
        ndjson: bool = False,
        quiet: bool = False,
    ) -> None:
        self._stream = stream or sys.stdout
        self._ndjson = ndjson
        self._quiet = quiet
        self._lock = threading.Lock()

    @property
    def is_ndjson(self) -> bool:
        return self._ndjson

    def emit(self, event_name: str, **kwargs: Any) -> None:
        """Emit a structured event to the output stream."""
        if self._quiet and not self._ndjson:
            return

        event = RunnerEvent(event=event_name, data=kwargs)
        with self._lock:
            if self._ndjson:
                self._stream.write(event.to_json() + "\n")
                self._stream.flush()
            else:
                formatted = self._format_human(event_name, kwargs)
                if formatted:
                    self._stream.write(formatted + "\n")
                    self._stream.flush()

    def _format_human(self, event_name: str, data: dict[str, Any]) -> str:
        """Format an event for human-readable terminal output."""
        time_str = datetime.now().strftime("%H:%M:%S")
        if event_name == "process_started":
            return f"[{time_str}] [INFO] Starting process '{data.get('process')}' (Run ID: {data.get('run_id')})"
        if event_name == "process_finished":
            status = str(data.get("status", "")).upper()
            duration = data.get("duration_ms", 0)
            return f"[{time_str}] [{status}] Process completed in {duration}ms (Status: {status})"
        if event_name == "activity_started":
            act = data.get("activity", "")
            lib = data.get("library", "")
            target = f"{lib}.{act}" if lib else act
            return f"[{time_str}] [STEP] -> Executing: {target} (node: {data.get('node_id')})"
        if event_name == "activity_finished":
            act = data.get("activity", "")
            lib = data.get("library", "")
            target = f"{lib}.{act}" if lib else act
            status = str(data.get("status", "")).upper()
            dur = data.get("duration_ms", 0)
            msg = f"[{time_str}] [{status}] <- Finished: {target} ({dur}ms)"
            if data.get("error"):
                msg += f" - Error: {data.get('error')}"
            return msg
        if event_name == "resource_warning":
            return f"[{time_str}] [WARN] Resource alert: {data.get('message')}"
        if event_name == "daemon_started":
            return f"[{time_str}] [INFO] Worker daemon started on queue '{data.get('queue')}' (Concurrency: {data.get('concurrency')})"
        if event_name == "daemon_stopped":
            return f"[{time_str}] [INFO] Worker daemon stopped. Processed {data.get('processed_count', 0)} tasks."
        if event_name == "log_message":
            level = str(data.get("level", "INFO")).upper()
            return f"[{time_str}] [{level}] {data.get('message')}"
        return f"[{time_str}] [{event_name}] {json.dumps(data, ensure_ascii=False)}"
