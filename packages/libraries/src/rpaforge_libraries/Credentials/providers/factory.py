"""Factory for creating pluggable secret providers."""

from __future__ import annotations

from typing import Any

from rpaforge_libraries.Credentials.providers.aws_provider import AwsSecretProvider
from rpaforge_libraries.Credentials.providers.azure_provider import AzureSecretProvider
from rpaforge_libraries.Credentials.providers.base import SecretProvider
from rpaforge_libraries.Credentials.providers.env_provider import EnvSecretProvider
from rpaforge_libraries.Credentials.providers.keyring_provider import (
    KeyringSecretProvider,
)
from rpaforge_libraries.Credentials.providers.vault_provider import VaultSecretProvider

_DEFAULT_PROVIDER: SecretProvider | None = None


def get_secret_provider(
    provider_type: str = "keyring", **kwargs: Any
) -> SecretProvider:
    """Create and return a secret provider instance based on provider_type."""
    ptype = provider_type.strip().lower()
    if ptype in ("env", "dotenv", "environment"):
        return EnvSecretProvider(**kwargs)
    elif ptype in ("keyring", "local", "os"):
        return KeyringSecretProvider(**kwargs)
    elif ptype in ("vault", "hashicorp", "hashicorp_vault"):
        return VaultSecretProvider(**kwargs)
    elif ptype in ("aws", "aws_secrets_manager"):
        return AwsSecretProvider(**kwargs)
    elif ptype in ("azure", "azure_keyvault"):
        return AzureSecretProvider(**kwargs)
    else:
        raise ValueError(
            f"Unsupported secret provider type '{provider_type}'. "
            f"Supported: 'keyring', 'env', 'vault', 'aws', 'azure'."
        )


def get_default_provider() -> SecretProvider:
    """Get the active global default secret provider."""
    global _DEFAULT_PROVIDER
    if _DEFAULT_PROVIDER is None:
        _DEFAULT_PROVIDER = KeyringSecretProvider()
    return _DEFAULT_PROVIDER


def set_default_provider(provider: SecretProvider) -> None:
    """Set the active global default secret provider."""
    global _DEFAULT_PROVIDER
    _DEFAULT_PROVIDER = provider
