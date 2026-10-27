"""Secret handling for checkpoint persistence (issue #823).

HITL suspension and periodic checkpoints serialize the full variable
snapshot to disk as plain JSON. Three policies control how secret-named
variables land in those files:

- ``redact`` (default): apply the audit-log name-based redaction
  (:func:`rpaforge.core.audit.redact_value`) before writing. Secrets
  become ``[REDACTED]`` and are lost for crash recovery — the safe
  default, matching how audit logs already treat credentials.
- ``keep``: legacy behavior — the snapshot is persisted verbatim.
- ``encrypt``: wrap the whole snapshot in a Fernet envelope keyed by
  ``RPAFORGE_CHECKPOINT_KEY``; :meth:`CheckpointManager.load` decrypts
  and restores the original values (including secrets).

The policy is selected via ``RPAFORGE_CHECKPOINT_SECRET_MODE`` or the
``CheckpointManager(secret_mode=...)`` constructor argument (the latter
wins). Requires the optional ``crypto`` extra for ``encrypt``.
"""

from __future__ import annotations

import json
import logging
import os
from enum import Enum
from typing import Any

from rpaforge.config import ENV_CHECKPOINT_KEY, ENV_CHECKPOINT_SECRET_MODE
from rpaforge.core.audit import redact_value

logger = logging.getLogger("rpaforge")

#: Marker key replacing the whole variables dict in encrypted checkpoints.
ENVELOPE_KEY = "__rpaforge_encrypted__"

_KEY_HELP = (
    'python -c "from cryptography.fernet import Fernet; '
    'print(Fernet.generate_key().decode())"'
)


class SecretPolicy(Enum):
    """How secret-named variables are persisted inside checkpoints."""

    REDACT = "redact"
    KEEP = "keep"
    ENCRYPT = "encrypt"

    def __str__(self) -> str:
        return self.value


class CheckpointSecretError(RuntimeError):
    """Raised when an encrypted checkpoint cannot be produced or read."""


def parse_secret_policy(value: str | SecretPolicy | None) -> SecretPolicy:
    """Coerce a policy name (or enum) into a :class:`SecretPolicy`."""
    if isinstance(value, SecretPolicy):
        return value
    if value is None or not str(value).strip():
        return SecretPolicy.REDACT
    try:
        return SecretPolicy(str(value).strip().lower())
    except ValueError:
        logger.warning(
            "Unknown RPAFORGE_CHECKPOINT_SECRET_MODE %r; falling back to 'redact'",
            value,
        )
        return SecretPolicy.REDACT


def get_default_secret_policy() -> SecretPolicy:
    """Read the default policy from the environment (redact when unset)."""
    return parse_secret_policy(os.environ.get(ENV_CHECKPOINT_SECRET_MODE))


def _fernet() -> Any:
    try:
        from cryptography.fernet import Fernet
    except ImportError as e:  # pragma: no cover - depends on extras
        raise CheckpointSecretError(
            "checkpoint secret_mode='encrypt' requires the 'cryptography' "
            "package; install rpaforge-core[crypto] or switch "
            "RPAFORGE_CHECKPOINT_SECRET_MODE to 'redact'"
        ) from e
    return Fernet


def _configured_key() -> bytes:
    key = os.environ.get(ENV_CHECKPOINT_KEY, "").strip()
    if not key:
        raise CheckpointSecretError(
            f"checkpoint secret_mode='encrypt' requires {ENV_CHECKPOINT_KEY} "
            f"(Fernet key; generate one with: {_KEY_HELP})"
        )
    return key.encode()


def apply_secret_policy(
    variables: dict[str, Any], policy: SecretPolicy
) -> dict[str, Any]:
    """Return the variables dict as it should be persisted under *policy*."""
    if policy is SecretPolicy.KEEP:
        return variables
    if policy is SecretPolicy.REDACT:
        redacted: dict[str, Any] = redact_value(variables)
        return redacted
    fernet_cls = _fernet()
    key = _configured_key()
    token = (
        fernet_cls(key)
        .encrypt(json.dumps(variables, default=str).encode("utf-8"))
        .decode("ascii")
    )
    return {ENVELOPE_KEY: {"v": 1, "token": token}}


def restore_variables(persisted: dict[str, Any]) -> dict[str, Any]:
    """Invert :func:`apply_secret_policy` when loading a checkpoint.

    Self-describing: an encrypted envelope is detected by its marker key
    regardless of the policy active at load time, so switching modes
    keeps older checkpoints readable (redacted files stay redacted).
    """
    envelope = persisted.get(ENVELOPE_KEY) if isinstance(persisted, dict) else None
    if not (isinstance(envelope, dict) and isinstance(envelope.get("token"), str)):
        return persisted
    fernet_cls = _fernet()
    key = _configured_key()
    try:
        plain = fernet_cls(key).decrypt(envelope["token"].encode("ascii"))
    except Exception as e:
        raise CheckpointSecretError(
            f"failed to decrypt checkpoint variables; {ENV_CHECKPOINT_KEY} does "
            "not match the key that wrote this checkpoint"
        ) from e
    restored = json.loads(plain)
    return restored if isinstance(restored, dict) else persisted
