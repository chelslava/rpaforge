"""Tests for pluggable Secret Providers (Keyring, Env, Vault, AWS, Azure)."""

from __future__ import annotations

import json
import logging
from unittest.mock import MagicMock, patch

import pytest

from rpaforge_libraries.Credentials.library import Credentials
from rpaforge_libraries.Credentials.providers import (
    AwsSecretProvider,
    AzureSecretProvider,
    EnvSecretProvider,
    KeyringSecretProvider,
    SecretMasker,
    SecretMaskingFilter,
    VaultSecretProvider,
)


class TestSecretMasker:
    def test_masking_simple_and_nested_text(self):
        masker = SecretMasker()
        masker.clear()
        masker.register_secret("SuperSecretToken123")
        masker.register_secret("DbPass!#$99")

        raw_text = (
            "Connected to DB with pass=DbPass!#$99 and bearer SuperSecretToken123"
        )
        masked = masker.mask_text(raw_text)
        assert "SuperSecretToken123" not in masked
        assert "DbPass!#$99" not in masked
        assert (
            masked
            == "Connected to DB with pass=[REDACTED_SECRET] and bearer [REDACTED_SECRET]"
        )

    def test_masking_log_filter(self):
        masker = SecretMasker()
        masker.clear()
        masker.register_secret("ConfidentialAPIKey")

        logger = logging.getLogger("test_masker_logger")
        logger.setLevel(logging.INFO)
        log_filter = SecretMaskingFilter()
        logger.addFilter(log_filter)

        record = logging.LogRecord(
            name="test",
            level=logging.INFO,
            pathname="",
            lineno=0,
            msg="Sending request with key ConfidentialAPIKey",
            args=(),
            exc_info=None,
        )
        assert log_filter.filter(record) is True
        assert "ConfidentialAPIKey" not in record.msg
        assert "[REDACTED_SECRET]" in record.msg


class TestEnvSecretProvider:
    def test_env_provider_read_and_write(self, monkeypatch):
        monkeypatch.setenv("MY_APP_API_KEY", "env_secret_val_123")
        provider = EnvSecretProvider(prefix="MY_APP")
        assert provider.get_secret("API_KEY") == "env_secret_val_123"

        provider.set_secret("NEW_KEY", "new_val_456", namespace="staging")
        assert provider.get_secret("NEW_KEY", namespace="staging") == "new_val_456"
        assert "NEW_KEY" in provider.list_secrets(namespace="staging")

        assert provider.delete_secret("NEW_KEY", namespace="staging") is True
        with pytest.raises(KeyError):
            provider.get_secret("NEW_KEY", namespace="staging")

    def test_env_provider_dotenv_file(self, tmp_path):
        env_file = tmp_path / ".env.test"
        env_file.write_text(
            "DATABASE_URL=postgres://user:secret@localhost:5432/db\nAPI_TOKEN=abc123token\n",
            encoding="utf-8",
        )

        provider = EnvSecretProvider(env_file=env_file)
        assert (
            provider.get_secret("DATABASE_URL")
            == "postgres://user:secret@localhost:5432/db"
        )
        assert provider.get_secret("API_TOKEN") == "abc123token"


class TestKeyringSecretProvider:
    def test_keyring_memory_fallback(self):
        provider = KeyringSecretProvider(service_name="test_service")
        provider.set_secret("db_pass", "secret_pass_789", namespace="prod")
        assert provider.get_secret("db_pass", namespace="prod") == "secret_pass_789"
        assert "db_pass" in provider.list_secrets(namespace="prod")
        assert provider.delete_secret("db_pass", namespace="prod") is True
        with pytest.raises(KeyError):
            provider.get_secret("db_pass", namespace="prod")


class TestVaultSecretProvider:
    @patch("urllib.request.urlopen")
    def test_vault_get_and_set_secret_kv2(self, mock_urlopen):
        # Mock KV v2 read response
        mock_response = MagicMock()
        mock_response.read.return_value = json.dumps(
            {"data": {"data": {"value": "vault_secret_token_xyz"}}}
        ).encode("utf-8")
        mock_response.__enter__.return_value = mock_response
        mock_urlopen.return_value = mock_response

        provider = VaultSecretProvider(
            vault_url="http://127.0.0.1:8200", token="s.fakeToken"
        )
        val = provider.get_secret("db_password", namespace="finance")
        assert val == "vault_secret_token_xyz"

        # Mock set_secret
        provider.set_secret("api_token", "val_777", namespace="finance")
        assert mock_urlopen.called

    @patch("urllib.request.urlopen")
    def test_vault_approle_auth(self, mock_urlopen):
        mock_login_resp = MagicMock()
        mock_login_resp.read.return_value = json.dumps(
            {"auth": {"client_token": "approle_client_token_999"}}
        ).encode("utf-8")
        mock_login_resp.__enter__.return_value = mock_login_resp
        mock_urlopen.return_value = mock_login_resp

        provider = VaultSecretProvider(
            vault_url="http://127.0.0.1:8200",
            role_id="role-123",
            secret_id="secret-456",
        )
        assert provider._token == "approle_client_token_999"


class TestAwsSecretProvider:
    def test_aws_secret_provider_mock(self):
        provider = AwsSecretProvider(region_name="us-east-1")
        mock_client = MagicMock()
        mock_client.get_secret_value.return_value = {"SecretString": "aws_secret_pass"}
        mock_client.get_paginator.return_value.paginate.return_value = [
            {"SecretList": [{"Name": "prod/db_pass"}, {"Name": "prod/stripe_key"}]}
        ]
        provider._client = mock_client

        val = provider.get_secret("db_pass", namespace="prod")
        assert val == "aws_secret_pass"
        mock_client.get_secret_value.assert_called_with(SecretId="prod/db_pass")

        secrets = provider.list_secrets(namespace="prod")
        assert secrets == ["db_pass", "stripe_key"]

        provider.set_secret("api_key", "secret123", namespace="prod")
        assert mock_client.put_secret_value.called or mock_client.create_secret.called


class TestAzureSecretProvider:
    def test_azure_secret_provider_mock(self):
        provider = AzureSecretProvider(vault_url="https://test-vault.vault.azure.net")
        mock_client = MagicMock()
        mock_secret = MagicMock()
        mock_secret.value = "azure_vault_secret_val"
        mock_client.get_secret.return_value = mock_secret
        mock_prop = MagicMock()
        mock_prop.name = "prod-db-pass"
        mock_client.list_properties_of_secrets.return_value = [mock_prop]
        provider._client = mock_client

        val = provider.get_secret("db_pass", namespace="prod")
        assert val == "azure_vault_secret_val"
        mock_client.get_secret.assert_called_with("prod-db-pass")

        secrets = provider.list_secrets(namespace="prod")
        assert secrets == ["db-pass"]


class TestCredentialsLibraryWithProviders:
    def test_credentials_activity_integration(self, monkeypatch):
        monkeypatch.setenv("TEST_NS_SECRET_KEY", "integration_secret_val_888")
        creds = Credentials()
        creds.set_secret_provider("env", prefix="TEST")

        secret = creds.get_secret("SECRET_KEY", namespace="NS")
        assert secret == "integration_secret_val_888"

        # Check that secret is automatically registered in masker
        masked = creds.get_masked_text(
            "Logging secret value: integration_secret_val_888 in output"
        )
        assert "integration_secret_val_888" not in masked
        assert masked == "Logging secret value: [REDACTED_SECRET] in output"
