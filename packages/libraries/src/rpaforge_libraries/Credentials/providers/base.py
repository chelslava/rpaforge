"""Base interfaces and security utilities for secret providers."""

from __future__ import annotations

import abc
import logging
from typing import Protocol, runtime_checkable

logger = logging.getLogger("rpaforge.credentials.providers")


class SecretMasker:
    """Masks secret values in text and logging output to prevent credential leaks."""

    _instance: SecretMasker | None = None
    _secrets: set[str]

    def __new__(cls) -> SecretMasker:
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._secrets = set()
        return cls._instance

    def register_secret(self, secret: str) -> None:
        """Register a secret value for automatic redaction."""
        if secret and len(secret.strip()) >= 3:
            self._secrets.add(secret)

    def clear(self) -> None:
        """Clear registered secrets."""
        self._secrets.clear()

    def mask_text(self, text: str) -> str:
        """Redact all known secrets from text with [REDACTED_SECRET]."""
        if not text or not self._secrets:
            return text
        result = text
        for secret in sorted(self._secrets, key=len, reverse=True):
            if secret in result:
                result = result.replace(secret, "[REDACTED_SECRET]")
        return result


class SecretMaskingFilter(logging.Filter):
    """Logging filter that scrubs known secrets from log records."""

    def filter(self, record: logging.LogRecord) -> bool:
        masker = SecretMasker()
        if isinstance(record.msg, str):
            record.msg = masker.mask_text(record.msg)
        if record.args:
            if isinstance(record.args, dict):
                record.args = {
                    k: masker.mask_text(str(v)) if isinstance(v, str) else v
                    for k, v in record.args.items()
                }
            elif isinstance(record.args, tuple):
                record.args = tuple(
                    masker.mask_text(str(arg)) if isinstance(arg, str) else arg
                    for arg in record.args
                )
        return True


@runtime_checkable
class SecretProvider(Protocol):
    """Protocol defining standard interface for pluggable secret providers."""

    @abc.abstractmethod
    def get_secret(self, key: str, namespace: str = "default") -> str:
        """Retrieve a secret by key and namespace."""
        ...

    @abc.abstractmethod
    def set_secret(self, key: str, value: str, namespace: str = "default") -> None:
        """Store or update a secret value."""
        ...

    @abc.abstractmethod
    def list_secrets(self, namespace: str = "default") -> list[str]:
        """List secret keys within a namespace."""
        ...

    @abc.abstractmethod
    def delete_secret(self, key: str, namespace: str = "default") -> bool:
        """Delete a secret by key and namespace."""
        ...
