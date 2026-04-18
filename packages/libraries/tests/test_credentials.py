"""Tests for Credentials library."""

from __future__ import annotations

import os
import tempfile
from pathlib import Path

import pytest


class TestCredentials:
    """Tests for Credentials library."""

    def test_import_library(self):
        from rpaforge_libraries.Credentials import Credentials

        with tempfile.TemporaryDirectory() as tmpdir:
            lib = Credentials(vault_path=Path(tmpdir) / "vault.json")
            assert lib is not None

    def test_library_is_decorated(self):
        from rpaforge_libraries.Credentials import Credentials

        assert hasattr(Credentials, "_library_meta")
        assert Credentials._library_name == "Credentials"

    def test_store_and_get_credential(self):
        from rpaforge_libraries.Credentials import Credentials

        with tempfile.TemporaryDirectory() as tmpdir:
            lib = Credentials(vault_path=Path(tmpdir) / "vault.json")
            lib.store_credential("test", "user1", "pass1")
            cred = lib.get_credential("test")
            assert cred["username"] == "user1"
            assert cred["password"] == "pass1"

    def test_get_username(self):
        from rpaforge_libraries.Credentials import Credentials

        with tempfile.TemporaryDirectory() as tmpdir:
            lib = Credentials(vault_path=Path(tmpdir) / "vault.json")
            lib.store_credential("test", "user1", "pass1")
            assert lib.get_username("test") == "user1"

    def test_get_password(self):
        from rpaforge_libraries.Credentials import Credentials

        with tempfile.TemporaryDirectory() as tmpdir:
            lib = Credentials(vault_path=Path(tmpdir) / "vault.json")
            lib.store_credential("test", "user1", "pass1")
            assert lib.get_password("test") == "pass1"

    def test_delete_credential(self):
        from rpaforge_libraries.Credentials import Credentials

        with tempfile.TemporaryDirectory() as tmpdir:
            lib = Credentials(vault_path=Path(tmpdir) / "vault.json")
            lib.store_credential("test", "user1", "pass1")
            assert lib.delete_credential("test") is True
            assert lib.credential_exists("test") is False

    def test_list_credentials(self):
        from rpaforge_libraries.Credentials import Credentials

        with tempfile.TemporaryDirectory() as tmpdir:
            lib = Credentials(vault_path=Path(tmpdir) / "vault.json")
            lib.store_credential("cred1", "user1", "pass1")
            lib.store_credential("cred2", "user2", "pass2")
            names = lib.list_credentials()
            assert "cred1" in names
            assert "cred2" in names

    def test_credential_exists(self):
        from rpaforge_libraries.Credentials import Credentials

        with tempfile.TemporaryDirectory() as tmpdir:
            lib = Credentials(vault_path=Path(tmpdir) / "vault.json")
            lib.store_credential("test", "user1", "pass1")
            assert lib.credential_exists("test") is True
            assert lib.credential_exists("nonexistent") is False

    def test_get_credential_not_found(self):
        from rpaforge_libraries.Credentials import Credentials

        with tempfile.TemporaryDirectory() as tmpdir:
            lib = Credentials(vault_path=Path(tmpdir) / "vault.json")
            with pytest.raises(ValueError):
                lib.get_credential("nonexistent")

    def test_get_environment_credential(self):
        from rpaforge_libraries.Credentials import Credentials

        os.environ["TESTAPP_USERNAME"] = "envuser"
        os.environ["TESTAPP_PASSWORD"] = "envpass"

        with tempfile.TemporaryDirectory() as tmpdir:
            lib = Credentials(vault_path=Path(tmpdir) / "vault.json")
            cred = lib.get_environment_credential("TESTAPP")
            assert cred["username"] == "envuser"
            assert cred["password"] == "envpass"

        del os.environ["TESTAPP_USERNAME"]
        del os.environ["TESTAPP_PASSWORD"]


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
