"""Tests for DateTime library."""

from __future__ import annotations


class TestDateTimeImport:
    """Tests for DateTime library import and metadata."""

    def test_import_library(self):
        from rpaforge_libraries.DateTime import DateTime

        lib = DateTime()
        assert lib is not None

    def test_library_is_decorated(self):
        from rpaforge_libraries.DateTime import DateTime

        assert hasattr(DateTime, "_library_meta")
        assert DateTime._library_name == "DateTime"


class TestDateTimeKeywords:
    """Tests for DateTime keyword signatures."""

    def test_keywords_exist(self):
        from rpaforge_libraries.DateTime import DateTime

        lib = DateTime()

        keywords = [
            "get_datetime",
            "format_datetime",
            "parse_datetime",
            "add_to_datetime",
            "date_diff",
            "compare_datetime",
            "get_period_bounds",
            "days_in_month",
            "is_between",
            "get_datetime_part",
            "get_weekday",
            "get_month_name",
            "is_weekend",
        ]

        for keyword in keywords:
            assert hasattr(lib, keyword), f"Missing keyword: {keyword}"


class TestGetDatetime:
    """Tests for get_datetime method."""

    def test_get_datetime_now_returns_string(self):
        from rpaforge_libraries.DateTime import DateTime

        lib = DateTime()
        result = lib.get_datetime(mode="now")
        assert isinstance(result, str)
        assert len(result) > 0

    def test_get_datetime_create_mode(self):
        from rpaforge_libraries.DateTime import DateTime

        lib = DateTime()
        result = lib.get_datetime(
            mode="create", year=2024, month=6, day=15, hour=10, minute=30, second=0
        )
        assert result == "2024-06-15T10:30:00"

    def test_get_datetime_return_type_date(self):
        from rpaforge_libraries.DateTime import DateTime

        lib = DateTime()
        result = lib.get_datetime(
            mode="create", year=2024, month=6, day=15, return_type="date"
        )
        assert result == "2024-06-15"

    def test_get_datetime_return_type_time(self):
        from rpaforge_libraries.DateTime import DateTime

        lib = DateTime()
        result = lib.get_datetime(
            mode="create", hour=10, minute=30, second=45, return_type="time"
        )
        assert result == "10:30:45"

    def test_get_datetime_default_mode_is_now(self):
        import re

        from rpaforge_libraries.DateTime import DateTime

        lib = DateTime()
        result = lib.get_datetime()
        # Should be a valid ISO datetime string
        assert re.match(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}", result)


class TestFormatDatetime:
    """Tests for format_datetime method."""

    def test_format_datetime_default_format(self):
        from rpaforge_libraries.DateTime import DateTime

        lib = DateTime()
        result = lib.format_datetime("2024-06-15T10:30:00")
        assert result == "2024-06-15 10:30:00"

    def test_format_datetime_custom_format(self):
        from rpaforge_libraries.DateTime import DateTime

        lib = DateTime()
        result = lib.format_datetime("2024-06-15T10:30:00", format_string="%d/%m/%Y")
        assert result == "15/06/2024"

    def test_format_datetime_with_z_suffix(self):
        from rpaforge_libraries.DateTime import DateTime

        lib = DateTime()
        result = lib.format_datetime("2024-06-15T10:30:00Z", format_string="%Y-%m-%d")
        assert result == "2024-06-15"


class TestParseDatetime:
    """Tests for parse_datetime method."""

    def test_parse_datetime_iso_format(self):
        from rpaforge_libraries.DateTime import DateTime

        lib = DateTime()
        result = lib.parse_datetime("2024-06-15T10:30:00")
        assert result == "2024-06-15T10:30:00"

    def test_parse_datetime_with_format_string(self):
        from rpaforge_libraries.DateTime import DateTime

        lib = DateTime()
        result = lib.parse_datetime("15/06/2024", format_string="%d/%m/%Y")
        assert result == "2024-06-15T00:00:00"

    def test_parse_datetime_with_z_suffix(self):
        from rpaforge_libraries.DateTime import DateTime

        lib = DateTime()
        result = lib.parse_datetime("2024-06-15T10:30:00Z")
        assert "2024-06-15" in result


class TestAddToDatetime:
    """Tests for add_to_datetime method."""

    def test_add_days(self):
        from rpaforge_libraries.DateTime import DateTime

        lib = DateTime()
        result = lib.add_to_datetime("2024-01-01T00:00:00", value=5, unit="days")
        assert result == "2024-01-06T00:00:00"

    def test_add_hours(self):
        from rpaforge_libraries.DateTime import DateTime

        lib = DateTime()
        result = lib.add_to_datetime("2024-01-01T00:00:00", value=3, unit="hours")
        assert result == "2024-01-01T03:00:00"

    def test_add_minutes(self):
        from rpaforge_libraries.DateTime import DateTime

        lib = DateTime()
        result = lib.add_to_datetime("2024-01-01T00:00:00", value=90, unit="minutes")
        assert result == "2024-01-01T01:30:00"

    def test_add_seconds(self):
        from rpaforge_libraries.DateTime import DateTime

        lib = DateTime()
        result = lib.add_to_datetime("2024-01-01T00:00:00", value=3600, unit="seconds")
        assert result == "2024-01-01T01:00:00"

    def test_add_weeks(self):
        from rpaforge_libraries.DateTime import DateTime

        lib = DateTime()
        result = lib.add_to_datetime("2024-01-01T00:00:00", value=1, unit="weeks")
        assert result == "2024-01-08T00:00:00"

    def test_add_months(self):
        from rpaforge_libraries.DateTime import DateTime

        lib = DateTime()
        result = lib.add_to_datetime("2024-01-15T00:00:00", value=1, unit="months")
        assert result == "2024-02-15T00:00:00"

    def test_subtract_days(self):
        from rpaforge_libraries.DateTime import DateTime

        lib = DateTime()
        result = lib.add_to_datetime("2024-01-10T00:00:00", value=-5, unit="days")
        assert result == "2024-01-05T00:00:00"


class TestDateDiff:
    """Tests for date_diff method."""

    def test_date_diff_seconds(self):
        from rpaforge_libraries.DateTime import DateTime

        lib = DateTime()
        result = lib.date_diff(
            "2024-01-01T00:00:00", "2024-01-01T00:01:00", unit="seconds"
        )
        assert result == 60.0

    def test_date_diff_minutes(self):
        from rpaforge_libraries.DateTime import DateTime

        lib = DateTime()
        result = lib.date_diff(
            "2024-01-01T00:00:00", "2024-01-01T01:00:00", unit="minutes"
        )
        assert result == 60.0

    def test_date_diff_hours(self):
        from rpaforge_libraries.DateTime import DateTime

        lib = DateTime()
        result = lib.date_diff(
            "2024-01-01T00:00:00", "2024-01-02T00:00:00", unit="hours"
        )
        assert result == 24.0

    def test_date_diff_days(self):
        from rpaforge_libraries.DateTime import DateTime

        lib = DateTime()
        result = lib.date_diff(
            "2024-01-01T00:00:00", "2024-01-08T00:00:00", unit="days"
        )
        assert result == 7.0

    def test_date_diff_negative(self):
        from rpaforge_libraries.DateTime import DateTime

        lib = DateTime()
        result = lib.date_diff(
            "2024-01-08T00:00:00", "2024-01-01T00:00:00", unit="days"
        )
        assert result == -7.0


class TestCompareDatetime:
    """Tests for compare_datetime method."""

    def test_compare_mode_less_than(self):
        from rpaforge_libraries.DateTime import DateTime

        lib = DateTime()
        result = lib.compare_datetime("2024-01-01T00:00:00", "2024-01-02T00:00:00")
        assert result == -1

    def test_compare_mode_greater_than(self):
        from rpaforge_libraries.DateTime import DateTime

        lib = DateTime()
        result = lib.compare_datetime("2024-01-02T00:00:00", "2024-01-01T00:00:00")
        assert result == 1

    def test_compare_mode_equal(self):
        from rpaforge_libraries.DateTime import DateTime

        lib = DateTime()
        result = lib.compare_datetime("2024-01-01T00:00:00", "2024-01-01T00:00:00")
        assert result == 0

    def test_before_mode_true(self):
        from rpaforge_libraries.DateTime import DateTime

        lib = DateTime()
        result = lib.compare_datetime(
            "2024-01-01T00:00:00", "2024-01-02T00:00:00", mode="before"
        )
        assert result is True

    def test_before_mode_false(self):
        from rpaforge_libraries.DateTime import DateTime

        lib = DateTime()
        result = lib.compare_datetime(
            "2024-01-02T00:00:00", "2024-01-01T00:00:00", mode="before"
        )
        assert result is False

    def test_after_mode_true(self):
        from rpaforge_libraries.DateTime import DateTime

        lib = DateTime()
        result = lib.compare_datetime(
            "2024-01-02T00:00:00", "2024-01-01T00:00:00", mode="after"
        )
        assert result is True


class TestGetPeriodBounds:
    """Tests for get_period_bounds method."""

    def test_day_start(self):
        from rpaforge_libraries.DateTime import DateTime

        lib = DateTime()
        result = lib.get_period_bounds("2024-06-15T14:30:00", period="day", bound="start")
        assert result == "2024-06-15T00:00:00"

    def test_day_end(self):
        from rpaforge_libraries.DateTime import DateTime

        lib = DateTime()
        result = lib.get_period_bounds("2024-06-15T14:30:00", period="day", bound="end")
        assert "2024-06-15T23:59:59" in result

    def test_month_start(self):
        from rpaforge_libraries.DateTime import DateTime

        lib = DateTime()
        result = lib.get_period_bounds(
            "2024-06-15T14:30:00", period="month", bound="start"
        )
        assert result == "2024-06-01T00:00:00"

    def test_month_end(self):
        from rpaforge_libraries.DateTime import DateTime

        lib = DateTime()
        result = lib.get_period_bounds(
            "2024-06-15T14:30:00", period="month", bound="end"
        )
        assert "2024-06-30T23:59:59" in result

    def test_year_start(self):
        from rpaforge_libraries.DateTime import DateTime

        lib = DateTime()
        result = lib.get_period_bounds(
            "2024-06-15T14:30:00", period="year", bound="start"
        )
        assert result == "2024-01-01T00:00:00"

    def test_year_end(self):
        from rpaforge_libraries.DateTime import DateTime

        lib = DateTime()
        result = lib.get_period_bounds(
            "2024-06-15T14:30:00", period="year", bound="end"
        )
        assert "2024-12-31T23:59:59" in result


class TestDaysInMonth:
    """Tests for days_in_month method."""

    def test_january_has_31_days(self):
        from rpaforge_libraries.DateTime import DateTime

        lib = DateTime()
        assert lib.days_in_month("2024-01-15T00:00:00") == 31

    def test_february_leap_year(self):
        from rpaforge_libraries.DateTime import DateTime

        lib = DateTime()
        assert lib.days_in_month("2024-02-15T00:00:00") == 29

    def test_february_non_leap_year(self):
        from rpaforge_libraries.DateTime import DateTime

        lib = DateTime()
        assert lib.days_in_month("2023-02-15T00:00:00") == 28

    def test_december_has_31_days(self):
        from rpaforge_libraries.DateTime import DateTime

        lib = DateTime()
        assert lib.days_in_month("2024-12-15T00:00:00") == 31


class TestIsBetween:
    """Tests for is_between method."""

    def test_datetime_between_inclusive(self):
        from rpaforge_libraries.DateTime import DateTime

        lib = DateTime()
        result = lib.is_between(
            "2024-06-15T00:00:00",
            "2024-06-01T00:00:00",
            "2024-06-30T00:00:00",
        )
        assert result is True

    def test_datetime_not_between(self):
        from rpaforge_libraries.DateTime import DateTime

        lib = DateTime()
        result = lib.is_between(
            "2024-07-15T00:00:00",
            "2024-06-01T00:00:00",
            "2024-06-30T00:00:00",
        )
        assert result is False

    def test_datetime_on_boundary_inclusive(self):
        from rpaforge_libraries.DateTime import DateTime

        lib = DateTime()
        result = lib.is_between(
            "2024-06-01T00:00:00",
            "2024-06-01T00:00:00",
            "2024-06-30T00:00:00",
            inclusive=True,
        )
        assert result is True

    def test_datetime_on_boundary_exclusive(self):
        from rpaforge_libraries.DateTime import DateTime

        lib = DateTime()
        result = lib.is_between(
            "2024-06-01T00:00:00",
            "2024-06-01T00:00:00",
            "2024-06-30T00:00:00",
            inclusive=False,
        )
        assert result is False


class TestGetDatetimePart:
    """Tests for get_datetime_part method."""

    def test_get_year(self):
        from rpaforge_libraries.DateTime import DateTime

        lib = DateTime()
        assert lib.get_datetime_part("2024-06-15T10:30:45", part="year") == 2024

    def test_get_month(self):
        from rpaforge_libraries.DateTime import DateTime

        lib = DateTime()
        assert lib.get_datetime_part("2024-06-15T10:30:45", part="month") == 6

    def test_get_day(self):
        from rpaforge_libraries.DateTime import DateTime

        lib = DateTime()
        assert lib.get_datetime_part("2024-06-15T10:30:45", part="day") == 15

    def test_get_hour(self):
        from rpaforge_libraries.DateTime import DateTime

        lib = DateTime()
        assert lib.get_datetime_part("2024-06-15T10:30:45", part="hour") == 10

    def test_get_minute(self):
        from rpaforge_libraries.DateTime import DateTime

        lib = DateTime()
        assert lib.get_datetime_part("2024-06-15T10:30:45", part="minute") == 30

    def test_get_second(self):
        from rpaforge_libraries.DateTime import DateTime

        lib = DateTime()
        assert lib.get_datetime_part("2024-06-15T10:30:45", part="second") == 45

    def test_get_date(self):
        from rpaforge_libraries.DateTime import DateTime

        lib = DateTime()
        assert lib.get_datetime_part("2024-06-15T10:30:45", part="date") == "2024-06-15"

    def test_get_time(self):
        from rpaforge_libraries.DateTime import DateTime

        lib = DateTime()
        assert lib.get_datetime_part("2024-06-15T10:30:45", part="time") == "10:30:45"

    def test_get_weekday(self):
        from rpaforge_libraries.DateTime import DateTime

        lib = DateTime()
        # 2024-06-17 is a Monday (weekday=0)
        assert lib.get_datetime_part("2024-06-17T00:00:00", part="weekday") == 0


class TestGetWeekday:
    """Tests for get_weekday method."""

    def test_get_weekday_number(self):
        from rpaforge_libraries.DateTime import DateTime

        lib = DateTime()
        # 2024-06-17 is Monday = 0
        assert lib.get_weekday("2024-06-17T00:00:00") == 0

    def test_get_weekday_as_name(self):
        from rpaforge_libraries.DateTime import DateTime

        lib = DateTime()
        result = lib.get_weekday("2024-06-17T00:00:00", as_name=True)
        assert result == "Monday"

    def test_get_weekday_sunday(self):
        from rpaforge_libraries.DateTime import DateTime

        lib = DateTime()
        # 2024-06-16 is Sunday = 6
        assert lib.get_weekday("2024-06-16T00:00:00") == 6


class TestGetMonthName:
    """Tests for get_month_name method."""

    def test_get_month_name_january(self):
        from rpaforge_libraries.DateTime import DateTime

        lib = DateTime()
        assert lib.get_month_name("2024-01-15T00:00:00") == "January"

    def test_get_month_name_december(self):
        from rpaforge_libraries.DateTime import DateTime

        lib = DateTime()
        assert lib.get_month_name("2024-12-15T00:00:00") == "December"


class TestIsWeekend:
    """Tests for is_weekend method."""

    def test_saturday_is_weekend(self):
        from rpaforge_libraries.DateTime import DateTime

        lib = DateTime()
        # 2024-06-15 is Saturday
        assert lib.is_weekend("2024-06-15T00:00:00") is True

    def test_sunday_is_weekend(self):
        from rpaforge_libraries.DateTime import DateTime

        lib = DateTime()
        # 2024-06-16 is Sunday
        assert lib.is_weekend("2024-06-16T00:00:00") is True

    def test_monday_is_not_weekend(self):
        from rpaforge_libraries.DateTime import DateTime

        lib = DateTime()
        # 2024-06-17 is Monday
        assert lib.is_weekend("2024-06-17T00:00:00") is False

    def test_friday_is_not_weekend(self):
        from rpaforge_libraries.DateTime import DateTime

        lib = DateTime()
        # 2024-06-14 is Friday
        assert lib.is_weekend("2024-06-14T00:00:00") is False
