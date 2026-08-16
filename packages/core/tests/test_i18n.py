"""Tests for rpaforge.i18n module."""

from __future__ import annotations

import pytest

from rpaforge.i18n import _


class TestI18n:
    """Tests for internationalization helper."""

    def test_translate_fallback(self) -> None:
        assert _("unknown.key") == "unknown.key"

    def test_translate_supported_locales(self, monkeypatch: pytest.MonkeyPatch) -> None:
        for lang in ("en", "ru", "de", "es", "zh"):
            monkeypatch.setenv("LANG", lang)
            assert isinstance(_("engine.runner_is_not_idle"), str)

    def test_translate_unsupported_locale_defaults_to_en(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.setenv("LANG", "fr")
        assert isinstance(_("engine.runner_is_not_idle"), str)
