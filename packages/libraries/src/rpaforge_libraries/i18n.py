"""Internationalization support for RPAForge libraries."""

from __future__ import annotations

import gettext
import os

__all__ = ["_"]

# Try to load gettext, fall back to identity function
try:
    # Try package locale path first
    locale_dir = os.path.join(os.path.dirname(__file__), "locales")
    if os.path.exists(locale_dir):
        t = gettext.translation(
            "rpaforge_libraries",
            localedir=locale_dir,
            languages=[os.getenv("LANG", "en").split("_")[0]],
        )
    else:
        t = gettext.NullTranslations()
except Exception:
    t = gettext.NullTranslations()


def _(message: str, **kwargs: str | int | float) -> str:
    """Translate a message with optional interpolation.

    Args:
        message: The message to translate.
        **kwargs: Interpolation values (e.g., name="value").

    Returns:
        Translated and interpolated message.
    """
    translated = t.gettext(message)
    if kwargs:
        return translated.format(**kwargs)
    return translated
