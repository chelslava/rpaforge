"""Tests for secret masking in runner event logs (issue #907)."""

from __future__ import annotations

import io
import json
from pathlib import Path
from typing import TextIO

import pytest

from rpaforge.core.secrets import (
    REDACTED_PLACEHOLDER,
    SecretMasker,
    get_masker,
    is_secret_name,
    reset_masker,
)
from rpaforge.runner.logging import EventLogger, TeeEventLogger

SECRET = "s3cr3t-value-42"


@pytest.fixture(autouse=True)
def _clean_masker(monkeypatch: pytest.MonkeyPatch) -> None:
    """Isolate the process-wide masker, its env seed and the banner flag."""
    monkeypatch.delenv("RPAFORGE_LOG_UNMASKED", raising=False)
    reset_masker()
    yield
    reset_masker()


def _ndjson_records(sink: TextIO) -> list[dict]:
    return [json.loads(line) for line in sink.getvalue().splitlines() if line]


def test_registered_secret_masked_in_console_line() -> None:
    sink = io.StringIO()
    logger = EventLogger(stream=sink)
    get_masker().register_secret(SECRET)
    logger.emit("activity_finished", activity="HTTP", error=f"401 echo {SECRET}")
    out = sink.getvalue()
    assert SECRET not in out
    assert REDACTED_PLACEHOLDER in out


def test_registered_secret_masked_in_ndjson_record() -> None:
    sink = io.StringIO()
    logger = EventLogger(stream=sink, ndjson=True)
    get_masker().register_secret(SECRET)
    logger.emit("activity_finished", activity="HTTP", error=f"401 echo {SECRET}")
    record = _ndjson_records(sink)[0]
    assert record["event"] == "activity_finished"
    assert SECRET not in json.dumps(record)
    assert REDACTED_PLACEHOLDER in record["error"]


def test_bearer_token_pattern_masked() -> None:
    sink = io.StringIO()
    EventLogger(stream=sink, ndjson=True).emit(
        "http_error", message="401 for Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpX"
    )
    out = sink.getvalue()
    assert "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpX" not in out
    assert "Bearer [REDACTED]" in out


def test_password_assignment_pattern_masked() -> None:
    sink = io.StringIO()
    EventLogger(stream=sink, ndjson=True).emit(
        "log_message", message="connected with password='hunter2secret'"
    )
    out = sink.getvalue()
    assert "hunter2secret" not in out
    assert "password=" in out


def test_url_userinfo_password_masked() -> None:
    sink = io.StringIO()
    EventLogger(stream=sink, ndjson=True).emit(
        "db_error",
        message="connect failed for postgres://admin:Sup3rPassw0rd@db.local/app",
    )
    out = sink.getvalue()
    assert "Sup3rPassw0rd" not in out
    assert "postgres://admin:" in out


def test_long_ids_are_not_over_masked() -> None:
    sink = io.StringIO()
    sha256 = "a1b2c3d4" * 8
    run_id = "r-20261118-abcdef0123456789"
    uuid = "550e8400-e29b-41d4-a716-446655440000"
    blob = "TWFpbmJvb2R5QmxvYktleTEyMzQ1Njc4OTA9PGJhc2U2ND4="
    EventLogger(stream=sink, ndjson=True).emit(
        "run_finished",
        commit_sha=sha256,
        run_id=run_id,
        correlation_id=uuid,
        artifact_blob=blob,
    )
    out = sink.getvalue()
    assert sha256 in out
    assert run_id in out
    assert uuid in out
    assert blob in out


def test_unmasked_escape_hatch(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    monkeypatch.setenv("RPAFORGE_LOG_UNMASKED", "1")
    sink = io.StringIO()
    logger = EventLogger(stream=sink, ndjson=True)
    logger.emit("activity_finished", activity="HTTP", error=f"401 echo {SECRET}")
    logger.emit("activity_finished", activity="HTTP", error=f"401 echo {SECRET}")
    out = sink.getvalue()
    assert SECRET in out
    captured = capsys.readouterr()
    assert captured.err.count("WARNING: RPAFORGE_LOG_UNMASKED") == 1
    assert "DISABLED" in captured.err


def test_tee_event_logger_masks_file_write(tmp_path: Path) -> None:
    inner = EventLogger(stream=io.StringIO())
    log_file = tmp_path / "run-1.ndjson"
    tee = TeeEventLogger(inner, log_file)
    get_masker().register_secret(SECRET)
    tee.emit("activity_finished", activity="HTTP", error=f"401 echo {SECRET}")
    content = log_file.read_text(encoding="utf-8")
    record = json.loads(content.splitlines()[0])
    assert SECRET not in content
    assert REDACTED_PLACEHOLDER in record["error"]


def test_secret_named_kwargs_replaced_wholesale() -> None:
    sink = io.StringIO()
    EventLogger(stream=sink, ndjson=True).emit(
        "activity_finished",
        activity="AWS",
        api_key="AKIAIOSFODNN7EXAMPLE",
        attempts=3,
    )
    record = _ndjson_records(sink)[0]
    assert record["api_key"] == REDACTED_PLACEHOLDER
    assert record["attempts"] == 3


def test_is_secret_name_classification() -> None:
    assert is_secret_name("db_password")
    assert is_secret_name("clientSecret")
    assert is_secret_name("x-api-key")
    assert is_secret_name("access_token")
    assert is_secret_name("credentials")
    assert not is_secret_name("token")
    assert not is_secret_name("key")
    assert not is_secret_name("commit_sha")
    assert not is_secret_name("activity")


def test_env_secret_auto_registered(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("RPAFORGE_SECRET_DB_PASSWORD", "Sup3rEnvSecret99")
    sink = io.StringIO()
    EventLogger(stream=sink).emit(
        "log_message", message="value Sup3rEnvSecret99 leaked"
    )
    assert "Sup3rEnvSecret99" not in sink.getvalue()


def test_min_length_registration_threshold() -> None:
    masker = SecretMasker()
    masker.register_secret("abc")
    assert "abc" in masker.mask_text("has abc inside")
    masker.register_secret("long-enough-secret")
    assert "[REDACTED]" in masker.mask_text("value long-enough-secret end")


def test_ndjson_format_compatible_structure() -> None:
    sink = io.StringIO()
    EventLogger(stream=sink, ndjson=True).emit(
        "activity_finished", activity="HTTP", error="boom"
    )
    record = _ndjson_records(sink)[0]
    assert record["event"] == "activity_finished"
    assert "timestamp" in record
    assert record["activity"] == "HTTP"
    assert record["error"] == "boom"
