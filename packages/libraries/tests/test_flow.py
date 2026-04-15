"""Tests for RPAForge Flow Library."""

import time

import pytest

from rpaforge_libraries.Flow import Flow


class TestFlowLibrary:
    """Tests for Flow library."""

    def setup_method(self):
        """Set up test fixtures."""
        self.library = Flow()

    def test_delay(self):
        """Test delay function."""
        start = time.time()
        result = self.library.delay(0.1, unit="seconds")
        elapsed = time.time() - start
        assert result >= 0.1
        assert elapsed >= 0.1

    def test_delay_milliseconds(self):
        """Test delay in milliseconds."""
        start = time.time()
        result = self.library.delay(100, unit="milliseconds")
        elapsed = time.time() - start
        assert result >= 0.1
        assert elapsed >= 0.1

    def test_delay_until_past_raises(self):
        """Test delay_until with past time raises error."""
        with pytest.raises(ValueError):
            self.library.delay_until("2020-01-01T00:00:00")

    def test_comment(self):
        """Test comment function."""
        result = self.library.comment("This is a comment")
        assert result == "This is a comment"

    def test_log_message(self):
        """Test log message function."""
        result = self.library.log_message("Test message", level="INFO")
        assert result == "Test message"

    def test_log_message_debug(self):
        """Test log message at debug level."""
        result = self.library.log_message("Debug message", level="DEBUG")
        assert result == "Debug message"

    def test_log_message_warning(self):
        """Test log message at warning level."""
        result = self.library.log_message("Warning message", level="WARNING")
        assert result == "Warning message"

    def test_log_message_error(self):
        """Test log message at error level."""
        result = self.library.log_message("Error message", level="ERROR")
        assert result == "Error message"

    def test_timestamp(self):
        """Test getting timestamp."""
        result = self.library.timestamp()
        assert isinstance(result, float)
        assert result > 0

    def test_elapsed_time(self):
        """Test calculating elapsed time."""
        start = time.time()
        time.sleep(0.1)
        elapsed = self.library.elapsed_time(start)
        assert elapsed >= 0.1

    def test_measure_duration(self):
        """Test measuring duration."""
        start = time.time()
        time.sleep(0.1)
        duration = self.library.measure_duration(start)
        assert duration["seconds"] >= 0.1
        assert duration["milliseconds"] >= 100
        assert duration["minutes"] > 0
        assert duration["hours"] > 0

    def test_wait_for_condition_success(self):
        """Test wait for condition - success."""
        counter = [0]

        def condition():
            counter[0] += 1
            return counter[0] >= 3

        result = self.library.wait_for_condition(
            condition, timeout=5.0, check_interval=0.01
        )
        assert result is True

    def test_wait_for_condition_timeout(self):
        """Test wait for condition - timeout."""
        result = self.library.wait_for_condition(
            lambda: False, timeout=0.5, check_interval=0.1
        )
        assert result is False
