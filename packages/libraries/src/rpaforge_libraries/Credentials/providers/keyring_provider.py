"""OS Keyring and local vault secret provider."""

from __future__ import annotations

import contextlib

from rpaforge_libraries.Credentials.providers.base import SecretMasker


class KeyringSecretProvider:
    """Provides secrets stored in the OS Keyring or local encrypted vault."""

    def __init__(
        self,
        service_name: str = "rpaforge_secrets",
        auto_mask: bool = True,
    ) -> None:
        self._service_name = service_name
        self._auto_mask = auto_mask
        self._masker = SecretMasker()
        self._memory_store: dict[str, str] = {}

    def _qualify_key(self, key: str, namespace: str) -> str:
        if namespace and namespace != "default":
            return f"{namespace}:{key}"
        return key

    def get_secret(self, key: str, namespace: str = "default") -> str:
        q_key = self._qualify_key(key, namespace)
        with contextlib.suppress(Exception):
            import keyring

            val = keyring.get_password(self._service_name, q_key)
            if val is not None:
                if self._auto_mask:
                    self._masker.register_secret(val)
                return val

        if q_key in self._memory_store:
            val = self._memory_store[q_key]
            if self._auto_mask:
                self._masker.register_secret(val)
            return val

        raise KeyError(f"Secret '{key}' not found in keyring provider")

    def set_secret(self, key: str, value: str, namespace: str = "default") -> None:
        q_key = self._qualify_key(key, namespace)
        with contextlib.suppress(Exception):
            import keyring

            keyring.set_password(self._service_name, q_key, value)

        self._memory_store[q_key] = value
        if self._auto_mask:
            self._masker.register_secret(value)

    def list_secrets(self, namespace: str = "default") -> list[str]:
        prefix = f"{namespace}:" if namespace and namespace != "default" else ""
        results = []
        for k in self._memory_store:
            if prefix:
                if k.startswith(prefix):
                    results.append(k[len(prefix) :])
            else:
                if ":" not in k:
                    results.append(k)
        return sorted(results)

    def delete_secret(self, key: str, namespace: str = "default") -> bool:
        q_key = self._qualify_key(key, namespace)
        deleted = False
        with contextlib.suppress(Exception):
            import keyring

            keyring.delete_password(self._service_name, q_key)
            deleted = True

        if q_key in self._memory_store:
            del self._memory_store[q_key]
            deleted = True
        return deleted
