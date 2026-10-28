"""Tests for cron parsing and next-run computation (issue #818)."""

from __future__ import annotations

from datetime import datetime, timezone
from zoneinfo import ZoneInfo

import pytest

from rpaforge.runner.cron import CronParseError, parse_cron

BERLIN = ZoneInfo("Europe/Berlin")
UTC = timezone.utc


class TestCronParsing:
    """Expression parsing and validation."""

    def test_parses_simple_expression(self) -> None:
        schedule = parse_cron("30 9 * * 1-5")
        assert schedule.minutes == frozenset({30})
        assert schedule.hours == frozenset({9})
        assert schedule.days_of_month is None
        assert schedule.months == frozenset(range(1, 13))
        assert schedule.days_of_week == frozenset({1, 2, 3, 4, 5})

    def test_parses_steps_ranges_lists(self) -> None:
        schedule = parse_cron("*/15 0-23/2 1,15 3,6 0")
        assert schedule.minutes == frozenset(range(0, 60, 15))
        assert schedule.hours == frozenset(range(0, 24, 2))
        assert schedule.days_of_month == frozenset({1, 15})
        assert schedule.months == frozenset({3, 6})
        assert schedule.days_of_week == frozenset({0})  # 7->0 alias unused here

    def test_dow_seven_normalizes_to_sunday(self) -> None:
        assert parse_cron("0 12 * * 7").days_of_week == frozenset({0})
        assert parse_cron("0 12 * * 0").days_of_week == frozenset({0})

    def test_single_value_with_step_spans_to_max(self) -> None:
        # Vixie semantics: '5/15' in minutes == '5-59/15'
        assert parse_cron("5/15 * * * *").minutes == frozenset(range(5, 60, 15))

    @pytest.mark.parametrize(
        "expr",
        [
            "60 * * * *",  # minute out of range
            "* 24 * * *",  # hour out of range
            "* * 0 * *",  # dom starts at 1
            "* * * 13 *",  # month out of range
            "* * * * 8",  # dow out of range (0-7)
            "5 9 * *",  # too few fields
            "5 9 * * * *",  # too many fields (seconds unsupported)
            "a b * * *",  # non-numeric
            "10-5 * * * *",  # descending range
            "*/0 * * * *",  # zero step
        ],
    )
    def test_invalid_expressions_raise(self, expr: str) -> None:
        with pytest.raises(CronParseError):
            parse_cron(expr)

    def test_error_message_names_the_field(self) -> None:
        with pytest.raises(CronParseError, match="minute"):
            parse_cron("61 * * * *")


class TestCronMatching:
    """Boolean matching on wall-clock values."""

    def test_matches_weekday_morning(self) -> None:
        schedule = parse_cron("30 9 * * 1-5")
        # 2026-10-28 is a Wednesday.
        wednesday = datetime(2026, 10, 28, 9, 30, tzinfo=UTC)
        saturday = datetime(2026, 10, 31, 9, 30, tzinfo=UTC)
        assert schedule.matches(wednesday)
        assert not schedule.matches(saturday)
        assert not schedule.matches(wednesday.replace(minute=31))

    def test_dom_and_dow_restricted_use_or_rule(self) -> None:
        # Classic cron: '0 0 1 * 1' fires on the 1st OR any Monday.
        schedule = parse_cron("0 0 1 * 1")
        first_of_month = datetime(2026, 11, 1, 0, 0, tzinfo=UTC)  # a Sunday
        monday = datetime(2026, 11, 2, 0, 0, tzinfo=UTC)
        tuesday = datetime(2026, 11, 3, 0, 0, tzinfo=UTC)
        assert schedule.matches(first_of_month)
        assert schedule.matches(monday)
        assert not schedule.matches(tuesday)


class TestCronNextAfter:
    """Next-run computation."""

    def test_next_minutely(self) -> None:
        schedule = parse_cron("* * * * *")
        after = datetime(2026, 10, 28, 10, 0, 30, tzinfo=UTC)
        assert schedule.next_after(after) == datetime(2026, 10, 28, 10, 1, tzinfo=UTC)

    def test_next_daily_skips_to_tomorrow(self) -> None:
        schedule = parse_cron("0 9 * * *")
        after = datetime(2026, 10, 28, 10, 0, tzinfo=UTC)
        assert schedule.next_after(after) == datetime(2026, 10, 29, 9, 0, tzinfo=UTC)

    def test_next_weekly_respects_dow(self) -> None:
        schedule = parse_cron("0 8 * * 1")  # Mondays
        # 2026-10-28 is Wednesday -> next Monday is 2026-11-02.
        after = datetime(2026, 10, 28, 12, 0, tzinfo=UTC)
        assert schedule.next_after(after) == datetime(2026, 11, 2, 8, 0, tzinfo=UTC)

    def test_next_monthly_february_29(self) -> None:
        schedule = parse_cron("0 0 29 2 *")
        after = datetime(2026, 3, 1, tzinfo=UTC)
        assert schedule.next_after(after) == datetime(2028, 2, 29, 0, 0, tzinfo=UTC)

    def test_impossible_cron_raises_after_bounded_scan(self) -> None:
        schedule = parse_cron("0 0 30 2 *")  # Feb 30 never exists
        with pytest.raises(RuntimeError, match="no cron occurrence"):
            schedule.next_after(datetime(2026, 1, 1, tzinfo=UTC))

    def test_next_after_requires_timezone_aware(self) -> None:
        from datetime import datetime as dt

        schedule = parse_cron("* * * * *")
        with pytest.raises(ValueError, match="timezone-aware"):
            schedule.next_after(dt(2026, 1, 1, 0, 0))

    def test_strictly_after_boundary(self) -> None:
        schedule = parse_cron("0 * * * *")
        exactly_at_slot = datetime(2026, 10, 28, 10, 0, tzinfo=UTC)
        assert schedule.next_after(exactly_at_slot) == datetime(
            2026, 10, 28, 11, 0, tzinfo=UTC
        )

    def test_result_keeps_source_timezone(self) -> None:
        schedule = parse_cron("0 9 * * *")
        after = datetime(2026, 10, 28, 10, 0, tzinfo=BERLIN)
        result = schedule.next_after(after)
        assert result.tzinfo is not None
        assert result.utcoffset() == BERLIN.utcoffset(result)


class TestCronDst:
    """DST transitions in wall-clock semantics."""

    def test_spring_forward_skips_nonexistent_slot(self) -> None:
        # Europe/Berlin, 2026-03-29: 02:00 -> 03:00, so the 02:30 slot does
        # not exist. Documented semantics: the slot does not shift to a later
        # hour; the next occurrence is the next matching day.
        schedule = parse_cron("30 2 * * *")
        after = datetime(2026, 3, 28, 12, 0, tzinfo=BERLIN)
        result = schedule.next_after(after)
        assert result == datetime(2026, 3, 30, 2, 30, tzinfo=BERLIN)

    def test_fall_back_fires_once_at_first_occurrence(self) -> None:
        # Europe/Berlin, 2026-10-25: 03:00 -> 02:00, so 02:30 happens twice.
        schedule = parse_cron("30 2 * * *")
        after = datetime(2026, 10, 24, 12, 0, tzinfo=BERLIN)
        result = schedule.next_after(after)
        assert result.date().isoformat() == "2026-10-25"
        assert result.hour == 2 and result.minute == 30
        assert result.fold == 0  # first occurrence
        next_result = schedule.next_after(result)
        assert next_result.date().isoformat() == "2026-10-26"  # not the repeat

    def test_utc_has_no_gaps(self) -> None:
        schedule = parse_cron("30 2 * * *")
        after = datetime(2026, 3, 28, 12, 0, tzinfo=UTC)
        assert schedule.next_after(after) == datetime(2026, 3, 29, 2, 30, tzinfo=UTC)
