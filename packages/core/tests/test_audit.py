"""Tests for audit logging module."""

from __future__ import annotations

import json
from pathlib import Path

from rpaforge.core.audit import (
    REDACT_PATTERNS,
    RunRecord,
    StepRecord,
    redact_value,
    should_redact,
)


class TestShouldRedact:
    """Tests for should_redact function."""

    def test_should_redact_sensitive_fields(self) -> None:
        """Test that sensitive fields return True."""
        assert should_redact("password") is True
        assert should_redact("token") is True
        assert should_redact("secret_key") is True

    def test_should_redact_non_sensitive_fields(self) -> None:
        """Test that non-sensitive fields return False."""
        assert should_redact("name") is False
        assert should_redact("username") is False
        assert should_redact("email") is False

    def test_should_redact_partial_match(self) -> None:
        """Test partial matching in field names."""
        assert should_redact("myPassword") is True
        assert should_redact("api_token") is True
        assert should_redact("credential_id") is True
        assert should_redact("encryption_key") is True
        assert should_redact("user_name") is False


class TestRedactValue:
    """Tests for redact_value function."""

    def test_redact_value_nested_dict(self) -> None:
        """Test redacting nested dictionaries."""
        data = {
            "username": "alice",
            "password": "secret123",
            "nested": {"secret": "hidden", "name": "bob"},
        }
        result = redact_value(data)
        assert result["username"] == "alice"
        assert result["password"] == "[REDACTED]"
        assert result["nested"]["secret"] == "[REDACTED]"
        assert result["nested"]["name"] == "bob"

    def test_redact_value_list(self) -> None:
        """Test redacting values in a list."""
        data = [
            {"password": "secret1"},
            {"token": "token1"},
            {"name": "alice"},
        ]
        result = redact_value(data)
        assert result[0]["password"] == "[REDACTED]"
        assert result[1]["token"] == "[REDACTED]"
        assert result[2]["name"] == "alice"

    def test_redact_value_tuple(self) -> None:
        """Test redacting values in a tuple."""
        data = (
            {"password": "secret1"},
            {"token": "token1"},
        )
        result = redact_value(data)
        assert isinstance(result, list)
        assert result[0]["password"] == "[REDACTED]"
        assert result[1]["token"] == "[REDACTED]"

    def test_redact_value_plain_value(self) -> None:
        """Test that plain values return unchanged."""
        assert redact_value("hello") == "hello"
        assert redact_value(42) == 42
        assert redact_value(True) is True
        assert redact_value(None) is None

    def test_redact_value_deeply_nested(self) -> None:
        """Test deeply nested structures."""
        data = {
            "level1": {
                "level2": {
                    "data": {"credential": "hidden_value"},
                    "password": "deep_secret",
                }
            }
        }
        result = redact_value(data)
        assert result["level1"]["level2"]["password"] == "[REDACTED]"
        assert result["level1"]["level2"]["data"]["credential"] == "[REDACTED]"


class TestStepRecord:
    """Tests for StepRecord class."""

    def test_to_dict_redacts_sensitive_fields(self) -> None:
        """Test that to_dict redacts sensitive inputs and snapshots."""
        record = StepRecord(
            activity="WebUI.Login",
            node_id="node_1",
            started_at="2026-06-30T10:00:00",
            duration_ms=100,
            status="success",
            inputs={"username": "alice", "password": "secret123"},
            variable_snapshot={"session_token": "abc", "user_name": "bob"},
        )
        result = record.to_dict()
        assert result["inputs"]["password"] == "[REDACTED]"
        assert result["variable_snapshot"]["session_token"] == "[REDACTED]"
        assert result["inputs"]["username"] == "alice"
        assert result["variable_snapshot"]["user_name"] == "bob"

    def test_to_dict_keeps_non_sensitive_fields(self) -> None:
        """Test that non-sensitive fields remain intact."""
        record = StepRecord(
            activity="WebUI.Click",
            node_id="node_2",
            started_at="2026-06-30T10:00:00",
            duration_ms=50,
            status="success",
            inputs={"selector": "button"},
            output="clicked",
            error=None,
            variable_snapshot={},
        )
        result = record.to_dict()
        assert result["activity"] == "WebUI.Click"
        assert result["node_id"] == "node_2"
        assert result["duration_ms"] == 50
        assert result["status"] == "success"
        assert result["inputs"]["selector"] == "button"
        assert result["output"] == "clicked"

    def test_to_dict_empty_inputs_and_snapshot(self) -> None:
        """Test to_dict with empty inputs and snapshot."""
        record = StepRecord(
            activity="Log",
            node_id="node_3",
            started_at="2026-06-30T10:00:00",
            duration_ms=10,
            status="success",
        )
        result = record.to_dict()
        assert result["inputs"] == {}
        assert result["variable_snapshot"] == {}


class TestRunRecord:
    """Tests for RunRecord class."""

    def test_to_dict_includes_steps_as_dicts(self) -> None:
        """Test that to_dict converts steps to dicts."""
        step1 = StepRecord(
            activity="Step1",
            node_id="node_1",
            started_at="2026-06-30T10:00:00",
            duration_ms=100,
            status="success",
        )
        step2 = StepRecord(
            activity="Step2",
            node_id="node_2",
            started_at="2026-06-30T10:00:01",
            duration_ms=200,
            status="success",
        )
        record = RunRecord(
            run_id="run_123",
            process_name="Test Process",
            started_at="2026-06-30T10:00:00",
            status="success",
            steps=[step1, step2],
        )
        result = record.to_dict()
        assert len(result["steps"]) == 2
        assert result["steps"][0]["activity"] == "Step1"
        assert result["steps"][1]["activity"] == "Step2"

    def test_to_dict_redacts_sensitive_fields_in_all_steps(self) -> None:
        """Test that all steps have sensitive fields redacted."""
        step1 = StepRecord(
            activity="Login",
            node_id="node_1",
            started_at="2026-06-30T10:00:00",
            duration_ms=100,
            status="success",
            inputs={"password": "secret1"},
            variable_snapshot={"token": "abc"},
        )
        step2 = StepRecord(
            activity="Auth",
            node_id="node_2",
            started_at="2026-06-30T10:00:01",
            duration_ms=50,
            status="success",
            inputs={"credential": "cred1"},
        )
        record = RunRecord(
            run_id="run_456",
            process_name="Auth Process",
            started_at="2026-06-30T10:00:00",
            status="success",
            steps=[step1, step2],
        )
        result = record.to_dict()
        assert result["steps"][0]["inputs"]["password"] == "[REDACTED]"
        assert result["steps"][0]["variable_snapshot"]["token"] == "[REDACTED]"
        assert result["steps"][1]["inputs"]["credential"] == "[REDACTED]"


class TestJSONAuditLogger:
    """Tests for JSON audit logging via tempfile."""

    def test_append_and_read_run_record(self, tmp_path: Path) -> None:
        """Test appending and reading a RunRecord via JSON file."""
        step_record = StepRecord(
            activity="Test Activity",
            node_id="node_1",
            started_at="2026-06-30T10:00:00",
            duration_ms=100,
            status="success",
            inputs={"password": "secret"},
            variable_snapshot={"token": "abc"},
        )
        run_record = RunRecord(
            run_id="run_test_123",
            process_name="Test Run",
            started_at="2026-06-30T10:00:00",
            status="success",
            steps=[step_record],
        )

        # Save to file
        filepath = tmp_path / "test_run.json"
        with open(filepath, "w", encoding="utf-8") as f:
            json.dump(run_record.to_dict(), f, indent=2)

        # Read back
        with open(filepath, encoding="utf-8") as f:
            data = json.load(f)

        assert data["run_id"] == "run_test_123"
        assert data["process_name"] == "Test Run"
        assert data["steps"][0]["inputs"]["password"] == "[REDACTED]"
        assert data["steps"][0]["variable_snapshot"]["token"] == "[REDACTED]"

    def test_redact_patterns_constant(self) -> None:
        """Test that REDACT_PATTERNS contains expected values."""
        expected = {"password", "secret", "token", "credential", "key"}
        assert expected == REDACT_PATTERNS
