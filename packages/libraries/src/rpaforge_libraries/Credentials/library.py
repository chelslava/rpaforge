"""RPAForge Credentials Library - Secure credential management."""

from __future__ import annotations

import base64
import json
import logging
import os
import threading
import time
from pathlib import Path
from typing import Any

from rpaforge.core.activity import activity, library, output, tags
from rpaforge_libraries.Credentials.providers import (
    SecretMasker,
    SecretProvider,
    get_secret_provider,
)
from rpaforge_libraries.i18n import _

logger = logging.getLogger("rpaforge.credentials")
CREDENTIALS_DIR = Path.home() / ".rpaforge" / "credentials"
_VAULT_CACHE_TTL = 30.0
_vault_cache: dict[str, dict[str, Any]] = {}
_vault_cache_time: dict[str, float] = {}
_vault_cache_lock = threading.Lock()


def _atomic_write(path: Path, data: bytes, mode: int = 384) -> None:
    """Atomically write data to file using temp file + rename pattern."""
    tmp_path = path.with_suffix(".tmp")
    try:
        tmp_path.write_bytes(data)
        tmp_path.chmod(mode)
        tmp_path.replace(path)
    except Exception:
        tmp_path.unlink(missing_ok=True)
        raise


VAULT_KEY_FILE = Path.home() / ".rpaforge" / ".vault.key"
try:
    from cryptography.fernet import Fernet
    from cryptography.hazmat.primitives import hashes
    from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC

    _CRYPTO_AVAILABLE = True
except ImportError:
    _CRYPTO_AVAILABLE = False
    logger.warning(
        _(
            "cryptography library not installed. Vault encryption disabled. Install with: pip install cryptography"
        )
    )


@library(name="Credentials", category="Security", icon="🔐")
class Credentials:
    """Secure credential management library.

    Provider-backed secrets are referenced by consumers as
    ``<provider>://<namespace>/<key>`` (for example,
    ``env://default/SMTP_PASSWORD``). The secret-provider activities below
    accept the namespace and key as separate arguments after a provider has
    been selected with :meth:`set_secret_provider`.
    """

    def __init__(self, vault_path: str | Path | None = None) -> None:
        self._vault_path = (
            Path(vault_path) if vault_path else CREDENTIALS_DIR / "vault.json"
        )
        self._credentials: dict[str, dict[str, Any]] = {}
        self._fernet: Fernet | None = None
        self._env_vars_set: list[str] = []
        self._secret_provider: SecretProvider | None = None
        self._masker = SecretMasker()
        self._ensure_vault()

    def __enter__(self) -> Credentials:
        return self

    def __exit__(self, exc_type: Any, exc_val: Any, exc_tb: Any) -> None:
        self._cleanup_env_vars()

    def _cleanup_env_vars(self) -> None:
        for var in self._env_vars_set:
            if var in os.environ:
                del os.environ[var]
        self._env_vars_set = []

    def _derive_key(
        self, password: str, salt: bytes | None = None
    ) -> tuple[bytes, bytes]:
        """Derive encryption key from password using PBKDF2.

        Returns (key, salt). Caller must persist the salt alongside the vault
        to allow future decryption — never use a hardcoded salt.
        """
        if salt is None:
            salt = os.urandom(32)
        kdf = PBKDF2HMAC(
            algorithm=hashes.SHA256(), length=32, salt=salt, iterations=600000
        )
        return (base64.urlsafe_b64encode(kdf.derive(password.encode())), salt)

    def _load_key_from_keystore(self) -> bytes | None:
        try:
            import keyring

            stored = keyring.get_password("rpaforge_vault", str(self._vault_path))
            if stored:
                return stored.encode("ascii")
        except Exception as e:
            logger.warning("Failed to load key from keyring: %s", e)
        return None

    def _save_key_to_keystore(self, key: bytes) -> bool:
        try:
            import keyring

            keyring.set_password(
                "rpaforge_vault", str(self._vault_path), key.decode("ascii")
            )
            return True
        except Exception as e:
            logger.warning("Failed to save key to keyring: %s", e)
            return False

    def _load_or_generate_file_key(self) -> bytes:
        if VAULT_KEY_FILE.exists():
            with open(VAULT_KEY_FILE, "rb") as f:
                key = f.read()
            self._save_key_to_keystore(key)
        else:
            key = Fernet.generate_key()
        VAULT_KEY_FILE.parent.mkdir(parents=True, exist_ok=True)
        if not self._save_key_to_keystore(key):
            _atomic_write(VAULT_KEY_FILE, key)
            os.chmod(VAULT_KEY_FILE, 0o600)
            logger.warning(
                "Vault key stored in plaintext file at %s with restricted permissions. "
                "Consider configuring a keyring backend for secure key storage.",
                VAULT_KEY_FILE,
            )
        return key

    def _get_or_create_key(self) -> Fernet | None:
        if self._fernet:
            return self._fernet
        if not _CRYPTO_AVAILABLE:
            return None
        key = self._load_key_from_keystore() or self._load_or_generate_file_key()
        self._fernet = Fernet(key)
        return self._fernet

    def _ensure_vault(self) -> None:
        self._vault_path.parent.mkdir(parents=True, exist_ok=True)
        if not self._vault_path.exists():
            self._save_vault()
        else:
            self._load_vault()

    def _load_vault(self) -> None:
        vault_key = str(self._vault_path)
        now = time.monotonic()
        with _vault_cache_lock:
            if (
                vault_key in _vault_cache
                and now - _vault_cache_time.get(vault_key, 0.0) < _VAULT_CACHE_TTL
            ):
                self._credentials = dict(_vault_cache[vault_key])
                return
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
                logger.warning(
                    _(
                        "Vault data is not encrypted — credentials are stored in plaintext. Re-save the vault to enable encryption."
                    )
                )
                self._credentials = json.loads(data)
        except (json.JSONDecodeError, FileNotFoundError):
            self._credentials = {}
        except Exception as e:
            logger.warning(_("Failed to decrypt vault: {error}", error=e))
            self._credentials = {}
        with _vault_cache_lock:
            _vault_cache[vault_key] = dict(self._credentials)
            _vault_cache_time[vault_key] = time.monotonic()

    def _save_vault(self) -> None:
        if not _CRYPTO_AVAILABLE:
            raise RuntimeError(
                _(
                    "Cannot securely store credentials: 'cryptography' is not installed. "
                    "Install 'cryptography' to enable vault encryption (CWE-256). "
                    "Refusing to write the vault in plaintext."
                )
            )
        data = json.dumps(self._credentials, indent=2).encode()
        fernet = self._get_or_create_key()
        if fernet is None:
            raise RuntimeError(
                _(
                    "Cannot securely store credentials: unable to obtain a vault "
                    "encryption key (CWE-256)."
                )
            )
        data = fernet.encrypt(data)
        _atomic_write(self._vault_path, data)
        vault_key = str(self._vault_path)
        with _vault_cache_lock:
            _vault_cache[vault_key] = dict(self._credentials)
            _vault_cache_time[vault_key] = time.monotonic()

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
        :param password: Password value to encrypt in the local vault. This
            activity stores the value literally; provider-backed secrets are
            referenced elsewhere as ``<provider>://<namespace>/<key>``.
        :param metadata: Optional metadata dictionary.
        :returns: None.
        :raises RuntimeError: If vault encryption is unavailable.
        """
        self._credentials[name] = {
            "username": username,
            "password": password,
            "metadata": metadata or {},
        }
        self._save_vault()
        logger.info(_("stored_credential", name=name))

    @activity(name="Get Credential", category="Credentials")
    @tags("get", "credential")
    @output("Dictionary with username, password, and metadata")
    def get_credential(self, name: str) -> dict[str, Any]:
        """Retrieve a stored credential.

        :param name: Credential name/identifier.
        :returns: Dictionary with username, password, and metadata.
        :raises ValueError: If the credential does not exist.
        """
        if name not in self._credentials:
            raise ValueError(_("Credential '{name}' not found", name=name))
        logger.info(_("retrieved_credential", name=name))
        return self._credentials[name].copy()

    @activity(name="Get Username", category="Credentials")
    @tags("get", "username")
    @output("Username")
    def get_username(self, name: str) -> str:
        """Get username for a credential.

        :param name: Credential name/identifier.
        :returns: Username.
        :raises ValueError: If the credential does not exist.
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
        :raises ValueError: If the credential does not exist.
        """
        cred = self.get_credential(name)
        return cred["password"]

    @activity(name="Delete Credential", category="Credentials")
    @tags("delete", "credential")
    def delete_credential(self, name: str) -> bool:
        """Delete a stored credential.

        :param name: Credential name/identifier.
        :returns: True if deleted, False if not found.
        :raises RuntimeError: If the updated vault cannot be encrypted.
        """
        if name in self._credentials:
            del self._credentials[name]
            self._save_vault()
            logger.info(_("deleted_credential", name=name))
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
        :param password: New password value to encrypt in the local vault.
            Provider-backed secrets use
            ``<provider>://<namespace>/<key>`` references elsewhere and are
            not resolved by this activity.
        :param metadata: New metadata (optional, merges with existing).
        :returns: None.
        :raises ValueError: If the credential does not exist.
        :raises RuntimeError: If vault encryption is unavailable.
        """
        if name not in self._credentials:
            raise ValueError(_("Credential '{name}' not found", name=name))
        if username is not None:
            self._credentials[name]["username"] = username
        if password is not None:
            self._credentials[name]["password"] = password
        if metadata is not None:
            self._credentials[name].setdefault("metadata", {}).update(metadata)
        self._save_vault()
        logger.info(_("updated_credential", name=name))

    @activity(name="Get Environment Credential", category="Credentials")
    @tags("environment", "credential")
    @output("Dictionary with username and password")
    def get_environment_credential(self, prefix: str) -> dict[str, str]:
        """Get credential from environment variables.

        :param prefix: Environment variable prefix (e.g., 'MY_APP').
        :returns: Dictionary with username and password.
        :raises ValueError: If either required environment variable is unset.
        """
        username = os.environ.get(f"{prefix}_USERNAME", "")
        password = os.environ.get(f"{prefix}_PASSWORD", "")
        if not username or not password:
            raise ValueError(
                _(
                    "Environment variables {prefix}_USERNAME and {prefix}_PASSWORD must be set",
                    prefix=prefix,
                )
            )
        return {"username": username, "password": password}

    @activity(name="Set Environment Credential", category="Credentials")
    @tags("environment", "credential")
    def set_environment_credential(self, prefix: str, name: str) -> None:
        """Set environment variables from a stored credential.

        :param prefix: Environment variable prefix.
        :param name: Local vault credential name, not a
            ``<provider>://<namespace>/<key>`` reference.
        :returns: None.
        :raises ValueError: If the credential does not exist.
        """
        cred = self.get_credential(name)
        key_user = f"{prefix}_USERNAME"
        key_pass = f"{prefix}_PASSWORD"
        os.environ[key_user] = cred["username"]
        os.environ[key_pass] = cred["password"]
        self._env_vars_set.extend([key_user, key_pass])
        logger.info(_("set_environment_credentials_for_prefix", prefix=prefix))

    def clear_environment_credentials(self) -> None:
        """Remove all environment variables set via set_environment_credential."""
        for key in self._env_vars_set:
            os.environ.pop(key, None)
        self._env_vars_set.clear()

    def close(self) -> None:
        """Explicitly release resources and clear credential environment vars.

        Environment variables set by :meth:`set_environment_credential` are
        visible to every child process spawned afterwards (CWE-522). Prefer
        calling :meth:`close` (or the ``with`` statement) over relying on
        garbage collection so secrets do not linger in ``os.environ``.
        """
        self.clear_environment_credentials()

    def __del__(self) -> None:
        # Best-effort cleanup only — never raise from __del__ during shutdown.
        try:
            if hasattr(self, "_env_vars_set"):
                self.clear_environment_credentials()
        except Exception:
            pass

    @activity(name="Export Credentials", category="Credentials")
    @tags("export", "credential")
    @output("Path to exported file")
    def export_credentials(
        self,
        path: str | Path,
        names: list[str] | None = None,
        encrypt: bool = True,
    ) -> str:
        """Export credentials to a file.

        By default the export is encrypted with the same vault Fernet key so
        no secret leaves storage in plaintext (CWE-312). Set ``encrypt=False``
        only when an interoperable, human-readable dump is explicitly needed.

        :param path: Export file path.
        :param names: List of credential names to export (all if None).
        :param encrypt: If True (default), the export is encrypted with the
            vault key. A plaintext export is only produced when explicitly
            requested with ``encrypt=False``.
        :returns: Path to exported file.
        :raises RuntimeError: If ``encrypt=True`` but no vault key can be
            obtained.
        """
        export_path = Path(path)
        to_export = {}
        if names:
            for name in names:
                if name in self._credentials:
                    to_export[name] = self._credentials[name]
        else:
            to_export = self._credentials.copy()
        payload = json.dumps(to_export, indent=2).encode()
        if encrypt:
            fernet = self._get_or_create_key()
            if fernet is None:
                raise RuntimeError(
                    _(
                        "Cannot securely export credentials: vault encryption is "
                        "unavailable. Refusing to write secrets in plaintext (CWE-312). "
                        "Use encrypt=False only if a plaintext export is strictly required."
                    )
                )
            payload = fernet.encrypt(payload)
        _atomic_write(export_path, payload)
        logger.info(
            _("Exported {count} credentials to {path}", count=len(to_export), path=path)
        )
        return str(export_path)

    @activity(name="Import Credentials", category="Credentials")
    @tags("import", "credential")
    @output("Number of imported credentials")
    def import_credentials(self, path: str | Path, overwrite: bool = False) -> int:
        """Import credentials from a file.

        :param path: Import file path.
        :param overwrite: Overwrite existing credentials.
        :returns: Number of imported credentials.
        :raises FileNotFoundError: If the import file does not exist.
        :raises RuntimeError: If an encrypted file cannot be decrypted because
            vault encryption is unavailable.
        :raises ValueError: If encrypted data cannot be decrypted or the file
            does not contain valid JSON.
        """
        import_path = Path(path)
        if import_path.exists() and import_path.read_bytes().startswith(b"gAAAAA"):
            fernet = self._get_or_create_key()
            if fernet is None:
                raise RuntimeError(
                    _(
                        "Cannot import an encrypted credentials file: vault encryption "
                        "is unavailable on this system (CWE-312/256)."
                    )
                )
            try:
                data = fernet.decrypt(import_path.read_bytes())
            except Exception as e:
                raise ValueError(
                    _(
                        "Failed to decrypt the imported credentials file, key mismatch or corrupt data: {error}",
                        error=e,
                    )
                ) from e
            imported = json.loads(data)
        else:
            with open(import_path) as f:
                imported = json.load(f)
        count = 0
        for name, cred in imported.items():
            if not isinstance(cred, dict):
                logger.warning(_("Skipping invalid credential %r: expected dict"), name)
                continue
            if not isinstance(cred.get("username"), str) or not isinstance(
                cred.get("password"), str
            ):
                logger.warning(
                    _("Skipping credential %r: username and password must be strings"),
                    name,
                )
                continue
            if overwrite or name not in self._credentials:
                self._credentials[name] = cred
                count += 1
        self._save_vault()
        logger.info(
            _("Imported {count} credentials from {path}", count=count, path=path)
        )
        return count

    def _get_active_provider(self) -> SecretProvider:
        if self._secret_provider is None:
            self._secret_provider = get_secret_provider("keyring")
        return self._secret_provider

    @activity(name="Set Secret Provider", category="Credentials")
    @tags("provider", "secret", "vault", "aws", "azure", "env")
    def set_secret_provider(
        self, provider_type: str = "keyring", **kwargs: Any
    ) -> None:
        """Configure the active secret provider.

        :param provider_type: Provider identifier (``keyring``, ``env``,
            ``vault``, ``aws``, or ``azure``). This is the ``provider``
            component of a ``<provider>://<namespace>/<key>`` reference.
        :param kwargs: Provider configuration options such as ``vault_url``,
            ``token``, ``env_file``, or ``region_name``.
        :returns: None.
        :raises ValueError: If ``provider_type`` is unsupported.
        :raises RuntimeError: If provider initialization or authentication
            fails.
        """
        self._secret_provider = get_secret_provider(provider_type, **kwargs)
        logger.info(
            _("Configured active secret provider: {provider}", provider=provider_type)
        )

    @activity(name="Get Secret", category="Credentials")
    @tags("secret", "get", "vault", "secure")
    @output("Secret string value with zero-leak protection and automatic log masking")
    def get_secret(self, key: str, namespace: str = "default") -> str:
        """Retrieve a secret from the active secret provider.

        :param key: ``key`` component of the external
            ``<provider>://<namespace>/<key>`` reference.
        :param namespace: ``namespace`` component of the external
            ``<provider>://<namespace>/<key>`` reference; defaults to
            ``"default"``.
        :returns: Secret string value.
        :raises KeyError: If the provider cannot find or retrieve the secret.
        :raises RuntimeError: If the provider is unavailable or not configured.
        """
        provider = self._get_active_provider()
        val = provider.get_secret(key, namespace=namespace)
        self._masker.register_secret(val)
        return val

    @activity(name="Set Secret", category="Credentials")
    @tags("secret", "set", "vault", "secure")
    def set_secret(self, key: str, value: str, namespace: str = "default") -> None:
        """Store or update a secret in the active secret provider.

        :param key: ``key`` component of the external
            ``<provider>://<namespace>/<key>`` reference.
        :param value: Raw secret string to store; this is not a secret
            reference.
        :param namespace: ``namespace`` component of the external
            ``<provider>://<namespace>/<key>`` reference; defaults to
            ``"default"``.
        :returns: None.
        :raises RuntimeError: If the provider dependency or configuration is
            unavailable, or a Vault write fails.
        :raises Exception: If an AWS or Azure client rejects the write; the
            concrete provider SDK exception is propagated unchanged.
        """
        provider = self._get_active_provider()
        provider.set_secret(key, value, namespace=namespace)
        self._masker.register_secret(value)
        logger.info(
            _("Stored secret '{key}' in namespace '{ns}'", key=key, ns=namespace)
        )

    @activity(name="List Secrets", category="Credentials")
    @tags("secret", "list", "vault")
    @output("List of secret keys in namespace")
    def list_secrets(self, namespace: str = "default") -> list[str]:
        """List available secret keys in the given namespace.

        :param namespace: ``namespace`` component used in external
            ``<provider>://<namespace>/<key>`` references; defaults to
            ``"default"``.
        :returns: List of secret keys. Vault request failures are represented
            as an empty list, so an unavailable Vault cannot be distinguished
            from an empty namespace.
        :raises RuntimeError: If a Vault, AWS, or Azure dependency or required
            configuration is unavailable while initializing the provider.
        :raises Exception: If an AWS or Azure client rejects the list request;
            the concrete provider SDK exception is propagated unchanged.
        """
        provider = self._get_active_provider()
        return provider.list_secrets(namespace=namespace)

    @activity(name="Delete Secret", category="Credentials")
    @tags("secret", "delete", "vault")
    @output("True if deleted, False otherwise")
    def delete_secret(self, key: str, namespace: str = "default") -> bool:
        """Delete a secret from the active secret provider.

        :param key: ``key`` component of the external
            ``<provider>://<namespace>/<key>`` reference.
        :param namespace: ``namespace`` component of the external
            ``<provider>://<namespace>/<key>`` reference; defaults to
            ``"default"``.
        :returns: True if deleted, False if the secret is not found or if a
            keyring, Vault, AWS, or Azure deletion operation fails without
            another local deletion succeeding. Providers do not distinguish
            those false-result cases.
        :raises RuntimeError: If a Vault, AWS, or Azure dependency or required
            configuration is unavailable while initializing the provider.
        """
        provider = self._get_active_provider()
        return provider.delete_secret(key, namespace=namespace)

    @activity(name="Mask Secret In Logs", category="Credentials")
    @tags("secret", "mask", "security", "logging")
    def mask_secret_in_logs(self, secret: str) -> None:
        """Register a secret value for automatic log masking.

        :param secret: Raw secret string to replace with ``[REDACTED_SECRET]``;
            this is not a ``<provider>://<namespace>/<key>`` reference.
        :returns: None.
        """
        self._masker.register_secret(secret)

    @activity(name="Get Masked Text", category="Credentials")
    @tags("secret", "mask", "security")
    @output("Text with all known secrets redacted")
    def get_masked_text(self, text: str) -> str:
        """Replace all known secret values in text with [REDACTED_SECRET].

        :param text: Input string.
        :returns: Redacted string.
        """
        return self._masker.mask_text(text)
