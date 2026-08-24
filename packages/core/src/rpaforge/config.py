"""Centralized configuration for RPAForge core.

Single source of truth for environment-driven settings and platform-aware
data paths that were previously scattered across modules:

- env vars: ``RPAFORGE_LOG_LEVEL``, ``RPAFORGE_MAX_WORKERS_LIMIT``,
  ``LANG`` (see ``ENV_*`` constants below).
- hardcoded paths: the per-user runs directory (``~/.rpaforge/runs``) and the
  per-user app-data directory used for checkpoints.

All path getters resolve **lazily** (at call time) rather than at import time —
callers rely on this for testability (e.g. ``Path.home()`` is monkeypatched in
the test suite) and so that the module can be imported before any user-specific
path is known.

Supported environment variables
-------------------------------
- ``RPAFORGE_LOG_LEVEL``: root log level for the ``rpaforge`` logger
  (default ``"INFO"``).
- ``RPAFORGE_MAX_WORKERS_LIMIT``: upper cap on the subprocess worker pool
  (default ``multiprocessing.cpu_count() * 4``).
- ``RPAFORGE_DATA_DIR``: override the platform app-data directory. When unset,
  the platform default is used.
- ``LANG``: locale hint used by :mod:`rpaforge.i18n` (default ``"en"``).
- ``RPAFORGE_LLM_PROVIDER`` / ``RPAFORGE_LLM_BASE_URL`` /
  ``RPAFORGE_LLM_MODEL`` / ``RPAFORGE_LLM_VISION_MODEL`` /
  ``RPAFORGE_LLM_API_KEY``: default LLM client
  settings consumed by :mod:`rpaforge.llm`.

Paths are read once per call so an explicit ``RPAFORGE_DATA_DIR`` or a change
in the environment is picked up. Importing this module performs no I/O.
"""

from __future__ import annotations

import multiprocessing
import os
import sys
from pathlib import Path

__all__ = [
    "ENV_LOG_LEVEL",
    "ENV_DATA_DIR",
    "ENV_MAX_WORKERS_LIMIT",
    "ENV_LLM_PROVIDER",
    "ENV_LLM_BASE_URL",
    "ENV_LLM_MODEL",
    "ENV_LLM_VISION_MODEL",
    "ENV_LLM_API_KEY",
    "DEFAULT_LOG_LEVEL",
    "DEFAULT_LANG",
    "get_log_level",
    "get_lang",
    "get_max_workers_limit",
    "get_app_data_dir",
    "get_runs_dir",
    "get_default_checkpoint_dir",
    "get_queues_dir",
]

#: Environment variable that controls the root ``rpaforge`` logger level.
ENV_LOG_LEVEL = "RPAFORGE_LOG_LEVEL"
#: Environment variable that caps the subprocess worker pool size.
ENV_MAX_WORKERS_LIMIT = "RPAFORGE_MAX_WORKERS_LIMIT"
#: Environment variable that overrides the platform app-data directory.
ENV_DATA_DIR = "RPAFORGE_DATA_DIR"
#: Environment variable that selects the default LLM provider.
ENV_LLM_PROVIDER = "RPAFORGE_LLM_PROVIDER"
#: Environment variable that holds the LLM endpoint base URL override.
ENV_LLM_BASE_URL = "RPAFORGE_LLM_BASE_URL"
#: Environment variable that holds the default LLM model name.
ENV_LLM_MODEL = "RPAFORGE_LLM_MODEL"
#: Environment variable that holds the vision-capable LLM model override.
ENV_LLM_VISION_MODEL = "RPAFORGE_LLM_VISION_MODEL"
#: Environment variable that holds the LLM API key or token.
ENV_LLM_API_KEY = "RPAFORGE_LLM_API_KEY"

#: Fallback log level when ``RPAFORGE_LOG_LEVEL`` is unset or unrecognized.
DEFAULT_LOG_LEVEL = "INFO"
#: Fallback language when ``LANG`` is unset.
DEFAULT_LANG = "en"


def get_log_level() -> str:
    """Return the root log level name (e.g. ``"INFO"``).

    Reads ``RPAFORGE_LOG_LEVEL``; falls back to :data:`DEFAULT_LOG_LEVEL`
    when unset. The value is uppercased and unvalidated here — the caller is
    responsible for mapping it to a :mod:`logging` level.
    """
    return os.environ.get(ENV_LOG_LEVEL, DEFAULT_LOG_LEVEL).upper()


def get_lang() -> str:
    """Return the raw locale hint from ``LANG`` (e.g. ``"en"``).

    Mirrors the historical reading: values like ``"en_US.UTF-8"`` are trimmed
    to the language code. Callers that restrict to a supported set (see
    :mod:`rpaforge.i18n`) apply their own filtering afterwards.
    """
    return os.environ.get("LANG", DEFAULT_LANG).split("_")[0]


def get_max_workers_limit() -> int:
    """Return the maximum allowed worker-pool size.

    Reads ``RPAFORGE_MAX_WORKERS_LIMIT``; defaults to
    ``multiprocessing.cpu_count() * 4``. The value is coerced to ``int`` and
    defaults to 0 when parsing fails (callers clamp against their own minimum).
    """
    raw = os.environ.get(ENV_MAX_WORKERS_LIMIT, str(multiprocessing.cpu_count() * 4))
    try:
        return int(raw)
    except (TypeError, ValueError):
        return 0


def get_app_data_dir() -> Path:
    """Return the per-user application-data directory (platform-aware).

    Resolution order:
    1. ``RPAFORGE_DATA_DIR`` (explicit override).
    2. Windows: ``%LOCALAPPDATA%\\RPAForge`` (falling back to
       ``~/AppData/Local/RPAForge`` when ``LOCALAPPDATA`` is unset).
    3. macOS: ``~/Library/Application Support/RPAForge``.
    4. Linux/other: ``$XDG_CONFIG_HOME/rpaforge`` (falling back to
       ``~/.config/rpaforge``).

    The path is returned but **not** created; callers that need it on disk
    should ``mkdir(parents=True, exist_ok=True)`` themselves.
    """
    override = os.environ.get(ENV_DATA_DIR)
    if override:
        return Path(override)

    if sys.platform == "win32":
        base = os.environ.get("LOCALAPPDATA")
        return (Path(base) if base else Path.home() / "AppData" / "Local") / "RPAForge"

    if sys.platform == "darwin":
        return Path.home() / "Library" / "Application Support" / "RPAForge"

    xdg = os.environ.get("XDG_CONFIG_HOME")
    if xdg:
        return Path(xdg) / "rpaforge"
    return Path.home() / ".config" / "rpaforge"


def get_runs_dir() -> Path:
    """Return the directory used to persist run audits.

    Resolves lazily to ``~/.rpaforge/runs`` so that a changed ``$HOME`` (or a
    monkeypatched :meth:`pathlib.Path.home`) is honored per call.
    """
    return Path.home() / ".rpaforge" / "runs"


def get_default_checkpoint_dir() -> Path:
    """Return the default checkpoint directory.

    Uses the platform app-data directory (``<app-data>/checkpoints``). To
    override for the whole machine use ``RPAFORGE_DATA_DIR``; to override per
    ``CheckpointManager`` instance pass ``checkpoint_dir`` explicitly.
    """
    return get_app_data_dir() / "checkpoints"


def get_queues_dir() -> Path:
    """Return the directory used to persist work queue databases."""
    return get_app_data_dir() / "queues"
