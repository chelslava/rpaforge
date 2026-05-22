# DateTime Library

## Overview

DateTime is a date and time operations library. It provides comprehensive utilities for datetime creation, formatting, parsing, comparisons, arithmetic operations, and period boundary calculations.

## Installation

No additional dependencies required.

## Keywords

### get_datetime
**Description:** Get current datetime or create a custom one.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| mode | str | No | Mode: 'now' for current datetime, 'create' for custom (default: 'now') |
| year | int | No | Year (for create mode, default: 2000) |
| month | int | No | Month 1-12 (for create mode, default: 1) |
| day | int | No | Day 1-31 (for create mode, default: 1) |
| hour | int | No | Hour 0-23 (for create mode, default: 0) |
| minute | int | No | Minute 0-59 (for create mode, default: 0) |
| second | int | No | Second 0-59 (for create mode, default: 0) |
| return_type | str | No | What to return: 'datetime', 'date', or 'time' (default: 'datetime') |

**Returns:** str - DateTime value in ISO format

**Example:**
```python
dt = DateTime()
now = dt.get_datetime()
custom = dt.get_datetime(mode="create", year=2024, month=6, day=15, hour=10, minute=30, second=0)
date_only = dt.get_datetime(return_type="date")
time_only = dt.get_datetime(return_type="time")
```

### format_datetime
**Description:** Format a datetime string to a custom format.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| datetime_str | str | Yes | Datetime string in ISO format |
| format_string | str | No | Python strftime format string (default: '%Y-%m-%d %H:%M:%S') |

**Returns:** str - Formatted datetime string

**Example:**
```python
dt = DateTime()
formatted = dt.format_datetime("2024-01-15T10:30:00")
formatted = dt.format_datetime("2024-01-15T10:30:00", "%B %d, %Y %I:%M %p")
# Output: "January 15, 2024 10:30 AM"
```

### parse_datetime
**Description:** Parse a datetime string to ISO format.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| datetime_str | str | Yes | Datetime string to parse |
| format_string | str \| None | No | Expected format (None for auto-detect) |

**Returns:** str - Datetime in ISO format

**Example:**
```python
dt = DateTime()
dt_str = dt.parse_datetime("2024-01-15 10:30:00")
dt_str = dt.parse_datetime("01/15/2024 10:30:00", "%m/%d/%Y %H:%M:%S")
```

### add_to_datetime
**Description:** Add time to a datetime.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| datetime_str | str | Yes | Datetime string in ISO format |
| value | int | Yes | Amount to add (negative to subtract) |
| unit | str | No | Time unit: 'days', 'hours', 'minutes', 'seconds', 'weeks', 'months' (default: 'days') |

**Returns:** str - Result datetime in ISO format

**Example:**
```python
dt = DateTime()
dt_str = dt.add_to_datetime("2024-01-15T10:30:00", value=7, unit="days")
dt_str = dt.add_to_datetime("2024-01-15T10:30:00", value=-30, unit="minutes")
dt_str = dt.add_to_datetime("2024-01-15T10:30:00", value=3, unit="months")
```

### date_diff
**Description:** Calculate the difference between two datetimes.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| datetime1 | str | Yes | First datetime string in ISO format |
| datetime2 | str | Yes | Second datetime string in ISO format |
| unit | str | No | Unit for result: 'seconds', 'minutes', 'hours', 'days' (default: 'seconds') |

**Returns:** float - Difference (datetime2 - datetime1) in specified unit

**Example:**
```python
dt = DateTime()
diff = dt.date_diff("2024-01-15T10:00:00", "2024-01-15T12:30:00", unit="minutes")
# Returns 150.0
```

### compare_datetime
**Description:** Compare two datetimes.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| datetime1 | str | Yes | First datetime string in ISO format |
| datetime2 | str | Yes | Second datetime string in ISO format |
| mode | str | No | Comparison mode: 'compare' (-1/0/1), 'before' (bool), or 'after' (bool) (default: 'compare') |

**Returns:** int \| bool - Comparison result based on mode

**Example:**
```python
dt = DateTime()
result = dt.compare_datetime("2024-01-15T10:00:00", "2024-01-16T10:00:00", mode="compare")
# Returns -1 (first is earlier)
is_before = dt.compare_datetime("2024-01-15T10:00:00", "2024-01-16T10:00:00", mode="before")
# Returns True
is_after = dt.compare_datetime("2024-01-15T10:00:00", "2024-01-14T10:00:00", mode="after")
# Returns True
```

### get_period_bounds
**Description:** Get the start or end of a period.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| datetime_str | str | Yes | Datetime string in ISO format |
| period | str | No | Period type: 'day', 'month', 'week', or 'year' (default: 'day') |
| bound | str | No | Which bound: 'start' or 'end' (default: 'start') |

**Returns:** str - Datetime at the specified bound

**Example:**
```python
dt = DateTime()
start_of_day = dt.get_period_bounds("2024-01-15T10:30:00", period="day", bound="start")
end_of_month = dt.get_period_bounds("2024-01-15T10:30:00", period="month", bound="end")
start_of_week = dt.get_period_bounds("2024-01-15T10:30:00", period="week", bound="start")
```

### days_in_month
**Description:** Get the number of days in the month.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| datetime_str | str | Yes | Datetime string in ISO format |

**Returns:** int - Number of days in the month

**Example:**
```python
dt = DateTime()
days = dt.days_in_month("2024-02-15T10:30:00")
# Returns 29 (Leap year)
```

### is_between
**Description:** Check if a datetime is between two others.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| datetime_str | str | Yes | Datetime to check |
| start_str | str | Yes | Start datetime |
| end_str | str | Yes | End datetime |
| inclusive | bool | No | Whether to include boundaries (default: True) |

**Returns:** bool - True if datetime is between start and end

**Example:**
```python
dt = DateTime()
is_between = dt.is_between("2024-01-15T10:30:00", "2024-01-15T09:00:00", "2024-01-15T12:00:00")
# Returns True
```

### get_datetime_part
**Description:** Extract a part from a datetime.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| datetime_str | str | Yes | Datetime string in ISO format |
| part | str | No | Which part to extract: 'date', 'time', 'year', 'month', 'day', 'hour', 'minute', 'second', 'weekday' (default: 'date') |

**Returns:** str \| int - The extracted part value

**Example:**
```python
dt = DateTime()
year = dt.get_datetime_part("2024-01-15T10:30:00", part="year")
month = dt.get_datetime_part("2024-01-15T10:30:00", part="month")
weekday = dt.get_datetime_part("2024-01-15T10:30:00", part="weekday")
```

### get_weekday
**Description:** Get the weekday from a datetime.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| datetime_str | str | Yes | Datetime string in ISO format |
| as_name | bool | No | Return weekday name instead of number (default: False) |

**Returns:** int \| str - Weekday number (0=Monday) or name

**Example:**
```python
dt = DateTime()
day_num = dt.get_weekday("2024-01-15T10:30:00")  # Returns 0 (Monday)
day_name = dt.get_weekday("2024-01-15T10:30:00", as_name=True)  # Returns "Monday"
```

### get_month_name
**Description:** Get the month name from a datetime.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| datetime_str | str | Yes | Datetime string in ISO format |

**Returns:** str - Month name (January, February, etc.)

**Example:**
```python
dt = DateTime()
month = dt.get_month_name("2024-01-15T10:30:00")  # Returns "January"
```

### is_weekend
**Description:** Check if a datetime is on a weekend.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| datetime_str | str | Yes | Datetime string in ISO format |

**Returns:** bool - True if Saturday or Sunday

**Example:**
```python
dt = DateTime()
is_weekend = dt.is_weekend("2024-01-15T10:30:00")  # Monday, returns False
is_weekend = dt.is_weekend("2024-01-20T10:30:00")  # Saturday, returns True
```

## Common Use Cases

- Generate timestamps for file naming
- Calculate time differences
- Validate date ranges
- Schedule future tasks
- Format dates for reports
- Parse user-input dates
- Process historical data
- Working with ISO 8601 timestamps
- Business day calculations
- Period boundary determination
