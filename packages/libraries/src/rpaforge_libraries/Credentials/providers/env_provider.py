"""Environment variables and .env secret provider."""

from __future__ import annotations

import os
from pathlib import Path

from rpaforge_libraries.Credentials.providers.base import SecretMasker


class EnvSecretProvider:
    """Provides secrets from environment variables or a .env file."""

    def __init__(
        self,
        env_file: str | Path | None = None,
        prefix: str = "",
        auto_mask: bool = True,
    ) -> None:
        self._prefix = prefix.upper()
        self._auto_mask = auto_mask
        self._masker = SecretMasker()
        self._loaded_env: dict[str, str] = {}

        if env_file:
            path = Path(env_file)
            if path.is_file():
                self._load_dotenv(path)

    def _load_dotenv(self, path: Path) -> None:
        for line in path.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            k = k.strip()
            v = v.strip().strip("'\"")
            self._loaded_env[k] = v

    def _format_keys(self, key: str, namespace: str) -> list[str]:
        clean_key = key.upper()
        clean_ns = namespace.upper()
        candidates = []
        if self._prefix:
            if clean_ns and clean_ns != "DEFAULT":
                candidates.append(f"{self._prefix}_{clean_ns}_{clean_key}")
            candidates.append(f"{self._prefix}_{clean_key}")
        if clean_ns and clean_ns != "DEFAULT":
            candidates.append(f"{clean_ns}_{clean_key}")
        candidates.append(clean_key)
        return candidates

    def get_secret(self, key: str, namespace: str = "default") -> str:
        for candidate in self._format_keys(key, namespace):
            if candidate in self._loaded_env:
                val = self._loaded_env[candidate]
                if self._auto_mask:
                    self._masker.register_secret(val)
                return val
            if candidate in os.environ:
                val = os.environ[candidate]
                if self._auto_mask:
                    self._masker.register_secret(val)
                return val
        raise KeyError(f"Secret '{key}' not found in environment or .env file")

    def set_secret(self, key: str, value: str, namespace: str = "default") -> None:
        target_key = self._format_keys(key, namespace)[0]
        self._loaded_env[target_key] = value
        os.environ[target_key] = value
        if self._auto_mask:
            self._masker.register_secret(value)

    def list_secrets(self, namespace: str = "default") -> list[str]:
        keys = set(self._loaded_env.keys()) | set(os.environ.keys())
        clean_ns = namespace.upper()
        results = set()
        for k in keys:
            cur = k
            if self._prefix and cur.startswith(f"{self._prefix}_"):
                cur = cur[len(self._prefix) + 1 :]
            if clean_ns != "DEFAULT":
                if cur.startswith(f"{clean_ns}_"):
                    results.add(cur[len(clean_ns) + 1 :])
            else:
                results.add(cur)
        return sorted(results)

    def delete_secret(self, key: str, namespace: str = "default") -> bool:
        found = False
        for candidate in self._format_keys(key, namespace):
            if candidate in self._loaded_env:
                del self._loaded_env[candidate]
                found = True
            if candidate in os.environ:
                del os.environ[candidate]
                found = True
        return found
