"""Internationalization support for RPAForge libraries using JSON-based translations."""

from __future__ import annotations

import json
import os
from typing import Any

__all__ = ["_"]

_CACHE: dict[str, dict[str, Any]] = {}


def _load_translations(lang: str) -> dict[str, Any]:
    """Load JSON translations for the given language."""
    if lang in _CACHE:
        return _CACHE[lang]

    # Try to load from studio locales (shared.json files)
    studio_locales_dir = os.path.join(
        os.path.dirname(__file__), "..", "..", "..", "studio", "public", "locales", lang
    )

    translations = {}
    shared_json = os.path.join(studio_locales_dir, "shared.json")

    if os.path.exists(shared_json):
        try:
            with open(shared_json, encoding="utf-8") as f:
                data = json.load(f)

                # Flatten nested structure
                def flatten(obj: dict[str, Any], prefix: str = "") -> None:
                    for key, value in obj.items():
                        full_key = f"{prefix}.{key}" if prefix else key
                        if isinstance(value, dict):
                            flatten(value, full_key)
                        else:
                            translations[full_key] = str(value)

                flatten(data)
        except Exception:
            pass

    _CACHE[lang] = translations
    return translations


def _(message: str, **kwargs: str | int | float) -> str:
    """Translate a message using JSON-based translations with optional interpolation.

    Args:
        message: The message key (e.g., "library.no_browser_open") or fallback text.
        **kwargs: Values for string interpolation (e.g., table="users").

    Returns:
        Translated and interpolated message, or the key itself if translation not found.
    """
    # Determine language
    lang = os.getenv("LANG", "en").split("_")[0]
    if lang not in ("en", "ru", "de", "es"):
        lang = "en"

    # Load translations
    translations = _load_translations(lang)

    # Try to translate
    translated = translations.get(message, message)

    # Interpolate
    if kwargs:
        try:
            return translated.format(**kwargs)
        except (KeyError, ValueError):
            return translated

    return translated
