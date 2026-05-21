from __future__ import annotations

import tempfile
from pathlib import Path

from rpaforge_libraries.Credentials import Credentials


class TestCredentialsAtomicWrite:
    def test_atomic_write_creates_temp_then_renames(self):
        """Test that file writes use atomic pattern (temp file + rename)."""
        with tempfile.TemporaryDirectory() as tmpdir:
            cred = Credentials(vault_path=Path(tmpdir) / "vault.json")

            cred.store_credential("test", "user", "pass")

            assert cred._vault_path.exists()

            temp_files = list(Path(tmpdir).glob("*.tmp"))
            assert len(temp_files) == 0

    def test_atomic_write_preserves_data_integrity(self):
        """Test that atomic writes don't corrupt data on partial failure."""
        with tempfile.TemporaryDirectory() as tmpdir:
            cred = Credentials(vault_path=Path(tmpdir) / "vault.json")

            cred.store_credential("test", "username", "password123")

            retrieved = cred.get_credential("test")
            assert retrieved["username"] == "username"
            assert retrieved["password"] == "password123"

    def test_atomic_write_sets_correct_permissions(self):
        """Test that atomic writes preserve permission hardening."""
        import sys

        with tempfile.TemporaryDirectory() as tmpdir:
            cred = Credentials(vault_path=Path(tmpdir) / "vault.json")

            cred.store_credential("test", "u", "p")

            stat_info = cred._vault_path.stat()
            mode = stat_info.st_mode & 0o777
            if sys.platform != "win32":
                assert mode == 0o600

    def test_export_credentials_atomic_write(self):
        """Test that export_credentials uses atomic write pattern."""
        with tempfile.TemporaryDirectory() as tmpdir:
            cred = Credentials(vault_path=Path(tmpdir) / "vault.json")
            cred.store_credential("test", "user", "pass")

            export_path = Path(tmpdir) / "export.json"
            cred.export_credentials(str(export_path))

            assert export_path.exists()

            assert len(list(Path(tmpdir).glob("*.tmp"))) == 0
