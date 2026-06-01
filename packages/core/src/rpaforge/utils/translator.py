"""Simple JSON-based translator for RPAForge.

Reads the same shared.json files used by the frontend i18next,
flattens them, and provides a simple t() interface.

Usage:
    from rpaforge.utils.translator import Translator

    t = Translator("ru")
    msg = t("engine.activity_not_found_in_library", activity="Click", library="DesktopUI")
"""

from __future__ import annotations

import json
import os
from typing import Any

_raw_lang = os.getenv("LANG", "en").replace("-", "_").split(".")[0].split("_")[0]
_DEFAULT_LANG = "en" if _raw_lang in ("C", "POSIX") else _raw_lang


class Translator:
    """Minimal translator that reads flat or nested JSON locale files."""

    def __init__(self, lang: str | None = None) -> None:
        if lang is None:
            lang = _DEFAULT_LANG
        locales_dir = os.path.join(
            os.path.dirname(os.path.dirname(__file__)), "locales"
        )
        path = os.path.join(locales_dir, lang, "shared.json")
        if os.path.exists(path):
            with open(path, encoding="utf-8") as f:
                data: dict[str, Any] = json.load(f)
        else:
            data = {}
        self._strings = self._flatten(data)

    def t(self, key: str, **kwargs: str | int | float) -> str:
        """Look up a dotted key and interpolate placeholders.

        Args:
            key: Dot-separated lookup key, e.g. ``"engine.activity_not_found"``.
            **kwargs: Values for ``{placeholder}`` tokens in the string.

        Returns:
            The translated string, or *key* itself when no translation exists.
        """
        text = self._strings.get(key, key)
        if kwargs:
            return text.format(**kwargs)
        return text

    @staticmethod
    def _flatten(d: dict[str, Any], prefix: str = "") -> dict[str, str]:
        """Recursively flatten a nested dict into dot-separated keys.

        ``{"a": {"b": "val"}}`` → ``{"a.b": "val"}``
        """
        items: dict[str, str] = {}
        for k, v in d.items():
            key = f"{prefix}.{k}" if prefix else k
            if isinstance(v, dict):
                items.update(Translator._flatten(v, key))
            else:
                items[key] = str(v)
        return items
