"""Tests for RPAForge DateTime Library."""

from datetime import datetime

from rpaforge_libraries.DateTime import DateTime


class TestDateTimeLibrary:
    """Tests for DateTime library."""

    def setup_method(self):
        """Set up test fixtures."""
        self.library = DateTime()

    def test_now(self):
        """Test getting current datetime."""
        result = self.library.get_datetime(mode="now", return_type="datetime")
        assert "T" in result
        datetime.fromisoformat(result)

    def test_today(self):
        """Test getting current date."""
        result = self.library.get_datetime(mode="now", return_type="date")
        assert len(result) == 10
        assert "-" in result

    def test_current_time(self):
        """Test getting current time."""
        result = self.library.get_datetime(mode="now", return_type="time")
        assert ":" in result

    def test_format_datetime(self):
        """Test formatting datetime."""
        dt = datetime(2025, 1, 15, 10, 30, 0)
        result = self.library.format_datetime(dt.isoformat(), "%Y-%m-%d")
        assert result == "2025-01-15"

    def test_parse_datetime(self):
        """Test parsing datetime."""
        result = self.library.parse_datetime("2025-01-15T10:30:00")
        assert "2025-01-15" in result
        assert "10:30:00" in result

    def test_add_days(self):
        """Test adding days."""
        dt = datetime(2025, 1, 15)
        result = self.library.add_to_datetime(dt.isoformat(), 5, unit="days")
        assert "2025-01-20" in result

    def test_add_days_negative(self):
        """Test subtracting days."""
        dt = datetime(2025, 1, 15)
        result = self.library.add_to_datetime(dt.isoformat(), -5, unit="days")
        assert "2025-01-10" in result

    def test_add_hours(self):
        """Test adding hours."""
        dt = datetime(2025, 1, 15, 10, 0, 0)
        result = self.library.add_to_datetime(dt.isoformat(), 5, unit="hours")
        assert "15:00:00" in result

    def test_add_minutes(self):
        """Test adding minutes."""
        dt = datetime(2025, 1, 15, 10, 0, 0)
        result = self.library.add_to_datetime(dt.isoformat(), 30, unit="minutes")
        assert "10:30:00" in result

    def test_add_seconds(self):
        """Test adding seconds."""
        dt = datetime(2025, 1, 15, 10, 0, 0)
        result = self.library.add_to_datetime(dt.isoformat(), 30, unit="seconds")
        assert "10:00:30" in result

    def test_add_weeks(self):
        """Test adding weeks."""
        dt = datetime(2025, 1, 15)
        result = self.library.add_to_datetime(dt.isoformat(), 1, unit="weeks")
        assert "2025-01-22" in result

    def test_add_months(self):
        """Test adding months."""
        dt = datetime(2025, 1, 15)
        result = self.library.add_to_datetime(dt.isoformat(), 2, unit="months")
        assert "2025-03-15" in result

    def test_add_months_year_rollover(self):
        """Test adding months with year rollover."""
        dt = datetime(2025, 11, 15)
        result = self.library.add_to_datetime(dt.isoformat(), 3, unit="months")
        assert "2026-02-15" in result

    def test_date_diff(self):
        """Test date difference."""
        dt1 = datetime(2025, 1, 15)
        dt2 = datetime(2025, 1, 20)
        result = self.library.date_diff(dt1.isoformat(), dt2.isoformat(), "days")
        assert result == 5.0

    def test_date_diff_hours(self):
        """Test date difference in hours."""
        dt1 = datetime(2025, 1, 15, 10, 0, 0)
        dt2 = datetime(2025, 1, 15, 15, 0, 0)
        result = self.library.date_diff(dt1.isoformat(), dt2.isoformat(), "hours")
        assert result == 5.0

    def test_compare(self):
        """Test comparing datetimes."""
        dt1 = datetime(2025, 1, 15)
        dt2 = datetime(2025, 1, 20)
        assert (
            self.library.compare_datetime(
                dt1.isoformat(), dt2.isoformat(), mode="compare"
            )
            == -1
        )
        assert (
            self.library.compare_datetime(
                dt2.isoformat(), dt1.isoformat(), mode="compare"
            )
            == 1
        )
        assert (
            self.library.compare_datetime(
                dt1.isoformat(), dt1.isoformat(), mode="compare"
            )
            == 0
        )

    def test_is_before(self):
        """Test is_before check."""
        dt1 = datetime(2025, 1, 15)
        dt2 = datetime(2025, 1, 20)
        assert (
            self.library.compare_datetime(
                dt1.isoformat(), dt2.isoformat(), mode="before"
            )
            is True
        )
        assert (
            self.library.compare_datetime(
                dt2.isoformat(), dt1.isoformat(), mode="before"
            )
            is False
        )

    def test_is_after(self):
        """Test is_after check."""
        dt1 = datetime(2025, 1, 15)
        dt2 = datetime(2025, 1, 20)
        assert (
            self.library.compare_datetime(
                dt2.isoformat(), dt1.isoformat(), mode="after"
            )
            is True
        )
        assert (
            self.library.compare_datetime(
                dt1.isoformat(), dt2.isoformat(), mode="after"
            )
            is False
        )

    def test_is_between(self):
        """Test is_between check."""
        dt = datetime(2025, 1, 15)
        start = datetime(2025, 1, 10)
        end = datetime(2025, 1, 20)
        assert (
            self.library.is_between(dt.isoformat(), start.isoformat(), end.isoformat())
            is True
        )

    def test_get_date_part(self):
        """Test extracting date part."""
        dt = datetime(2025, 1, 15, 10, 30, 0)
        result = self.library.get_datetime_part(dt.isoformat(), part="date")
        assert result == "2025-01-15"

    def test_get_time_part(self):
        """Test extracting time part."""
        dt = datetime(2025, 1, 15, 10, 30, 0)
        result = self.library.get_datetime_part(dt.isoformat(), part="time")
        assert "10:30:00" in result

    def test_get_year(self):
        """Test extracting year."""
        dt = datetime(2025, 1, 15)
        assert self.library.get_datetime_part(dt.isoformat(), part="year") == 2025

    def test_get_month(self):
        """Test extracting month."""
        dt = datetime(2025, 6, 15)
        assert self.library.get_datetime_part(dt.isoformat(), part="month") == 6

    def test_get_day(self):
        """Test extracting day."""
        dt = datetime(2025, 1, 15)
        assert self.library.get_datetime_part(dt.isoformat(), part="day") == 15

    def test_get_hour(self):
        """Test extracting hour."""
        dt = datetime(2025, 1, 15, 10, 30, 0)
        assert self.library.get_datetime_part(dt.isoformat(), part="hour") == 10

    def test_get_minute(self):
        """Test extracting minute."""
        dt = datetime(2025, 1, 15, 10, 30, 0)
        assert self.library.get_datetime_part(dt.isoformat(), part="minute") == 30

    def test_get_second(self):
        """Test extracting second."""
        dt = datetime(2025, 1, 15, 10, 30, 45)
        assert self.library.get_datetime_part(dt.isoformat(), part="second") == 45

    def test_get_weekday(self):
        """Test getting weekday."""
        dt = datetime(2025, 1, 15)
        assert self.library.get_weekday(dt.isoformat()) == 2

    def test_get_weekday_name(self):
        """Test getting weekday name."""
        dt = datetime(2025, 1, 15)
        assert self.library.get_weekday(dt.isoformat(), as_name=True) == "Wednesday"

    def test_get_month_name(self):
        """Test getting month name."""
        dt = datetime(2025, 1, 15)
        assert self.library.get_month_name(dt.isoformat()) == "January"

    def test_is_weekend(self):
        """Test weekend check."""
        saturday = datetime(2025, 1, 18)
        sunday = datetime(2025, 1, 19)
        monday = datetime(2025, 1, 20)
        assert self.library.is_weekend(saturday.isoformat()) is True
        assert self.library.is_weekend(sunday.isoformat()) is True
        assert self.library.is_weekend(monday.isoformat()) is False

    def test_start_of_day(self):
        """Test start of day."""
        dt = datetime(2025, 1, 15, 10, 30, 0)
        result = self.library.get_period_bounds(
            dt.isoformat(), period="day", bound="start"
        )
        assert "00:00:00" in result

    def test_end_of_day(self):
        """Test end of day."""
        dt = datetime(2025, 1, 15, 10, 30, 0)
        result = self.library.get_period_bounds(
            dt.isoformat(), period="day", bound="end"
        )
        assert "23:59:59" in result

    def test_start_of_month(self):
        """Test start of month."""
        dt = datetime(2025, 1, 15, 10, 30, 0)
        result = self.library.get_period_bounds(
            dt.isoformat(), period="month", bound="start"
        )
        assert "2025-01-01" in result

    def test_end_of_month(self):
        """Test end of month."""
        dt = datetime(2025, 1, 15)
        result = self.library.get_period_bounds(
            dt.isoformat(), period="month", bound="end"
        )
        assert "2025-01-31" in result

    def test_days_in_month(self):
        """Test days in month."""
        jan = datetime(2025, 1, 1)
        feb = datetime(2025, 2, 1)
        feb_leap = datetime(2024, 2, 1)
        assert self.library.days_in_month(jan.isoformat()) == 31
        assert self.library.days_in_month(feb.isoformat()) == 28
        assert self.library.days_in_month(feb_leap.isoformat()) == 29
