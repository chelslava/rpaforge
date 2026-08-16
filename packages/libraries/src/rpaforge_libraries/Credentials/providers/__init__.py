"""Pluggable secret management providers for RPAForge."""

from __future__ import annotations

from rpaforge_libraries.Credentials.providers.aws_provider import AwsSecretProvider
from rpaforge_libraries.Credentials.providers.azure_provider import AzureSecretProvider
from rpaforge_libraries.Credentials.providers.base import (
    SecretMasker,
    SecretMaskingFilter,
    SecretProvider,
)
from rpaforge_libraries.Credentials.providers.env_provider import EnvSecretProvider
from rpaforge_libraries.Credentials.providers.factory import (
    get_default_provider,
    get_secret_provider,
    set_default_provider,
)
from rpaforge_libraries.Credentials.providers.keyring_provider import (
    KeyringSecretProvider,
)
from rpaforge_libraries.Credentials.providers.vault_provider import VaultSecretProvider

__all__ = [
    "SecretProvider",
    "SecretMasker",
    "SecretMaskingFilter",
    "KeyringSecretProvider",
    "EnvSecretProvider",
    "VaultSecretProvider",
    "AwsSecretProvider",
    "AzureSecretProvider",
    "get_secret_provider",
    "get_default_provider",
    "set_default_provider",
]
