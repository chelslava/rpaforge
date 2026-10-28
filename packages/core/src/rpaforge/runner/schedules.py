"""Time-based scheduling for the runner daemon (issue #818).

A schedules file (JSON) maps cron expressions to diagram runs:

```json
[
  {
    "name": "invoices-morning",
    "cron": "30 9 * * 1-5",
    "diagram_path": "processes/invoices.process",
    "variables": {"env": "prod"},
    "priority": "High",
    "reference": "morning-batch",
    "missed_run_policy": "catch_up"
  }
]
```

The :class:`ScheduleManager` evaluates every schedule once per daemon tick:
a schedule is *due* when a cron occurrence exists in the window since its
record start. The window start is the last enqueued instant recorded in the
:class:`ScheduleState` file, or — for schedules that never ran — the moment
the manager was created, so a freshly started daemon waits for the next slot
instead of replaying history. The last-enqueued instant is persisted on every
firing, so restarts neither double-fire nor lose the catch-up position.

Missed-run policy — what happens to occurrences missed while the daemon was
down or between ticks:

- ``skip`` *(default)*: enqueue only the latest due occurrence, once.
- ``catch_up``: enqueue every missed occurrence since the last enqueued one.
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from rpaforge.queues.models import QueueItem
from rpaforge.queues.sqlite_store import SQLiteQueueStore
from rpaforge.runner.cron import CronParseError, CronSchedule, parse_cron

logger = logging.getLogger("rpaforge.runner.schedules")

_MISSED_RUN_POLICIES = ("skip", "catch_up")

#: Safety bound for catch-up replays (protects against pathological crons).
_MAX_CATCH_UP_OCCURRENCES = 10000


class ScheduleConfigError(ValueError):
    """Raised for malformed schedules configuration files."""


@dataclass(frozen=True)
class ScheduleSpec:
    """One validated entry of the schedules file."""

    name: str
    cron: CronSchedule
    diagram_path: str
    variables: dict[str, Any] = field(default_factory=dict)
    reference: str | None = None
    priority: str = "Normal"
    missed_run_policy: str = "skip"


class ScheduleState:
    """Persisted ``{schedule_name: last_enqueued_iso}`` map."""

    def __init__(self, path: Path | str | None = None) -> None:
        self.path = Path(path) if path is not None else None
        self._last_enqueued: dict[str, str] = {}
        if self.path is not None and self.path.exists():
            try:
                self._last_enqueued = {
                    str(k): str(v)
                    for k, v in json.loads(
                        self.path.read_text(encoding="utf-8")
                    ).items()
                }
            except (json.JSONDecodeError, OSError) as exc:
                logger.warning(
                    "Ignoring unreadable schedule state %s: %s", self.path, exc
                )
                self._last_enqueued = {}

    def get(self, name: str) -> str | None:
        """Last enqueued instant (ISO string) for ``name``, or None."""
        return self._last_enqueued.get(name)

    def set(self, name: str, iso_instant: str) -> None:
        self._last_enqueued[name] = iso_instant

    def save(self) -> None:
        """Persist the state (write temp file, then atomically replace)."""
        if self.path is None:
            return
        self.path.parent.mkdir(parents=True, exist_ok=True)
        tmp = self.path.with_suffix(self.path.suffix + ".tmp")
        tmp.write_text(
            json.dumps(self._last_enqueued, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        tmp.replace(self.path)


def load_schedules(path: Path | str) -> list[ScheduleSpec]:
    """Load and validate a schedules JSON file."""
    raw = Path(path).read_text(encoding="utf-8")
    try:
        entries = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise ScheduleConfigError(f"invalid schedules JSON: {exc}") from exc
    if not isinstance(entries, list):
        raise ScheduleConfigError("schedules file must contain a JSON array")

    specs: list[ScheduleSpec] = []
    seen_names: set[str] = set()
    for index, entry in enumerate(entries):
        if not isinstance(entry, dict):
            raise ScheduleConfigError(f"schedule #{index} must be an object")
        name = str(entry.get("name", "")).strip()
        if not name:
            raise ScheduleConfigError(f"schedule #{index} is missing 'name'")
        if name in seen_names:
            raise ScheduleConfigError(f"duplicate schedule name: {name!r}")
        seen_names.add(name)

        expression = str(entry.get("cron", "")).strip()
        if not expression:
            raise ScheduleConfigError(f"schedule {name!r} is missing 'cron'")
        try:
            cron = parse_cron(expression)
        except CronParseError as exc:
            raise ScheduleConfigError(f"schedule {name!r}: {exc}") from exc

        diagram_path = str(entry.get("diagram_path", "")).strip()
        if not diagram_path:
            raise ScheduleConfigError(f"schedule {name!r} is missing 'diagram_path'")

        variables = entry.get("variables", {})
        if not isinstance(variables, dict):
            raise ScheduleConfigError(
                f"schedule {name!r}: 'variables' must be an object"
            )

        policy = str(entry.get("missed_run_policy", "skip")).strip().lower()
        if policy not in _MISSED_RUN_POLICIES:
            raise ScheduleConfigError(
                f"schedule {name!r}: 'missed_run_policy' must be one of "
                f"{list(_MISSED_RUN_POLICIES)}"
            )

        reference = entry.get("reference")
        priority = str(entry.get("priority", "Normal"))

        specs.append(
            ScheduleSpec(
                name=name,
                cron=cron,
                diagram_path=diagram_path,
                variables=dict(variables),
                reference=str(reference) if reference is not None else None,
                priority=priority,
                missed_run_policy=policy,
            )
        )
    return specs


class ScheduleManager:
    """Evaluates schedules per tick and enqueues due runs into a work queue."""

    def __init__(
        self,
        specs: list[ScheduleSpec],
        state: ScheduleState,
        store: SQLiteQueueStore,
        queue_name: str,
        anchor: datetime | None = None,
    ) -> None:
        """``anchor`` is the record start for never-run schedules; it defaults
        to *now*, meaning a fresh daemon fires from the next cron slot on."""
        self.specs = specs
        self.state = state
        self.store = store
        self.queue_name = queue_name
        self.anchor = anchor if anchor is not None else datetime.now(timezone.utc)

    def tick(self, now: datetime) -> list[QueueItem]:
        """Enqueue all due schedules for ``now``; persists state. Returns items.

        ``now`` must be timezone-aware.
        """
        enqueued: list[QueueItem] = []
        dirty = False
        for spec in self.specs:
            occurrences = self._occurrences_between(spec, now)
            if not occurrences:
                continue
            if spec.missed_run_policy == "skip" and len(occurrences) > 1:
                occurrences = [occurrences[-1]]

            for _occurrence in occurrences:
                item = self.store.add_item(
                    self.queue_name,
                    payload={
                        "diagram_path": spec.diagram_path,
                        "variables": dict(spec.variables),
                    },
                    reference=spec.reference,
                    priority=spec.priority,
                )
                enqueued.append(item)
                logger.info(
                    "schedule %s: enqueued item=%s (occurrence %s)",
                    spec.name,
                    item.id,
                    _occurrence.isoformat(),
                )

            self.state.set(spec.name, now.isoformat())
            dirty = True
        if dirty:
            self.state.save()
        return enqueued

    def _occurrences_between(self, spec: ScheduleSpec, now: datetime) -> list[datetime]:
        """Cron occurrences in ``(window_start, now]`` for one spec."""
        last_raw = self.state.get(spec.name)
        window_start = self.anchor
        if last_raw is not None:
            try:
                window_start = datetime.fromisoformat(last_raw)
            except ValueError:
                logger.warning(
                    "schedule %s: unreadable last-run %r; falling back to anchor",
                    spec.name,
                    last_raw,
                )
        if window_start.tzinfo is None:
            window_start = window_start.replace(tzinfo=now.tzinfo)

        occurrences: list[datetime] = []
        cursor: datetime = window_start
        for _ in range(_MAX_CATCH_UP_OCCURRENCES):
            occurrence = spec.cron.next_after(cursor)
            if occurrence > now:
                break
            occurrences.append(occurrence)
            cursor = occurrence
        return occurrences
