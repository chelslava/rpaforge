"""Azure Key Vault Secret Provider."""

from __future__ import annotations

import logging
import os
from typing import Any

from rpaforge_libraries.Credentials.providers.base import SecretMasker

logger = logging.getLogger("rpaforge.credentials.azure")


class AzureSecretProvider:
    """Provides secrets from Azure Key Vault."""

    def __init__(
        self,
        vault_url: str | None = None,
        auto_mask: bool = True,
        **credential_kwargs: Any,
    ) -> None:
        self._vault_url = vault_url or os.environ.get("AZURE_KEYVAULT_URL", "")
        self._auto_mask = auto_mask
        self._masker = SecretMasker()
        self._credential_kwargs = credential_kwargs
        self._client: Any = None

    def _get_client(self) -> Any:
        if self._client is None:
            if not self._vault_url:
                raise RuntimeError("AZURE_KEYVAULT_URL or vault_url is required")
            try:
                from azure.identity import DefaultAzureCredential
                from azure.keyvault.secrets import SecretClient

                credential = DefaultAzureCredential(**self._credential_kwargs)
                self._client = SecretClient(
                    vault_url=self._vault_url, credential=credential
                )
            except ImportError as e:
                raise RuntimeError(
                    "azure-keyvault-secrets and azure-identity are required for AzureSecretProvider. "
                    "Install with: pip install azure-keyvault-secrets azure-identity"
                ) from e
        return self._client

    def _format_secret_name(self, key: str, namespace: str) -> str:
        # Azure Key Vault secret names must match ^[0-9a-zA-Z-]+$
        raw = f"{namespace}-{key}" if namespace and namespace != "default" else key
        return raw.replace("_", "-").replace(".", "-").lower()

    def get_secret(self, key: str, namespace: str = "default") -> str:
        client = self._get_client()
        name = self._format_secret_name(key, namespace)
        try:
            secret = client.get_secret(name)
            val = secret.value or ""
            if self._auto_mask:
                self._masker.register_secret(val)
            return val
        except Exception as e:
            raise KeyError(
                f"Failed to get secret '{name}' from Azure Key Vault: {e}"
            ) from e

    def set_secret(self, key: str, value: str, namespace: str = "default") -> None:
        client = self._get_client()
        name = self._format_secret_name(key, namespace)
        client.set_secret(name, value)
        if self._auto_mask:
            self._masker.register_secret(value)

    def list_secrets(self, namespace: str = "default") -> list[str]:
        client = self._get_client()
        prefix = f"{namespace}-".lower() if namespace and namespace != "default" else ""
        results = []
        for prop in client.list_properties_of_secrets():
            name = prop.name
            if prefix:
                if name.startswith(prefix):
                    results.append(name[len(prefix) :])
            else:
                results.append(name)
        return sorted(results)

    def delete_secret(self, key: str, namespace: str = "default") -> bool:
        client = self._get_client()
        name = self._format_secret_name(key, namespace)
        try:
            poller = client.begin_delete_secret(name)
            poller.wait()
            return True
        except Exception:
            return False
