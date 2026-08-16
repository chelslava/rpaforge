"""Tests for rpaforge.config module."""

from __future__ import annotations

import sys
from pathlib import Path
from unittest.mock import patch

import pytest

from rpaforge import config


class TestConfigLogLevel:
    """Tests for log level configuration."""

    def test_default_log_level(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.delenv("RPAFORGE_LOG_LEVEL", raising=False)
        assert config.get_log_level() == "INFO"

    def test_custom_log_level(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setenv("RPAFORGE_LOG_LEVEL", "debug")
        assert config.get_log_level() == "DEBUG"


class TestConfigLang:
    """Tests for language locale configuration."""

    def test_default_lang(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.delenv("LANG", raising=False)
        assert config.get_lang() == "en"

    def test_custom_lang_simple(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setenv("LANG", "de")
        assert config.get_lang() == "de"

    def test_custom_lang_locale_code(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setenv("LANG", "ru_RU.UTF-8")
        assert config.get_lang() == "ru"


class TestConfigMaxWorkersLimit:
    """Tests for worker pool limit configuration."""

    def test_default_max_workers_limit(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.delenv("RPAFORGE_MAX_WORKERS_LIMIT", raising=False)
        limit = config.get_max_workers_limit()
        assert isinstance(limit, int)
        assert limit > 0

    def test_custom_max_workers_limit(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setenv("RPAFORGE_MAX_WORKERS_LIMIT", "16")
        assert config.get_max_workers_limit() == 16

    def test_invalid_max_workers_limit(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setenv("RPAFORGE_MAX_WORKERS_LIMIT", "invalid_number")
        assert config.get_max_workers_limit() == 0


class TestConfigAppDataDir:
    """Tests for app data directory resolution."""

    def test_explicit_data_dir_override(
        self, monkeypatch: pytest.MonkeyPatch, tmp_path: Path
    ) -> None:
        custom_dir = tmp_path / "custom_data"
        monkeypatch.setenv("RPAFORGE_DATA_DIR", str(custom_dir))
        assert config.get_app_data_dir() == custom_dir

    def test_windows_app_data_dir(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.delenv("RPAFORGE_DATA_DIR", raising=False)
        monkeypatch.setattr(sys, "platform", "win32")
        monkeypatch.setenv("LOCALAPPDATA", "C:/Users/Test/AppData/Local")
        assert config.get_app_data_dir() == Path("C:/Users/Test/AppData/Local/RPAForge")

    def test_mac_app_data_dir(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.delenv("RPAFORGE_DATA_DIR", raising=False)
        monkeypatch.setattr(sys, "platform", "darwin")
        with patch.object(Path, "home", return_value=Path("/Users/test")):
            assert config.get_app_data_dir() == Path(
                "/Users/test/Library/Application Support/RPAForge"
            )

    def test_linux_xdg_app_data_dir(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.delenv("RPAFORGE_DATA_DIR", raising=False)
        monkeypatch.setattr(sys, "platform", "linux")
        monkeypatch.setenv("XDG_CONFIG_HOME", "/home/test/.config")
        assert config.get_app_data_dir() == Path("/home/test/.config/rpaforge")


class TestConfigRunsAndCheckpointsDir:
    """Tests for runs and default checkpoint directory resolution."""

    def test_runs_dir(self) -> None:
        with patch.object(Path, "home", return_value=Path("/home/testuser")):
            assert config.get_runs_dir() == Path("/home/testuser/.rpaforge/runs")

    def test_default_checkpoint_dir(
        self, monkeypatch: pytest.MonkeyPatch, tmp_path: Path
    ) -> None:
        monkeypatch.setenv("RPAFORGE_DATA_DIR", str(tmp_path))
        assert config.get_default_checkpoint_dir() == tmp_path / "checkpoints"
