"""Cron expression parsing and next-run computation for the runner scheduler.

Supports standard 5-field cron expressions (minute, hour, day-of-month,
month, day-of-week) with ``*``, lists (``a,b``), ranges (``a-b``) and steps
(``*/n``, ``a-b/n``, ``a/n``). Day-of-week accepts 0-6 (Sun-Sat) with 7 as an
alias for Sunday, following the Vixie convention; when both day-of-month and
day-of-week are restricted, a date matches if *either* field matches.

All evaluation is wall-clock in the requested :class:`~zoneinfo` timezone.
A slot that falls into a spring-forward gap (nonexistent local time) does not
fire that day — the next occurrence is the next matching day. Ambiguous local
times (fall-back overlap) fire once at the first occurrence (``fold=0``).
"""

from __future__ import annotations

import dataclasses
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

_FIELD_NAMES = ("minute", "hour", "day-of-month", "month", "day-of-week")
_FIELD_RANGES = ((0, 59), (0, 23), (1, 31), (1, 12), (0, 7))  # dow allows 7 (Sunday)
_MAX_DAY_SCAN = 366 * 4 + 2  # enough to always reach the next Feb 29


class CronParseError(ValueError):
    """Raised for malformed cron expressions."""


@dataclass(frozen=True)
class CronSchedule:
    """A parsed 5-field cron expression."""

    minutes: frozenset[int]
    hours: frozenset[int]
    days_of_month: frozenset[int] | None  # None = '*' (unrestricted)
    months: frozenset[int]
    days_of_week: frozenset[int] | None  # None = '*' (unrestricted)
    expression: str = dataclasses.field(repr=False, compare=False, default="")

    def matches(self, moment: datetime) -> bool:
        """Whether ``moment`` (any tz; evaluated on its wall clock) matches."""
        if moment.minute not in self.minutes or moment.hour not in self.hours:
            return False
        if moment.month not in self.months:
            return False
        cron_dow = _cron_day_of_week(moment)
        dom_ok = self.days_of_month is None or moment.day in self.days_of_month
        dow_ok = self.days_of_week is None or cron_dow in self.days_of_week
        if self.days_of_month is not None and self.days_of_week is not None:
            return dom_ok or dow_ok
        return dom_ok and dow_ok

    def next_after(self, after: datetime) -> datetime:
        """Earliest matching instant strictly after ``after``.

        ``after`` must be timezone-aware; the result carries the same tzinfo.
        Raises :class:`RuntimeError` if no occurrence exists within four years
        (e.g. ``0 0 30 2 *``).
        """
        if after.tzinfo is None:
            raise ValueError("next_after requires a timezone-aware datetime")

        day = (after + timedelta(minutes=1)).replace(
            hour=0, minute=0, second=0, microsecond=0
        )
        for _ in range(_MAX_DAY_SCAN):
            if self._day_matches(day):
                moment = self._first_moment_in_day(after, day)
                if moment is not None:
                    return moment
            day = (day + timedelta(days=1)).replace(
                hour=0, minute=0, second=0, microsecond=0
            )
        raise RuntimeError(
            f"no cron occurrence of {self.expression!r} within "
            f"{_MAX_DAY_SCAN} days after {after.isoformat()}"
        )

    # -- internals ---------------------------------------------------------

    def _day_matches(self, day: datetime) -> bool:
        if day.month not in self.months:
            return False
        cron_dow = _cron_day_of_week(day)
        dom_ok = self.days_of_month is None or day.day in self.days_of_month
        dow_ok = self.days_of_week is None or cron_dow in self.days_of_week
        if self.days_of_month is not None and self.days_of_week is not None:
            return dom_ok or dow_ok
        return dom_ok and dow_ok

    def _first_moment_in_day(self, after: datetime, day: datetime) -> datetime | None:
        """First valid, existing, strictly-after-``after`` fire time on ``day``.

        ``day`` is always a midnight boundary, so eligibility against ``after``
        is enforced solely by the ``moment <= after`` guard below.
        """
        for hour in sorted(self.hours):
            for minute in sorted(self.minutes):
                moment = day.replace(hour=hour, minute=minute, fold=0)
                if not _exists(moment):
                    # Spring-forward gap: this wall-clock slot never happens
                    # this day; it does not shift to a later hour.
                    continue
                if moment <= after:
                    continue
                return moment
        return None


def _cron_day_of_week(moment: datetime) -> int:
    """Map Python weekday (Mon=0..Sun=6) to the cron field (Sun=0..Sat=6)."""
    return (moment.weekday() + 1) % 7


def _exists(moment: datetime) -> bool:
    """False for local times inside a spring-forward gap."""
    roundtrip = moment.astimezone(timezone.utc).astimezone(moment.tzinfo)
    return roundtrip.replace(tzinfo=None) == moment.replace(tzinfo=None)


def _parse_field(
    raw: str, index: int, star_means_unrestricted: bool = False
) -> frozenset[int] | None:
    """Parse one cron field.

    Returns ``None`` only for a bare ``*`` when ``star_means_unrestricted``
    is set (dom/dow): that marks the field as unrestricted for the classic
    OR-rule. For minute/hour/month a bare ``*`` yields the full range.
    """
    low, high = _FIELD_RANGES[index]
    if raw.strip() == "*" and star_means_unrestricted:
        return None
    values: set[int] = set()
    for term in raw.split(","):
        term = term.strip()
        if not term:
            raise CronParseError(f"empty term in {_FIELD_NAMES[index]} field: {raw!r}")
        step = 1
        body = term
        has_step = False
        if "/" in term:
            has_step = True
            body, _, step_part = term.partition("/")
            try:
                step = int(step_part)
            except ValueError as exc:
                raise CronParseError(
                    f"invalid step in {_FIELD_NAMES[index]} field: {term!r}"
                ) from exc
            if step < 1:
                raise CronParseError(
                    f"step must be >= 1 in {_FIELD_NAMES[index]} field: {term!r}"
                )
        if body in ("*", ""):
            start, end = low, high
        elif "-" in body:
            range_parts = body.split("-", 1)
            try:
                start, end = int(range_parts[0]), int(range_parts[1])
            except ValueError as exc:
                raise CronParseError(
                    f"invalid range in {_FIELD_NAMES[index]} field: {term!r}"
                ) from exc
        else:
            try:
                start = int(body)
            except ValueError as exc:
                raise CronParseError(
                    f"invalid value in {_FIELD_NAMES[index]} field: {term!r}"
                ) from exc
            # Vixie semantics: 'a/step' spans 'a' through the field maximum.
            end = high if has_step else start
        if not (low <= start <= high and low <= end <= high):
            raise CronParseError(
                f"value out of range {low}-{high} for {_FIELD_NAMES[index]}: {term!r}"
            )
        if start > end:
            raise CronParseError(
                f"descending range not supported in {_FIELD_NAMES[index]}: {term!r}"
            )
        values.update(range(start, end + 1, step))
    if not values:
        raise CronParseError(f"no values in {_FIELD_NAMES[index]} field: {raw!r}")
    return frozenset(values)


def _normalize_dow(values: frozenset[int] | None) -> frozenset[int] | None:
    """Map cron day 7 (Sunday alias) to 0."""
    if values is None:
        return None
    return frozenset(0 if v == 7 else v for v in values)


def parse_cron(expression: str) -> CronSchedule:
    """Parse a 5-field cron expression into a :class:`CronSchedule`."""
    fields = expression.split()
    if len(fields) != 5:
        raise CronParseError(
            f"cron expression must have 5 fields (minute hour dom month dow), "
            f"got {len(fields)}: {expression!r}"
        )
    minute = _parse_field(fields[0], 0)
    hour = _parse_field(fields[1], 1)
    dom = _parse_field(fields[2], 2, star_means_unrestricted=True)
    month = _parse_field(fields[3], 3)
    dow = _normalize_dow(_parse_field(fields[4], 4, star_means_unrestricted=True))
    # Without star_means_unrestricted these three are never None.
    assert minute is not None and hour is not None and month is not None
    return CronSchedule(
        minutes=minute,
        hours=hour,
        days_of_month=dom,
        months=month,
        days_of_week=dow,
        expression=expression,
    )
