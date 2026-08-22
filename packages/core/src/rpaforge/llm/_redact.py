"""Secret redaction for logs, so API keys never reach any log record.

Core must not import from ``rpaforge_libraries`` (where the full
``SecretMasker`` lives), so this module provides a minimal standalone
mechanism: a :class:`logging.Filter` that scrubs configured secret values
from every record passing through it.
"""

from __future__ import annotations

import logging
from collections.abc import Iterable, Mapping

__all__ = ["REDACTED_PLACEHOLDER", "SecretRedactionFilter", "redact_secrets"]

#: Replacement rendered in place of any detected secret value.
REDACTED_PLACEHOLDER = "[REDACTED]"


def redact_secrets(text: str, secrets: Iterable[str]) -> str:
    """Return *text* with every configured secret value replaced."""
    for secret in secrets:
        if secret:
            text = text.replace(secret, REDACTED_PLACEHOLDER)
    return text


class SecretRedactionFilter(logging.Filter):
    """Logging filter that scrubs configured secret values from records.

    Applies to the formatted message, positional args, and cached exception
    text. Attach it to a logger (or handler) with :meth:`attach`; adapters
    register their API key at construction time.
    """

    def __init__(self, *secrets: str) -> None:
        """Create a filter pre-seeded with *secrets*."""
        super().__init__()
        self._secrets: list[str] = []
        for secret in secrets:
            self.add_secret(secret)

    def add_secret(self, secret: str) -> None:
        """Register one more secret value to scrub."""
        if secret and secret not in self._secrets:
            self._secrets.append(secret)

    def attach(self, logger: logging.Logger) -> SecretRedactionFilter:
        """Attach this filter to *logger* exactly once."""
        if not any(existing is self for existing in logger.filters):
            logger.addFilter(self)
        return self

    def redact(self, text: str) -> str:
        """Scrub every registered secret from *text*."""
        return redact_secrets(text, self._secrets)

    def filter(self, record: logging.LogRecord) -> bool:
        """Mutate *record* in place, removing any registered secret."""
        if self._secrets:
            record.msg = self.redact(str(record.msg))
            if record.args:
                if isinstance(record.args, Mapping):
                    record.args = {
                        key: self.redact(value) if isinstance(value, str) else value
                        for key, value in record.args.items()
                    }
                else:
                    record.args = tuple(
                        self.redact(value) if isinstance(value, str) else value
                        for value in record.args
                    )
            if record.exc_text:
                record.exc_text = self.redact(record.exc_text)
            if record.exc_info is not None and record.exc_info[1] is not None:
                exc = record.exc_info[1]
                exc.args = tuple(
                    self.redact(arg) if isinstance(arg, str) else arg
                    for arg in exc.args
                )
        return True
