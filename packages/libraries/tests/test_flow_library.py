"""Tests for Flow library."""

from __future__ import annotations

import time

import pytest


class TestFlowImport:
    """Tests for Flow library import and metadata."""

    def test_import_library(self):
        from rpaforge_libraries.Flow import Flow

        lib = Flow()
        assert lib is not None

    def test_library_is_decorated(self):
        from rpaforge_libraries.Flow import Flow

        assert hasattr(Flow, "_library_meta")
        assert Flow._library_name == "Flow"


class TestFlowKeywords:
    """Tests for Flow keyword signatures."""

    def test_keywords_exist(self):
        from rpaforge_libraries.Flow import Flow

        lib = Flow()

        keywords = [
            "delay",
            "delay_until",
            "wait_for_condition",
            "comment",
            "log_message",
            "timestamp",
            "elapsed_time",
            "measure_duration",
        ]

        for keyword in keywords:
            assert hasattr(lib, keyword), f"Missing keyword: {keyword}"


class TestDelay:
    """Tests for delay method."""

    def test_delay_seconds(self):
        from rpaforge_libraries.Flow import Flow

        lib = Flow()
        elapsed = lib.delay(0.05, unit="seconds")
        assert elapsed >= 0.05

    def test_delay_milliseconds(self):
        from rpaforge_libraries.Flow import Flow

        lib = Flow()
        elapsed = lib.delay(50, unit="milliseconds")
        assert elapsed >= 0.04

    def test_delay_returns_float(self):
        from rpaforge_libraries.Flow import Flow

        lib = Flow()
        result = lib.delay(0.01)
        assert isinstance(result, float)


class TestDelayUntil:
    """Tests for delay_until method."""

    def test_delay_until_future(self):
        from datetime import datetime, timedelta

        from rpaforge_libraries.Flow import Flow

        lib = Flow()
        target = datetime.now() + timedelta(seconds=0.1)
        elapsed = lib.delay_until(target.isoformat(), check_interval=0.05)
        assert elapsed >= 0.05

    def test_delay_until_past_raises_value_error(self):
        from rpaforge_libraries.Flow import Flow

        lib = Flow()
        with pytest.raises(ValueError, match="in the past"):
            lib.delay_until("2000-01-01T00:00:00")


class TestWaitForCondition:
    """Tests for wait_for_condition method."""

    def test_condition_met_immediately(self):
        from rpaforge_libraries.Flow import Flow

        lib = Flow()
        result = lib.wait_for_condition(lambda: True, timeout=1.0, check_interval=0.1)
        assert result is True

    def test_condition_timeout(self):
        from rpaforge_libraries.Flow import Flow

        lib = Flow()
        result = lib.wait_for_condition(lambda: False, timeout=0.2, check_interval=0.05)
        assert result is False

    def test_condition_met_after_delay(self):
        from rpaforge_libraries.Flow import Flow

        lib = Flow()
        start = time.time()
        flag = {"ready": False}

        def set_flag():
            if time.time() - start > 0.1:
                flag["ready"] = True
            return flag["ready"]

        result = lib.wait_for_condition(set_flag, timeout=1.0, check_interval=0.05)
        assert result is True

    def test_condition_exception_handled(self):
        from rpaforge_libraries.Flow import Flow

        lib = Flow()

        call_count = {"n": 0}

        def flaky():
            call_count["n"] += 1
            if call_count["n"] < 3:
                raise RuntimeError("not ready")
            return True

        result = lib.wait_for_condition(flaky, timeout=1.0, check_interval=0.05)
        assert result is True


class TestComment:
    """Tests for comment method."""

    def test_comment_returns_text(self):
        from rpaforge_libraries.Flow import Flow

        lib = Flow()
        result = lib.comment("This is a comment")
        assert result == "This is a comment"

    def test_comment_empty_string(self):
        from rpaforge_libraries.Flow import Flow

        lib = Flow()
        result = lib.comment("")
        assert result == ""


class TestLogMessage:
    """Tests for log_message method."""

    def test_log_info(self):
        from rpaforge_libraries.Flow import Flow

        lib = Flow()
        result = lib.log_message("Test info message", level="INFO")
        assert result == "Test info message"

    def test_log_debug(self):
        from rpaforge_libraries.Flow import Flow

        lib = Flow()
        result = lib.log_message("Debug message", level="DEBUG")
        assert result == "Debug message"

    def test_log_warning(self):
        from rpaforge_libraries.Flow import Flow

        lib = Flow()
        result = lib.log_message("Warning message", level="WARNING")
        assert result == "Warning message"

    def test_log_error(self):
        from rpaforge_libraries.Flow import Flow

        lib = Flow()
        result = lib.log_message("Error message", level="ERROR")
        assert result == "Error message"

    def test_log_unknown_level_defaults_to_info(self):
        from rpaforge_libraries.Flow import Flow

        lib = Flow()
        result = lib.log_message("Some message", level="UNKNOWN")
        assert result == "Some message"

    def test_log_returns_message(self):
        from rpaforge_libraries.Flow import Flow

        lib = Flow()
        msg = "hello log"
        assert lib.log_message(msg) == msg


class TestTimestamp:
    """Tests for timestamp method."""

    def test_timestamp_returns_float(self):
        from rpaforge_libraries.Flow import Flow

        lib = Flow()
        result = lib.timestamp()
        assert isinstance(result, float)

    def test_timestamp_is_recent(self):
        from rpaforge_libraries.Flow import Flow

        lib = Flow()
        before = time.time()
        result = lib.timestamp()
        after = time.time()
        assert before <= result <= after


class TestElapsedTime:
    """Tests for elapsed_time method."""

    def test_elapsed_time_positive(self):
        from rpaforge_libraries.Flow import Flow

        lib = Flow()
        start = time.time() - 1.0
        elapsed = lib.elapsed_time(start)
        assert elapsed >= 1.0

    def test_elapsed_time_returns_float(self):
        from rpaforge_libraries.Flow import Flow

        lib = Flow()
        result = lib.elapsed_time(time.time())
        assert isinstance(result, float)

    def test_elapsed_time_small(self):
        from rpaforge_libraries.Flow import Flow

        lib = Flow()
        start = time.time()
        elapsed = lib.elapsed_time(start)
        assert 0.0 <= elapsed < 1.0


class TestMeasureDuration:
    """Tests for measure_duration method."""

    def test_measure_duration_returns_dict(self):
        from rpaforge_libraries.Flow import Flow

        lib = Flow()
        result = lib.measure_duration(time.time() - 2.0)
        assert isinstance(result, dict)

    def test_measure_duration_keys(self):
        from rpaforge_libraries.Flow import Flow

        lib = Flow()
        result = lib.measure_duration(time.time() - 1.0)
        assert "seconds" in result
        assert "milliseconds" in result
        assert "minutes" in result
        assert "hours" in result

    def test_measure_duration_values_consistent(self):
        from rpaforge_libraries.Flow import Flow

        lib = Flow()
        start = time.time() - 60.0
        result = lib.measure_duration(start)
        assert result["milliseconds"] == pytest.approx(
            result["seconds"] * 1000, rel=0.01
        )
        assert result["minutes"] == pytest.approx(result["seconds"] / 60, rel=0.01)
        assert result["hours"] == pytest.approx(result["seconds"] / 3600, rel=0.01)

    def test_measure_duration_seconds_positive(self):
        from rpaforge_libraries.Flow import Flow

        lib = Flow()
        result = lib.measure_duration(time.time() - 5.0)
        assert result["seconds"] >= 5.0
