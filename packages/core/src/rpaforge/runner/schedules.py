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


def _parse_schedule_entry(entry: Any, label: str) -> ScheduleSpec:
    """Validate one raw schedule entry; ``label`` names it in error messages."""
    if not isinstance(entry, dict):
        raise ScheduleConfigError(f"schedule {label} must be an object")
    name = str(entry.get("name", "")).strip()
    if not name:
        raise ScheduleConfigError(f"schedule {label} is missing 'name'")
    label = repr(name)

    expression = str(entry.get("cron", "")).strip()
    if not expression:
        raise ScheduleConfigError(f"schedule {label} is missing 'cron'")
    try:
        cron = parse_cron(expression)
    except CronParseError as exc:
        raise ScheduleConfigError(f"schedule {label}: {exc}") from exc

    diagram_path = str(entry.get("diagram_path", "")).strip()
    if not diagram_path:
        raise ScheduleConfigError(f"schedule {label} is missing 'diagram_path'")

    variables = entry.get("variables", {})
    if not isinstance(variables, dict):
        raise ScheduleConfigError(f"schedule {label}: 'variables' must be an object")

    policy = str(entry.get("missed_run_policy", "skip")).strip().lower()
    if policy not in _MISSED_RUN_POLICIES:
        raise ScheduleConfigError(
            f"schedule {label}: 'missed_run_policy' must be one of "
            f"{list(_MISSED_RUN_POLICIES)}"
        )

    reference = entry.get("reference")
    priority = str(entry.get("priority", "Normal"))

    return ScheduleSpec(
        name=name,
        cron=cron,
        diagram_path=diagram_path,
        variables=dict(variables),
        reference=str(reference) if reference is not None else None,
        priority=priority,
        missed_run_policy=policy,
    )


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
        if isinstance(entry, dict) and str(entry.get("name", "")).strip():
            label = repr(str(entry.get("name")).strip())
        else:
            label = f"#{index}"
        if isinstance(entry, dict):
            name = str(entry.get("name", "")).strip()
            if name in seen_names:
                raise ScheduleConfigError(f"duplicate schedule name: {name!r}")
            seen_names.add(name)
        specs.append(_parse_schedule_entry(entry, label))
    return specs


def upsert_schedule(
    path: Path | str, entry: dict[str, Any], *, delete_missing: bool = False
) -> ScheduleSpec:
    """Insert or replace one schedule in a schedules JSON file (issue #857).

    The entry is validated with the exact same rules as
    :func:`load_schedules`; an existing schedule with the same ``name`` is
    replaced, otherwise the entry is appended. The file is rewritten
    atomically (temp file + replace). With ``delete_missing=True`` the
    upsert removes any other schedules not present in ``entry`` — unused
    for now, kept for a future DELETE endpoint.
    """
    if not isinstance(entry, dict):
        raise ScheduleConfigError("schedule payload must be an object")
    spec = _parse_schedule_entry(entry, f"upsert {entry.get('name', '')!r}")
    schedules_path = Path(path)

    existing: list[dict[str, Any]] = []
    if schedules_path.exists():
        try:
            loaded = json.loads(schedules_path.read_text(encoding="utf-8"))
            if isinstance(loaded, list):
                existing = [e for e in loaded if isinstance(e, dict)]
        except (json.JSONDecodeError, OSError) as exc:
            raise ScheduleConfigError(
                f"cannot update schedules file {schedules_path}: {exc}"
            ) from exc

    if delete_missing:
        kept: list[dict[str, Any]] = []
    else:
        kept = [e for e in existing if str(e.get("name", "")).strip() != spec.name]
    raw_entry: dict[str, Any] = {
        "name": spec.name,
        "cron": str(entry.get("cron", "")).strip(),
        "diagram_path": spec.diagram_path,
        "variables": dict(spec.variables),
        "priority": spec.priority,
        "missed_run_policy": spec.missed_run_policy,
    }
    if spec.reference is not None:
        raw_entry["reference"] = spec.reference
    kept.append(raw_entry)

    schedules_path.parent.mkdir(parents=True, exist_ok=True)
    tmp = schedules_path.with_suffix(schedules_path.suffix + ".tmp")
    tmp.write_text(json.dumps(kept, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp.replace(schedules_path)
    return spec


class ScheduleManager:
    """Evaluates schedules per tick and enqueues due runs into a work queue."""

    def __init__(
        self,
        specs: list[ScheduleSpec],
        state: ScheduleState,
        store: SQLiteQueueStore,
        queue_name: str,
        anchor: datetime | None = None,
        specs_path: Path | str | None = None,
    ) -> None:
        """``anchor`` is the record start for never-run schedules; it defaults
        to *now*, meaning a fresh daemon fires from the next cron slot on.

        ``specs_path`` (issue #857) enables hot reload: when the file's mtime
        changes, specs are re-validated and replaced before the next
        evaluation, so remote upserts via the serve API take effect without
        a daemon restart.
        """
        self.specs = specs
        self.state = state
        self.store = store
        self.queue_name = queue_name
        self.anchor = anchor if anchor is not None else datetime.now(timezone.utc)
        self.specs_path = Path(specs_path) if specs_path is not None else None
        self._specs_signature: tuple[int, int] | None = self._file_signature()

    def _file_signature(self) -> tuple[int, int] | None:
        """Change marker for the schedules file: ``(mtime_ns, size)``.

        Size matters because filesystem mtime granularity (1s on some CI
        runners) can make two writes within the same tick indistinguishable.
        """
        if self.specs_path is None:
            return None
        try:
            stat = self.specs_path.stat()
        except OSError:
            return None
        return (stat.st_mtime_ns, stat.st_size)

    def _maybe_reload_specs(self) -> None:
        """Hot-reload specs when the schedules file changed on disk."""
        if self.specs_path is None:
            return
        signature = self._file_signature()
        if signature == self._specs_signature:
            return
        try:
            self.specs = load_schedules(self.specs_path)
            self._specs_signature = signature
            logger.info(
                "schedules reloaded from %s (%d entries)",
                self.specs_path,
                len(self.specs),
            )
        except (ScheduleConfigError, OSError) as exc:
            logger.warning(
                "keeping previous schedules: %s is invalid: %s",
                self.specs_path,
                exc,
            )
            self._specs_signature = signature

    def tick(self, now: datetime) -> list[QueueItem]:
        """Enqueue all due schedules for ``now``; persists state. Returns items.

        ``now`` must be timezone-aware.
        """
        self._maybe_reload_specs()
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
