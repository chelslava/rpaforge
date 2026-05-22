"""Tests for Credentials library security features."""

from __future__ import annotations

import os
import tempfile
from pathlib import Path
from unittest.mock import patch

import pytest


class TestCredentialsSecurity:
    """Security and mocking tests for Credentials library."""

    def test_store_credential_encrypted_with_keyring(self):
        """Store credential should use keyring for encryption."""
        with tempfile.TemporaryDirectory() as tmpdir:
            vault_path = Path(tmpdir) / "vault.json"

            with patch("keyring.set_password") as mock_set_password:
                from rpaforge_libraries.Credentials import Credentials

                with patch(
                    "rpaforge_libraries.Credentials.library.VAULT_KEY_FILE"
                ) as mock_key_file:
                    mock_key_file.exists.return_value = False
                    mock_key_file.parent.mkdir(parents=True, exist_ok=True)

                    lib = Credentials(vault_path=vault_path)

                    mock_key = b"F" * 44
                    with patch.object(
                        lib, "_load_key_from_keystore", return_value=None
                    ):
                        with patch.object(
                            lib, "_save_key_to_keystore", return_value=True
                        ):
                            with patch(
                                "rpaforge_libraries.Credentials.library.Fernet.generate_key",
                                return_value=mock_key,
                            ):
                                lib.store_credential("test", "user", "pass")

                    assert mock_set_password.called

    def test_get_credential_from_vault(self):
        """Get credential should retrieve from vault."""
        with tempfile.TemporaryDirectory() as tmpdir:
            vault_path = Path(tmpdir) / "vault.json"

            from rpaforge_libraries.Credentials import Credentials

            lib = Credentials(vault_path=vault_path)
            lib.store_credential("test", "user1", "pass1")

            cred = lib.get_credential("test")
            assert cred["username"] == "user1"
            assert cred["password"] == "pass1"

    def test_get_credential_not_found_raises(self):
        """Get non-existent credential should raise ValueError."""
        with tempfile.TemporaryDirectory() as tmpdir:
            from rpaforge_libraries.Credentials import Credentials

            lib = Credentials(vault_path=Path(tmpdir) / "vault.json")

            with pytest.raises(ValueError, match="not found"):
                lib.get_credential("nonexistent")

    def test_get_username_not_found_raises(self):
        """Get username for non-existent credential should raise."""
        with tempfile.TemporaryDirectory() as tmpdir:
            from rpaforge_libraries.Credentials import Credentials

            lib = Credentials(vault_path=Path(tmpdir) / "vault.json")

            with pytest.raises(ValueError, match="not found"):
                lib.get_username("nonexistent")

    def test_get_password_not_found_raises(self):
        """Get password for non-existent credential should raise."""
        with tempfile.TemporaryDirectory() as tmpdir:
            from rpaforge_libraries.Credentials import Credentials

            lib = Credentials(vault_path=Path(tmpdir) / "vault.json")

            with pytest.raises(ValueError, match="not found"):
                lib.get_password("nonexistent")

    def test_delete_credential_not_found_returns_false(self):
        """Delete non-existent credential should return False."""
        with tempfile.TemporaryDirectory() as tmpdir:
            from rpaforge_libraries.Credentials import Credentials

            lib = Credentials(vault_path=Path(tmpdir) / "vault.json")

            result = lib.delete_credential("nonexistent")
            assert result is False

    def test_update_credential_not_found_raises(self):
        """Update non-existent credential should raise ValueError."""
        with tempfile.TemporaryDirectory() as tmpdir:
            from rpaforge_libraries.Credentials import Credentials

            lib = Credentials(vault_path=Path(tmpdir) / "vault.json")

            with pytest.raises(ValueError, match="not found"):
                lib.update_credential("nonexistent", username="newuser")

    def test_list_credentials_empty(self):
        """List credentials on empty vault should return empty list."""
        with tempfile.TemporaryDirectory() as tmpdir:
            from rpaforge_libraries.Credentials import Credentials

            lib = Credentials(vault_path=Path(tmpdir) / "vault.json")

            creds = lib.list_credentials()
            assert creds == []

    def test_credential_exists_empty_vault(self):
        """Credential exists on empty vault should return False."""
        with tempfile.TemporaryDirectory() as tmpdir:
            from rpaforge_libraries.Credentials import Credentials

            lib = Credentials(vault_path=Path(tmpdir) / "vault.json")

            assert lib.credential_exists("test") is False

    def test_store_get_update_credential_flow(self):
        """Test complete credential flow: store, get, update, delete."""
        with tempfile.TemporaryDirectory() as tmpdir:
            from rpaforge_libraries.Credentials import Credentials

            lib = Credentials(vault_path=Path(tmpdir) / "vault.json")

            lib.store_credential("cred1", "user1", "pass1")
            cred = lib.get_credential("cred1")
            assert cred["username"] == "user1"

            lib.update_credential("cred1", username="user2", password="pass2")
            cred = lib.get_credential("cred1")
            assert cred["username"] == "user2"
            assert cred["password"] == "pass2"

            result = lib.delete_credential("cred1")
            assert result is True
            assert lib.credential_exists("cred1") is False

    def test_export_import_credentials_flow(self):
        """Test export and import credentials flow."""
        with tempfile.TemporaryDirectory() as tmpdir:
            from rpaforge_libraries.Credentials import Credentials

            vault1_path = Path(tmpdir) / "vault1.json"
            export_path = Path(tmpdir) / "export.json"

            lib1 = Credentials(vault_path=vault1_path)
            lib1.store_credential("cred1", "user1", "pass1")
            lib1.store_credential("cred2", "user2", "pass2")

            exported = lib1.export_credentials(export_path)
            assert Path(exported).exists()

            vault2_path = Path(tmpdir) / "vault2.json"
            lib2 = Credentials(vault_path=vault2_path)
            imported = lib2.import_credentials(export_path)
            assert imported == 2

            cred1 = lib2.get_credential("cred1")
            assert cred1["username"] == "user1"

    def test_export_import_with_overwrite(self):
        """Test export and import with overwrite."""
        with tempfile.TemporaryDirectory() as tmpdir:
            from rpaforge_libraries.Credentials import Credentials

            vault1_path = Path(tmpdir) / "vault1.json"
            vault2_path = Path(tmpdir) / "vault2.json"
            export_path = Path(tmpdir) / "export.json"

            lib1 = Credentials(vault_path=vault1_path)
            lib1.store_credential("cred1", "user1", "pass1")

            lib2 = Credentials(vault_path=vault2_path)
            lib2.store_credential("cred1", "olduser", "oldpass")

            lib1.export_credentials(export_path)
            imported = lib2.import_credentials(export_path, overwrite=True)
            assert imported == 1

            cred1 = lib2.get_credential("cred1")
            assert cred1["username"] == "user1"

    def test_export_import_selective(self):
        """Test export and import with selective credential export."""
        with tempfile.TemporaryDirectory() as tmpdir:
            from rpaforge_libraries.Credentials import Credentials

            vault1_path = Path(tmpdir) / "vault1.json"
            export_path = Path(tmpdir) / "export.json"

            lib1 = Credentials(vault_path=vault1_path)
            lib1.store_credential("cred1", "user1", "pass1")
            lib1.store_credential("cred2", "user2", "pass2")
            lib1.store_credential("cred3", "user3", "pass3")

            lib1.export_credentials(export_path, names=["cred1", "cred3"])

            vault2_path = Path(tmpdir) / "vault2.json"
            lib2 = Credentials(vault_path=vault2_path)
            imported = lib2.import_credentials(export_path)
            assert imported == 2

            assert lib2.credential_exists("cred1")
            assert not lib2.credential_exists("cred2")
            assert lib2.credential_exists("cred3")

    def test_environment_credential_missing_raises(self):
        """Get environment credential with missing env vars should raise."""
        with tempfile.TemporaryDirectory() as tmpdir:
            from rpaforge_libraries.Credentials import Credentials

            lib = Credentials(vault_path=Path(tmpdir) / "vault.json")

            if "TESTAPP_USERNAME" in os.environ:
                del os.environ["TESTAPP_USERNAME"]
            if "TESTAPP_PASSWORD" in os.environ:
                del os.environ["TESTAPP_PASSWORD"]

            with pytest.raises(ValueError, match="Environment variables"):
                lib.get_environment_credential("TESTAPP")

    def test_set_environment_credential_sets_vars(self):
        """Set environment credential should set environment variables."""
        with tempfile.TemporaryDirectory() as tmpdir:
            from rpaforge_libraries.Credentials import Credentials

            lib = Credentials(vault_path=Path(tmpdir) / "vault.json")
            lib.store_credential("test", "user1", "pass1")

            lib.set_environment_credential("TESTAPP", "test")

            assert os.environ.get("TESTAPP_USERNAME") == "user1"
            assert os.environ.get("TESTAPP_PASSWORD") == "pass1"

            del os.environ["TESTAPP_USERNAME"]
            del os.environ["TESTAPP_PASSWORD"]

    def test_context_manager_cleans_env_vars(self):
        """Context manager should clean up environment variables it set."""
        with tempfile.TemporaryDirectory() as tmpdir:
            from rpaforge_libraries.Credentials import Credentials

            lib = Credentials(vault_path=Path(tmpdir) / "vault.json")
            lib.store_credential("test", "user1", "pass1")
            lib.set_environment_credential("TESTAPP", "test")

            assert "TESTAPP_USERNAME" in os.environ

            with Credentials(vault_path=Path(tmpdir) / "vault.json") as lib2:
                lib2.store_credential("test2", "user2", "pass2")
                lib2.set_environment_credential("TESTAPP2", "test2")

            assert "TESTAPP_USERNAME" in os.environ
            assert "TESTAPP2_USERNAME" not in os.environ

    def test_delete_cleans_env_vars(self):
        """Delete should not affect environment variables."""
        with tempfile.TemporaryDirectory() as tmpdir:
            from rpaforge_libraries.Credentials import Credentials

            lib = Credentials(vault_path=Path(tmpdir) / "vault.json")
            lib.store_credential("test", "user1", "pass1")
            lib.set_environment_credential("TESTAPP", "test")

            env_before = dict(os.environ)

            lib.delete_credential("test")

            assert os.environ.get("TESTAPP_USERNAME") == "user1"
            os.environ.clear()
            os.environ.update(env_before)


class TestCredentialsKeywords:
    """Tests for Credentials keyword signatures."""

    def test_keywords_exist(self):
        from rpaforge_libraries.Credentials import Credentials

        with tempfile.TemporaryDirectory() as tmpdir:
            lib = Credentials(vault_path=Path(tmpdir) / "vault.json")

            keywords = [
                "store_credential",
                "get_credential",
                "get_username",
                "get_password",
                "delete_credential",
                "list_credentials",
                "credential_exists",
                "update_credential",
                "get_environment_credential",
                "set_environment_credential",
                "export_credentials",
                "import_credentials",
            ]

            for keyword in keywords:
                assert hasattr(lib, keyword), f"Missing keyword: {keyword}"


class TestCredentialsContextManager:
    def test_context_manager_enter_returns_self(self):
        from rpaforge_libraries.Credentials import Credentials

        with tempfile.TemporaryDirectory() as tmpdir:
            with Credentials(vault_path=Path(tmpdir) / "vault.json") as lib:
                assert isinstance(lib, Credentials)

    def test_context_manager_cleans_env_vars(self):
        from rpaforge_libraries.Credentials import Credentials

        with tempfile.TemporaryDirectory() as tmpdir:
            lib = Credentials(vault_path=Path(tmpdir) / "vault.json")
            assert isinstance(lib._env_vars_set, list)
            assert len(lib._env_vars_set) == 0

    def test_context_manager_with_statement(self):
        from rpaforge_libraries.Credentials import Credentials

        with tempfile.TemporaryDirectory() as tmpdir:
            with Credentials(vault_path=Path(tmpdir) / "vault.json") as lib:
                lib.store_credential("test", "user", "pass")
                cred = lib.get_credential("test")
                assert cred["username"] == "user"
