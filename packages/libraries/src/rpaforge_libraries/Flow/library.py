"""RPAForge Flow Library - Flow control operations."""

from __future__ import annotations

import logging
import time
from typing import TYPE_CHECKING

from rpaforge.core.activity import activity, library, output, param, tags

if TYPE_CHECKING:
    pass

logger = logging.getLogger("rpaforge.flow")


@library(name="Flow", category="Control", icon="⚡")
class Flow:
    """Flow control operations library."""

    @activity(name="Delay", category="Flow")
    @tags("flow", "delay", "wait")
    @output("The actual time waited in seconds")
    @param(
        "unit",
        type="string",
        options=["seconds", "milliseconds"],
        description="Time unit",
    )
    def delay(
        self,
        duration: float,
        unit: str = "seconds",
    ) -> float:
        """Pause execution for a specified duration.

        :param duration: Duration to wait.
        :param unit: Time unit - seconds or milliseconds.
        :returns: The actual time waited in seconds.
        """
        if unit.lower() == "milliseconds":
            seconds = duration / 1000.0
        else:
            seconds = duration

        start = time.time()
        time.sleep(seconds)
        elapsed = time.time() - start
        logger.info(f"Delayed for {elapsed:.3f} seconds")
        return elapsed

    @activity(name="Delay Until", category="Flow")
    @tags("flow", "delay", "wait")
    @output("The actual time waited in seconds")
    def delay_until(
        self,
        datetime_str: str,
        check_interval: float = 1.0,
    ) -> float:
        """Pause execution until a specific datetime.

        :param datetime_str: Target datetime in ISO format.
        :param check_interval: How often to check the time (seconds).
        :returns: The actual time waited in seconds.
        :raises ValueError: If the target time is in the past.
        """
        from datetime import datetime

        target = datetime.fromisoformat(datetime_str.replace("Z", "+00:00"))
        now = datetime.now(target.tzinfo) if target.tzinfo else datetime.now()

        if target <= now:
            raise ValueError(f"Target time {datetime_str} is in the past")

        delta = (target - now).total_seconds()
        start = time.time()

        while True:
            now = datetime.now(target.tzinfo) if target.tzinfo else datetime.now()
            if now >= target:
                break
            remaining = (target - now).total_seconds()
            time.sleep(min(check_interval, remaining))

        elapsed = time.time() - start
        logger.info(f"Delayed until {datetime_str} (waited {elapsed:.3f} seconds)")
        return elapsed

    @activity(name="Wait For Condition", category="Flow")
    @tags("flow", "wait", "condition")
    @output("True if condition was met, False if timeout")
    @param(
        "condition",
        type="expression",
        description="Python expression that returns True when condition is met",
    )
    def wait_for_condition(
        self,
        condition: callable,
        timeout: float = 60.0,
        check_interval: float = 0.5,
    ) -> bool:
        """Wait until a condition is true or timeout.

        :param condition: Callable that returns True when condition is met.
        :param timeout: Maximum time to wait in seconds.
        :param check_interval: How often to check the condition (seconds).
        :returns: True if condition was met, False if timeout.
        """
        start = time.time()
        while time.time() - start < timeout:
            try:
                if condition():
                    elapsed = time.time() - start
                    logger.info(f"Condition met after {elapsed:.3f} seconds")
                    return True
            except Exception as e:
                logger.debug(f"Condition check failed: {e}")

            time.sleep(check_interval)

        logger.info(f"Condition not met after {timeout} seconds (timeout)")
        return False

    @activity(name="Comment", category="Flow")
    @tags("flow", "comment", "documentation")
    @output("The comment text")
    def comment(
        self,
        text: str,
    ) -> str:
        """Add a comment to the process (does nothing at runtime).

        :param text: Comment text.
        :returns: The comment text.
        """
        logger.info(f"Comment: {text}")
        return text

    @activity(name="Log Message", category="Flow")
    @tags("flow", "log", "debug")
    @output("The logged message")
    def log_message(
        self,
        message: str,
        level: str = "INFO",
    ) -> str:
        """Log a message at the specified level.

        :param message: Message to log.
        :param level: Log level (DEBUG, INFO, WARNING, ERROR).
        :returns: The logged message.
        """
        level = level.upper()
        if level == "DEBUG":
            logger.debug(message)
        elif level == "INFO":
            logger.info(message)
        elif level == "WARNING":
            logger.warning(message)
        elif level == "ERROR":
            logger.error(message)
        else:
            logger.info(message)
        return message

    @activity(name="Timestamp", category="Flow")
    @tags("flow", "time", "timestamp")
    @output("Current time as Unix timestamp")
    def timestamp(self) -> float:
        """Get the current Unix timestamp.

        :returns: Current time as Unix timestamp (seconds since epoch).
        """
        return time.time()

    @activity(name="Elapsed Time", category="Flow")
    @tags("flow", "time", "measure")
    @output("Elapsed time in seconds")
    def elapsed_time(
        self,
        start_timestamp: float,
    ) -> float:
        """Calculate elapsed time from a start timestamp.

        :param start_timestamp: Start time as Unix timestamp.
        :returns: Elapsed time in seconds.
        """
        return time.time() - start_timestamp

    @activity(name="Measure Duration", category="Flow")
    @tags("flow", "time", "measure")
    @output("Dictionary with duration breakdown")
    def measure_duration(
        self,
        start_timestamp: float,
    ) -> dict[str, float]:
        """Get detailed duration from a start timestamp.

        :param start_timestamp: Start time as Unix timestamp.
        :returns: Dictionary with duration breakdown.
        """
        elapsed = time.time() - start_timestamp
        return {
            "seconds": elapsed,
            "milliseconds": elapsed * 1000,
            "minutes": elapsed / 60,
            "hours": elapsed / 3600,
        }
