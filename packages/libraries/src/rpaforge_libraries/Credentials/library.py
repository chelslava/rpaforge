"""RPAForge Credentials Library - Secure credential management."""

from __future__ import annotations

import base64
import json
import logging
import os
from pathlib import Path
from typing import TYPE_CHECKING, Any

from rpaforge.core.activity import activity, library, output, tags

if TYPE_CHECKING:
    pass

logger = logging.getLogger("rpaforge.credentials")

CREDENTIALS_DIR = Path.home() / ".rpaforge" / "credentials"
VAULT_KEY_FILE = Path.home() / ".rpaforge" / ".vault.key"

try:
    from cryptography.fernet import Fernet
    from cryptography.hazmat.primitives import hashes
    from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC

    _CRYPTO_AVAILABLE = True
except ImportError:
    _CRYPTO_AVAILABLE = False
    logger.warning("cryptography library not installed. Vault encryption disabled. Install with: pip install cryptography")


@library(name="Credentials", category="Security", icon="🔐")
class Credentials:
    """Secure credential management library."""

    def __init__(self, vault_path: str | Path | None = None) -> None:
        self._vault_path = (
            Path(vault_path) if vault_path else CREDENTIALS_DIR / "vault.json"
        )
        self._credentials: dict[str, dict[str, Any]] = {}
        self._fernet: Fernet | None = None
        self._ensure_vault()

    def _derive_key(self, password: str) -> bytes:
        salt = b"rpaforge_vault_salt_v1"
        kdf = PBKDF2HMAC(
            algorithm=hashes.SHA256(),
            length=32,
            salt=salt,
            iterations=100000,
        )
        return base64.urlsafe_b64encode(kdf.derive(password.encode()))

    def _get_or_create_key(self) -> Fernet:
        if self._fernet:
            return self._fernet

        if not _CRYPTO_AVAILABLE:
            return None

        if VAULT_KEY_FILE.exists():
            with open(VAULT_KEY_FILE, "rb") as f:
                key = f.read()
        else:
            key = Fernet.generate_key()
            VAULT_KEY_FILE.parent.mkdir(parents=True, exist_ok=True)
            with open(VAULT_KEY_FILE, "wb") as f:
                f.write(key)
            os.chmod(VAULT_KEY_FILE, 0o600)

        self._fernet = Fernet(key)
        return self._fernet

    def _ensure_vault(self) -> None:
        self._vault_path.parent.mkdir(parents=True, exist_ok=True)
        if not self._vault_path.exists():
            self._save_vault()
        else:
            self._load_vault()

    def _load_vault(self) -> None:
        if not self._vault_path.exists():
            self._credentials = {}
            return

        try:
            with open(self._vault_path, "rb") as f:
                data = f.read()

            if not data:
                self._credentials = {}
                return

            fernet = self._get_or_create_key()
            if fernet and data.startswith(b"gAAAAA"):
                decrypted = fernet.decrypt(data)
                self._credentials = json.loads(decrypted)
            else:
                self._credentials = json.loads(data)

        except (json.JSONDecodeError, FileNotFoundError):
            self._credentials = {}
        except Exception as e:
            logger.warning(f"Failed to decrypt vault: {e}")
            self._credentials = {}

    def _save_vault(self) -> None:
        data = json.dumps(self._credentials, indent=2).encode()

        fernet = self._get_or_create_key()
        if fernet:
            data = fernet.encrypt(data)

        with open(self._vault_path, "wb") as f:
            f.write(data)
        os.chmod(self._vault_path, 0o600)

    @activity(name="Store Credential", category="Credentials")
    @tags("store", "credential")
    def store_credential(
        self,
        name: str,
        username: str,
        password: str,
        metadata: dict[str, Any] | None = None,
    ) -> None:
        """Store a credential securely.

        :param name: Credential name/identifier.
        :param username: Username.
        :param password: Password.
        :param metadata: Optional metadata dictionary.
        """
        self._credentials[name] = {
            "username": username,
            "password": password,
            "metadata": metadata or {},
        }
        self._save_vault()
        logger.info(f"Stored credential: {name}")

    @activity(name="Get Credential", category="Credentials")
    @tags("get", "credential")
    @output("Dictionary with username, password, and metadata")
    def get_credential(self, name: str) -> dict[str, Any]:
        """Retrieve a stored credential.

        :param name: Credential name/identifier.
        :returns: Dictionary with username, password, and metadata.
        """
        if name not in self._credentials:
            raise ValueError(f"Credential '{name}' not found")
        logger.info(f"Retrieved credential: {name}")
        return self._credentials[name].copy()

    @activity(name="Get Username", category="Credentials")
    @tags("get", "username")
    @output("Username")
    def get_username(self, name: str) -> str:
        """Get username for a credential.

        :param name: Credential name/identifier.
        :returns: Username.
        """
        cred = self.get_credential(name)
        return cred["username"]

    @activity(name="Get Password", category="Credentials")
    @tags("get", "password")
    @output("Password")
    def get_password(self, name: str) -> str:
        """Get password for a credential.

        :param name: Credential name/identifier.
        :returns: Password.
        """
        cred = self.get_credential(name)
        return cred["password"]

    @activity(name="Delete Credential", category="Credentials")
    @tags("delete", "credential")
    def delete_credential(self, name: str) -> bool:
        """Delete a stored credential.

        :param name: Credential name/identifier.
        :returns: True if deleted, False if not found.
        """
        if name in self._credentials:
            del self._credentials[name]
            self._save_vault()
            logger.info(f"Deleted credential: {name}")
            return True
        return False

    @activity(name="List Credentials", category="Credentials")
    @tags("list", "credential")
    @output("List of credential names")
    def list_credentials(self) -> list[str]:
        """List all stored credential names.

        :returns: List of credential names.
        """
        return list(self._credentials.keys())

    @activity(name="Credential Exists", category="Credentials")
    @tags("check", "credential")
    @output("True if credential exists, False otherwise")
    def credential_exists(self, name: str) -> bool:
        """Check if a credential exists.

        :param name: Credential name/identifier.
        :returns: True if credential exists, False otherwise.
        """
        return name in self._credentials

    @activity(name="Update Credential", category="Credentials")
    @tags("update", "credential")
    def update_credential(
        self,
        name: str,
        username: str | None = None,
        password: str | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> None:
        """Update an existing credential.

        :param name: Credential name/identifier.
        :param username: New username (optional).
        :param password: New password (optional).
        :param metadata: New metadata (optional, merges with existing).
        """
        if name not in self._credentials:
            raise ValueError(f"Credential '{name}' not found")

        if username is not None:
            self._credentials[name]["username"] = username
        if password is not None:
            self._credentials[name]["password"] = password
        if metadata is not None:
            self._credentials[name]["metadata"].update(metadata)

        self._save_vault()
        logger.info(f"Updated credential: {name}")

    @activity(name="Get Environment Credential", category="Credentials")
    @tags("environment", "credential")
    @output("Dictionary with username and password")
    def get_environment_credential(self, prefix: str) -> dict[str, str]:
        """Get credential from environment variables.

        :param prefix: Environment variable prefix (e.g., 'MY_APP').
        :returns: Dictionary with username and password.
        """
        username = os.environ.get(f"{prefix}_USERNAME", "")
        password = os.environ.get(f"{prefix}_PASSWORD", "")

        if not username or not password:
            raise ValueError(
                f"Environment variables {prefix}_USERNAME and {prefix}_PASSWORD must be set"
            )

        return {"username": username, "password": password}

    @activity(name="Set Environment Credential", category="Credentials")
    @tags("environment", "credential")
    def set_environment_credential(self, prefix: str, name: str) -> None:
        """Set environment variables from a stored credential.

        :param prefix: Environment variable prefix.
        :param name: Credential name.
        """
        cred = self.get_credential(name)
        os.environ[f"{prefix}_USERNAME"] = cred["username"]
        os.environ[f"{prefix}_PASSWORD"] = cred["password"]
        logger.info(f"Set environment credentials for prefix: {prefix}")

    @activity(name="Export Credentials", category="Credentials")
    @tags("export", "credential")
    @output("Path to exported file")
    def export_credentials(
        self, path: str | Path, names: list[str] | None = None
    ) -> str:
        """Export credentials to a file.

        :param path: Export file path.
        :param names: List of credential names to export (all if None).
        :returns: Path to exported file.
        """
        export_path = Path(path)
        to_export = {}

        if names:
            for name in names:
                if name in self._credentials:
                    to_export[name] = self._credentials[name]
        else:
            to_export = self._credentials.copy()

        with open(export_path, "w") as f:
            json.dump(to_export, f, indent=2)

        os.chmod(export_path, 0o600)
        logger.info(f"Exported {len(to_export)} credentials to {path}")
        return str(export_path)

    @activity(name="Import Credentials", category="Credentials")
    @tags("import", "credential")
    @output("Number of imported credentials")
    def import_credentials(self, path: str | Path, overwrite: bool = False) -> int:
        """Import credentials from a file.

        :param path: Import file path.
        :param overwrite: Overwrite existing credentials.
        :returns: Number of imported credentials.
        """
        import_path = Path(path)

        with open(import_path) as f:
            imported = json.load(f)

        count = 0
        for name, cred in imported.items():
            if overwrite or name not in self._credentials:
                self._credentials[name] = cred
                count += 1

        self._save_vault()
        logger.info(f"Imported {count} credentials from {path}")
        return count
