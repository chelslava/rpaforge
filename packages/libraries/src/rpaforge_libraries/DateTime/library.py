"""RPAForge DateTime Library - Date and time operations."""

from __future__ import annotations

import logging
from datetime import datetime, timedelta
from typing import TYPE_CHECKING

from rpaforge.core.activity import activity, library, output, param, tags

if TYPE_CHECKING:
    pass

logger = logging.getLogger("rpaforge.datetime")


@library(name="DateTime", category="Data", icon="🕐")
class DateTime:
    """Date and time operations library."""

    @activity(name="Get DateTime", category="DateTime")
    @tags("datetime", "current", "create")
    @output("DateTime value in ISO format")
    @param(
        "mode",
        type="string",
        options=["now", "create"],
        description="Mode: now for current, create for custom",
    )
    def get_datetime(
        self,
        mode: str = "now",
        year: int = 2000,
        month: int = 1,
        day: int = 1,
        hour: int = 0,
        minute: int = 0,
        second: int = 0,
        return_type: str = "datetime",
    ) -> str:
        """Get current datetime or create a custom one.

        :param mode: Mode - now for current datetime, create for custom.
        :param year: Year (for create mode).
        :param month: Month 1-12 (for create mode).
        :param day: Day 1-31 (for create mode).
        :param hour: Hour 0-23 (for create mode).
        :param minute: Minute 0-59 (for create mode).
        :param second: Second 0-59 (for create mode).
        :param return_type: What to return - datetime, date, or time.
        :returns: DateTime value in ISO format.
        """
        mode = mode.lower()
        return_type = return_type.lower()

        if mode == "now":
            dt = datetime.now()
        else:
            dt = datetime(year, month, day, hour, minute, second)

        if return_type == "date":
            return dt.date().isoformat()
        elif return_type == "time":
            return dt.time().isoformat()
        return dt.isoformat()

    @activity(name="Format DateTime", category="DateTime")
    @tags("datetime", "format")
    @output("Formatted datetime string")
    def format_datetime(
        self,
        datetime_str: str,
        format_string: str = "%Y-%m-%d %H:%M:%S",
    ) -> str:
        """Format a datetime string to a custom format.

        :param datetime_str: Datetime string in ISO format.
        :param format_string: Python strftime format string.
        :returns: Formatted datetime string.
        :raises ValueError: If datetime_str is not a valid datetime.

        Common format codes:
        - %Y: Year (4 digits)
        - %m: Month (01-12)
        - %d: Day (01-31)
        - %H: Hour 24h (00-23)
        - %I: Hour 12h (01-12)
        - %M: Minute (00-59)
        - %S: Second (00-59)
        - %p: AM/PM
        - %A: Weekday name
        - %B: Month name
        """
        dt = datetime.fromisoformat(datetime_str.replace("Z", "+00:00"))
        return dt.strftime(format_string)

    @activity(name="Parse DateTime", category="DateTime")
    @tags("datetime", "parse")
    @output("Datetime in ISO format")
    def parse_datetime(
        self,
        datetime_str: str,
        format_string: str | None = None,
    ) -> str:
        """Parse a datetime string to ISO format.

        :param datetime_str: Datetime string to parse.
        :param format_string: Expected format (None for auto-detect).
        :returns: Datetime in ISO format.
        :raises ValueError: If string cannot be parsed.
        """
        if format_string:
            dt = datetime.strptime(datetime_str, format_string)
        else:
            dt = datetime.fromisoformat(datetime_str.replace("Z", "+00:00"))
        return dt.isoformat()

    @activity(name="Add To DateTime", category="DateTime")
    @tags("datetime", "add")
    @output("Result datetime in ISO format")
    @param(
        "unit",
        type="string",
        options=["days", "hours", "minutes", "seconds", "weeks", "months"],
        description="Time unit to add",
    )
    def add_to_datetime(
        self,
        datetime_str: str,
        value: int,
        unit: str = "days",
    ) -> str:
        """Add time to a datetime.

        :param datetime_str: Datetime string in ISO format.
        :param value: Amount to add (negative to subtract).
        :param unit: Time unit - days, hours, minutes, seconds, weeks, or months.
        :returns: Result datetime in ISO format.
        """
        dt = datetime.fromisoformat(datetime_str.replace("Z", "+00:00"))
        unit = unit.lower()

        if unit == "days":
            result = dt + timedelta(days=value)
        elif unit == "hours":
            result = dt + timedelta(hours=value)
        elif unit == "minutes":
            result = dt + timedelta(minutes=value)
        elif unit == "seconds":
            result = dt + timedelta(seconds=value)
        elif unit == "weeks":
            result = dt + timedelta(weeks=value)
        elif unit == "months":
            year = dt.year + (dt.month + value - 1) // 12
            month = (dt.month + value - 1) % 12 + 1
            day = min(
                dt.day,
                [
                    31,
                    29
                    if year % 4 == 0 and (year % 100 != 0 or year % 400 == 0)
                    else 28,
                    31,
                    30,
                    31,
                    30,
                    31,
                    31,
                    30,
                    31,
                    30,
                    31,
                ][month - 1],
            )
            result = dt.replace(year=year, month=month, day=day)
        else:
            result = dt + timedelta(days=value)

        return result.isoformat()

    @activity(name="Date Diff", category="DateTime")
    @tags("datetime", "compare")
    @output("Difference in specified unit")
    def date_diff(
        self,
        datetime1: str,
        datetime2: str,
        unit: str = "seconds",
    ) -> float:
        """Calculate the difference between two datetimes.

        :param datetime1: First datetime string in ISO format.
        :param datetime2: Second datetime string in ISO format.
        :param unit: Unit for result (seconds, minutes, hours, days).
        :returns: Difference (datetime2 - datetime1) in specified unit.
        """
        dt1 = datetime.fromisoformat(datetime1.replace("Z", "+00:00"))
        dt2 = datetime.fromisoformat(datetime2.replace("Z", "+00:00"))
        diff = dt2 - dt1

        total_seconds = diff.total_seconds()
        if unit == "seconds":
            return total_seconds
        elif unit == "minutes":
            return total_seconds / 60
        elif unit == "hours":
            return total_seconds / 3600
        elif unit == "days":
            return total_seconds / 86400
        else:
            return total_seconds

    @activity(name="Compare DateTime", category="DateTime")
    @tags("datetime", "compare")
    @output("Comparison result based on mode")
    @param(
        "mode",
        type="string",
        options=["compare", "before", "after"],
        description="Comparison mode",
    )
    def compare_datetime(
        self,
        datetime1: str,
        datetime2: str,
        mode: str = "compare",
    ) -> int | bool:
        """Compare two datetimes.

        :param datetime1: First datetime string in ISO format.
        :param datetime2: Second datetime string in ISO format.
        :param mode: Comparison mode - compare (-1/0/1), before (bool), or after (bool).
        :returns: Comparison result based on mode.
        """
        dt1 = datetime.fromisoformat(datetime1.replace("Z", "+00:00"))
        dt2 = datetime.fromisoformat(datetime2.replace("Z", "+00:00"))
        mode = mode.lower()

        if mode == "before":
            return dt1 < dt2
        elif mode == "after":
            return dt1 > dt2
        if dt1 < dt2:
            return -1
        elif dt1 > dt2:
            return 1
        return 0

    @activity(name="Is Between", category="DateTime")
    @tags("datetime", "bounds")
    @output("Datetime at the specified bound")
    @param(
        "period",
        type="string",
        options=["day", "month", "week", "year"],
        description="Period type",
    )
    @param(
        "bound",
        type="string",
        options=["start", "end"],
        description="Which bound to get",
    )
    def get_period_bounds(
        self,
        datetime_str: str,
        period: str = "day",
        bound: str = "start",
    ) -> str:
        """Get the start or end of a period.

        :param datetime_str: Datetime string in ISO format.
        :param period: Period type - day, month, week, or year.
        :param bound: Which bound - start or end.
        :returns: Datetime at the specified bound.
        """
        dt = datetime.fromisoformat(datetime_str.replace("Z", "+00:00"))
        period = period.lower()
        bound = bound.lower()

        if period == "day":
            if bound == "end":
                return dt.replace(
                    hour=23, minute=59, second=59, microsecond=999999
                ).isoformat()
            return dt.replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
        elif period == "month":
            if bound == "end":
                if dt.month == 12:
                    next_month = dt.replace(year=dt.year + 1, month=1, day=1)
                else:
                    next_month = dt.replace(month=dt.month + 1, day=1)
                last_day = next_month - timedelta(days=1)
                return last_day.replace(
                    hour=23, minute=59, second=59, microsecond=999999
                ).isoformat()
            return dt.replace(
                day=1, hour=0, minute=0, second=0, microsecond=0
            ).isoformat()
        elif period == "week":
            days_since_monday = dt.weekday()
            if bound == "end":
                end_of_week = dt + timedelta(days=6 - days_since_monday)
                return end_of_week.replace(
                    hour=23, minute=59, second=59, microsecond=999999
                ).isoformat()
            start_of_week = dt - timedelta(days=days_since_monday)
            return start_of_week.replace(
                hour=0, minute=0, second=0, microsecond=0
            ).isoformat()
        elif period == "year":
            if bound == "end":
                return dt.replace(
                    month=12, day=31, hour=23, minute=59, second=59, microsecond=999999
                ).isoformat()
            return dt.replace(
                month=1, day=1, hour=0, minute=0, second=0, microsecond=0
            ).isoformat()

        return dt.isoformat()

    @activity(name="Days In Month", category="DateTime")
    @tags("datetime", "info")
    @output("Number of days in the month")
    def days_in_month(
        self,
        datetime_str: str,
    ) -> int:
        """Get the number of days in the month.

        :param datetime_str: Datetime string in ISO format.
        :returns: Number of days in the month.
        """
        dt = datetime.fromisoformat(datetime_str.replace("Z", "+00:00"))
        if dt.month == 12:
            next_month = dt.replace(year=dt.year + 1, month=1, day=1)
        else:
            next_month = dt.replace(month=dt.month + 1, day=1)
        last_day = next_month - timedelta(days=1)
        return last_day.day

    @activity(name="Is Between", category="DateTime")
    @tags("datetime", "compare")
    @output("True if datetime is between start and end")
    def is_between(
        self,
        datetime_str: str,
        start_str: str,
        end_str: str,
        inclusive: bool = True,
    ) -> bool:
        """Check if a datetime is between two others.

        :param datetime_str: Datetime to check.
        :param start_str: Start datetime.
        :param end_str: End datetime.
        :param inclusive: Whether to include boundaries.
        :returns: True if datetime is between start and end.
        """
        dt = datetime.fromisoformat(datetime_str.replace("Z", "+00:00"))
        start = datetime.fromisoformat(start_str.replace("Z", "+00:00"))
        end = datetime.fromisoformat(end_str.replace("Z", "+00:00"))

        if inclusive:
            return start <= dt <= end
        return start < dt < end

    @activity(name="Get DateTime Part", category="DateTime")
    @tags("datetime", "extract")
    @output("The extracted part value")
    @param(
        "part",
        type="string",
        options=[
            "date",
            "time",
            "year",
            "month",
            "day",
            "hour",
            "minute",
            "second",
            "weekday",
        ],
        description="Which part to extract",
    )
    def get_datetime_part(
        self,
        datetime_str: str,
        part: str = "date",
    ) -> str | int:
        """Extract a part from a datetime.

        :param datetime_str: Datetime string in ISO format.
        :param part: Which part to extract.
        :returns: The extracted part value.
        """
        dt = datetime.fromisoformat(datetime_str.replace("Z", "+00:00"))
        part = part.lower()

        if part == "date":
            return dt.date().isoformat()
        elif part == "time":
            return dt.time().isoformat()
        elif part == "year":
            return dt.year
        elif part == "month":
            return dt.month
        elif part == "day":
            return dt.day
        elif part == "hour":
            return dt.hour
        elif part == "minute":
            return dt.minute
        elif part == "second":
            return dt.second
        elif part == "weekday":
            return dt.weekday()

        return dt.isoformat()

    @activity(name="Get Weekday", category="DateTime")
    @tags("datetime", "weekday")
    @output("Weekday number or name")
    def get_weekday(
        self,
        datetime_str: str,
        as_name: bool = False,
    ) -> int | str:
        """Get the weekday from a datetime.

        :param datetime_str: Datetime string in ISO format.
        :param as_name: Return weekday name instead of number.
        :returns: Weekday number (0=Monday) or name.
        """
        dt = datetime.fromisoformat(datetime_str.replace("Z", "+00:00"))
        if as_name:
            return dt.strftime("%A")
        return dt.weekday()

    @activity(name="Get Month Name", category="DateTime")
    @tags("datetime", "month")
    @output("Month name")
    def get_month_name(
        self,
        datetime_str: str,
    ) -> str:
        """Get the month name from a datetime.

        :param datetime_str: Datetime string in ISO format.
        :returns: Month name (January, February, etc.).
        """
        dt = datetime.fromisoformat(datetime_str.replace("Z", "+00:00"))
        return dt.strftime("%B")

    @activity(name="Is Weekend", category="DateTime")
    @tags("datetime", "weekday")
    @output("True if weekend")
    def is_weekend(
        self,
        datetime_str: str,
    ) -> bool:
        """Check if a datetime is on a weekend.

        :param datetime_str: Datetime string in ISO format.
        :returns: True if Saturday or Sunday.
        """
        dt = datetime.fromisoformat(datetime_str.replace("Z", "+00:00"))
        return dt.weekday() >= 5
