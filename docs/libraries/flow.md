# Flow Library

## Overview

Flow is a flow control operations library. It provides utilities for delays, condition waiting, logging, timestamping, and elapsed time measurement to control the execution flow of automation processes.

## Installation

No additional dependencies required.

## Keywords

### delay
**Description:** Pause execution for a specified duration.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| duration | float | Yes | Duration to wait |
| unit | str | No | Time unit: 'seconds' or 'milliseconds' |

**Returns:** float - The actual time waited in seconds

**Example:**
```python
flow = Flow()
flow.delay(1.5)  # Wait 1.5 seconds
flow.delay(500, unit="milliseconds")  # Wait 500ms
```

### delay_until
**Description:** Pause execution until a specific datetime.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| datetime_str | str | Yes | Target datetime in ISO format |
| check_interval | float | No | How often to check the time (seconds, default: 1.0) |

**Returns:** float - The actual time waited in seconds

**Example:**
```python
flow = Flow()
flow.delay_until("2024-01-15T10:00:00")
```

### wait_for_condition
**Description:** Wait until a condition is true or timeout.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| condition | callable | Yes | Callable that returns True when condition is met |
| timeout | float | No | Maximum time to wait in seconds (default: 60.0) |
| check_interval | float | No | How often to check the condition (seconds, default: 0.5) |

**Returns:** bool - True if condition was met, False if timeout

**Example:**
```python
flow = Flow()
condition_met = flow.wait_for_condition(
    condition=lambda: some_variable > 100,
    timeout=30,
    check_interval=1
)
```

### comment
**Description:** Add a comment to the process (does nothing at runtime).

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| text | str | Yes | Comment text |

**Returns:** str - The comment text

**Example:**
```python
flow = Flow()
flow.comment("Start data collection phase")
flow.comment("Waiting for user input - may require manual intervention")
```

### log_message
**Description:** Log a message at the specified level.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| message | str | Yes | Message to log |
| level | str | No | Log level: DEBUG, INFO, WARNING, ERROR |

**Returns:** str - The logged message

**Example:**
```python
flow = Flow()
flow.log_message("Starting process", level="INFO")
flow.log_message("Warning condition detected", level="WARNING")
flow.log_message("Error occurred", level="ERROR")
```

### timestamp
**Description:** Get the current Unix timestamp.

**Returns:** float - Current time as Unix timestamp

**Example:**
```python
flow = Flow()
start_time = flow.timestamp()
# ... operations ...
elapsed = flow.elapsed_time(start_time)
```

### elapsed_time
**Description:** Calculate elapsed time from a start timestamp.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| start_timestamp | float | Yes | Start time as Unix timestamp |

**Returns:** float - Elapsed time in seconds

**Example:**
```python
flow = Flow()
start = flow.timestamp()
# ... work ...
elapsed = flow.elapsed_time(start)
```

### measure_duration
**Description:** Get detailed duration from a start timestamp.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| start_timestamp | float | Yes | Start time as Unix timestamp |

**Returns:** dict[str, float] - Dictionary with duration breakdown

**Example:**
```python
flow = Flow()
start = flow.timestamp()
# ... work ...
duration = flow.measure_duration(start)
print(f"Elapsed: {duration['seconds']}s")
print(f"Elapsed: {duration['milliseconds']}ms")
```

## Common Use Cases

- Add pauses between automation steps
- Wait for system resources to become available
- Implement retry loops with delays
- Schedule future execution
- Log process progress and debugging info
- Track execution time for performance monitoring
- Create time-based conditions
- Control automation speed for UI interaction
- Implement wait-for-state patterns
- Measure and report execution durations
