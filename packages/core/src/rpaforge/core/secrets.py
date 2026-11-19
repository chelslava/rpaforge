"""Secret masking for runner event logs (issue #907).

``EventLogger.emit`` / ``TeeEventLogger.emit`` write event kwargs to the
console and to per-run NDJSON files that the serve API tails over HTTP.
Any secret reaching an event payload — an HTTP 401 error echoing
credentials, an activity logging its params — would otherwise be
persisted to disk in clear text and served over HTTP. This module is the
single masking choke point applied before any console or disk write:

- **registered secret values** — exact substring replacement of values
  registered explicitly (``--secret-env`` CLI resolution, Credentials
  library lookups) or discovered from secret-bearing environment
  variables (``RPAFORGE_SECRET_*`` plus the well-known
  ``RPAFORGE_LLM_API_KEY`` / ``RPAFORGE_SERVE_TOKEN`` /
  ``RPAFORGE_CHECKPOINT_KEY``);
- **high-confidence patterns** — ``Bearer`` tokens, ``authorization``
  headers, password-style assignments, URL userinfo passwords and long
  tokens adjacent to key-like names, matched in a single pass over
  precompiled regexes.

Masking is fail-safe: it is on by default and disabled only by setting
``RPAFORGE_LOG_UNMASKED=1``, which prints a warning banner once per
process. Core must not import from ``rpaforge_libraries`` — the
Credentials library's ``SecretMasker`` forwards its registrations here
(the allowed dependency direction).

Deliberately **not** masked: bare ``token``/``key`` fields and plain
long identifiers (SHA hashes, run ids, UUIDs). HITL approval events
carry the approval token under the ``token`` key and operators resolve
approvals from the logged value, so only qualified names
(``access_token``, ``api_key``, ...) are treated as secret-bearing.
"""

from __future__ import annotations

import os
import re
import sys
import threading
from typing import Any

from rpaforge.config import (
    ENV_CHECKPOINT_KEY,
    ENV_LLM_API_KEY,
    ENV_LOG_UNMASKED,
    ENV_SERVE_TOKEN,
)

__all__ = [
    "REDACTED_PLACEHOLDER",
    "SecretMasker",
    "get_masker",
    "is_secret_name",
    "mask_event_data",
    "mask_secret_values",
    "mask_text",
    "register_secret",
    "reset_masker",
]

#: Replacement rendered in place of any detected secret value.
REDACTED_PLACEHOLDER = "[REDACTED]"

#: Minimum length for an explicitly registered secret value.
MIN_SECRET_LENGTH = 4

#: Minimum length for a secret auto-registered from an environment variable.
MIN_ENV_SECRET_LENGTH = 8

#: Environment variables whose values are registered as secrets on first use.
_ENV_SECRET_NAMES = frozenset({ENV_LLM_API_KEY, ENV_SERVE_TOKEN, ENV_CHECKPOINT_KEY})

#: Prefix marking an environment variable as declaring a secret value.
_ENV_SECRET_PREFIX = "RPAFORGE_SECRET_"

#: Truthy spellings of ``RPAFORGE_LOG_UNMASKED`` that disable masking.
_UNMASKED_VALUES = frozenset({"1", "true", "yes"})

_UNMASKED_BANNER = (
    "======================================================================\n"
    " WARNING: RPAFORGE_LOG_UNMASKED is set — secret masking in run logs\n"
    " is DISABLED. Credentials may be written to disk in clear text and\n"
    " served over the HTTP logs endpoint. Re-enable masking by unsetting\n"
    " the variable.\n"
    "======================================================================"
)

_SECRET_NAME_SUFFIX = re.compile(
    r"(?:password|passwd|pwd|secret|api[_-]?key|apikey|access[_-]?key"
    r"|private[_-]?key|auth[_-]?token|access[_-]?token|authorization"
    r"|credentials?)\Z",
    re.IGNORECASE,
)

_SECRET_PATTERN = re.compile(
    r"""
    \b(?P<bearer_word>bearer)(?P<bearer_sep>\s+)
    (?P<bearer_value>[A-Za-z0-9._~+/=-]{8,})
    |
    (?P<kv_name>[A-Za-z0-9_-]*
        (?:
            password|passwd|pwd|secret|api[_-]?key|apikey|access[_-]?key
            |private[_-]?key|auth[_-]?token|access[_-]?token
            |authorization|credentials?
        )
    )
    (?P<kv_sep>[\"']?\s*[:=]\s*)
    (?P<kv_value>\"[^\"]{2,}\"|'[^']{2,}'|[^\s,;&{}\"'()<>]{2,})
    |
    (?P<url_prefix>\b[a-z][a-z0-9+.-]*://[^\s:@/\"'{]{0,64}:)
    (?P<url_pass>[^\s@/\"'{]{1,128})@
    """,
    re.VERBOSE | re.IGNORECASE,
)


def _mask_match(match: re.Match[str]) -> str:
    """Replace one pattern hit while preserving surrounding syntax."""
    if match.group("bearer_value") is not None:
        return (
            f"{match.group('bearer_word')}{match.group('bearer_sep')}"
            f"{REDACTED_PLACEHOLDER}"
        )
    if match.group("kv_name") is not None:
        value = match.group("kv_value")
        if value.startswith('"'):
            wrapped = f'"{REDACTED_PLACEHOLDER}"'
        elif value.startswith("'"):
            wrapped = f"'{REDACTED_PLACEHOLDER}'"
        else:
            wrapped = REDACTED_PLACEHOLDER
        return f"{match.group('kv_name')}{match.group('kv_sep')}{wrapped}"
    return f"{match.group('url_prefix')}{REDACTED_PLACEHOLDER}@"


def is_secret_name(name: str) -> bool:
    """Return whether *name* is a high-confidence holder for a secret.

    Matches identifiers whose significant suffix is a credential-ish word
    (``db_password``, ``client_secret``, ``apiKey``, ``x-api-key``, ...).
    Bare ``token`` and ``key`` are intentionally excluded: HITL approval
    events log the approval token operators must read back.
    """
    return bool(_SECRET_NAME_SUFFIX.search(name.strip()))


class SecretMasker:
    """Masks registered secret values and secret-shaped text patterns.

    Thread-safe: the secret set is mutated under a lock and readers only
    ever grab an immutable snapshot (``tuple``), so concurrent emitters
    share one masker without contention on the hot path.
    """

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._secrets: set[str] = set()
        self._ordered: tuple[str, ...] = ()
        self._env_registered = False

    @property
    def enabled(self) -> bool:
        """Whether masking is active (``RPAFORGE_LOG_UNMASKED`` unset)."""
        return (
            os.environ.get(ENV_LOG_UNMASKED, "").strip().lower() not in _UNMASKED_VALUES
        )

    def register_secret(self, secret: str) -> None:
        """Register one secret value for exact-substring redaction."""
        if not secret or len(secret.strip()) < MIN_SECRET_LENGTH:
            return
        with self._lock:
            if secret not in self._secrets:
                self._secrets.add(secret)
                self._rebuild_locked()

    def register_secrets(self, secrets: Any) -> None:
        """Register several secret values at once."""
        for secret in secrets or ():
            self.register_secret(str(secret))

    def clear(self) -> None:
        """Forget every registered secret value."""
        with self._lock:
            self._secrets.clear()
            self._ordered = ()
            self._env_registered = False

    def mask_text(self, text: str) -> str:
        """Return *text* with registered values and patterns redacted."""
        if not text:
            return text
        if not self.enabled:
            _warn_unmasked_once()
            return text
        for secret in self._ensure_secrets():
            if secret in text:
                text = text.replace(secret, REDACTED_PLACEHOLDER)
        return _SECRET_PATTERN.sub(_mask_match, text)

    def mask_data(self, value: Any) -> Any:
        """Recursively mask strings inside an event payload structure.

        Dict keys that :func:`is_secret_name` flags replace their whole
        value with the placeholder (mirroring the audit-log behaviour);
        every other value is recursed into or masked as text. Containers
        are rebuilt, never mutated in place.
        """
        if not self.enabled:
            _warn_unmasked_once()
            return value
        return self._mask_value(value)

    def _mask_value(self, value: Any) -> Any:
        if isinstance(value, str):
            if not value:
                return value
            for secret in self._ensure_secrets():
                if secret in value:
                    value = value.replace(secret, REDACTED_PLACEHOLDER)
            return _SECRET_PATTERN.sub(_mask_match, value)
        if isinstance(value, dict):
            return {
                key: (
                    REDACTED_PLACEHOLDER
                    if is_secret_name(str(key))
                    else self._mask_value(item)
                )
                for key, item in value.items()
            }
        if isinstance(value, (list, tuple)):
            return [self._mask_value(item) for item in value]
        return value

    def mask_registered_values(self, value: Any) -> Any:
        """Recursively replace registered secret values (issue #912).

        The value-based masking layer: unlike :meth:`mask_data` it applies
        only exact registered-value substring replacement — no pattern or
        key-name heuristics — so audit snapshots, checkpoint payloads and
        HITL approval payloads keep their structure while every occurrence
        of a registered secret is redacted whatever the key name. Honors
        ``RPAFORGE_LOG_UNMASKED``; containers are rebuilt, never mutated.
        """
        if not self.enabled:
            _warn_unmasked_once()
            return value
        return self._mask_registered(value)

    def _mask_registered(self, value: Any) -> Any:
        if isinstance(value, str):
            if not value:
                return value
            for secret in self._ensure_secrets():
                if secret in value:
                    value = value.replace(secret, REDACTED_PLACEHOLDER)
            return value
        if isinstance(value, dict):
            return {key: self._mask_registered(item) for key, item in value.items()}
        if isinstance(value, (list, tuple)):
            return [self._mask_registered(item) for item in value]
        return value

    def _ensure_secrets(self) -> tuple[str, ...]:
        """Secret snapshot (longest first), lazily seeding from the env."""
        if not self._env_registered:
            self._register_env_secrets()
        return self._ordered

    def _register_env_secrets(self) -> None:
        with self._lock:
            if self._env_registered:
                return
            for name, value in os.environ.items():
                if len(value.strip()) < MIN_ENV_SECRET_LENGTH:
                    continue
                if name in _ENV_SECRET_NAMES or name.startswith(_ENV_SECRET_PREFIX):
                    self._secrets.add(value)
            self._rebuild_locked()
            self._env_registered = True

    def _rebuild_locked(self) -> None:
        self._ordered = tuple(sorted(self._secrets, key=len, reverse=True))


_masker = SecretMasker()
_banner_lock = threading.Lock()
_banner_shown = False


def _warn_unmasked_once() -> None:
    """Print the unmasked-mode warning banner once per process."""
    global _banner_shown
    with _banner_lock:
        if _banner_shown:
            return
        _banner_shown = True
    print(_UNMASKED_BANNER, file=sys.stderr)


def get_masker() -> SecretMasker:
    """Return the process-wide default masker."""
    return _masker


def register_secret(secret: str) -> None:
    """Register one secret value with the default masker."""
    _masker.register_secret(secret)


def mask_text(text: str) -> str:
    """Mask *text* with the default masker."""
    return _masker.mask_text(text)


def mask_event_data(data: dict[str, Any]) -> dict[str, Any]:
    """Mask an event kwargs mapping before console/NDJSON formatting."""
    masked = _masker.mask_data(data)
    return masked if isinstance(masked, dict) else dict(data)


def mask_secret_values(value: Any) -> Any:
    """Value-based masking layer for audit/checkpoint/HITL payloads.

    Every occurrence of a secret registered with the runtime registry is
    replaced with :data:`REDACTED_PLACEHOLDER`, whatever the key name it
    sits under (issue #912). Pattern and key-name heuristics are
    deliberately not applied here — see :meth:`SecretMasker.mask_data`
    for the log-path behaviour.
    """
    return _masker.mask_registered_values(value)


def reset_masker() -> None:
    """Reset the default masker and the banner state (test helper)."""
    global _banner_shown
    _masker.clear()
    with _banner_lock:
        _banner_shown = False
