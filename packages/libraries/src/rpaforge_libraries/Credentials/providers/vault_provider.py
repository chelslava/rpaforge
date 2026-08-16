"""HashiCorp Vault KV Secret Provider."""

from __future__ import annotations

import json
import logging
import os
import urllib.error
import urllib.request

from rpaforge_libraries.Credentials.providers.base import SecretMasker

logger = logging.getLogger("rpaforge.credentials.vault")


class VaultSecretProvider:
    """Provides secrets from HashiCorp Vault KV v2 / v1."""

    def __init__(
        self,
        vault_url: str | None = None,
        token: str | None = None,
        role_id: str | None = None,
        secret_id: str | None = None,
        mount_point: str = "secret",
        auto_mask: bool = True,
        timeout: float = 10.0,
    ) -> None:
        self._url = (
            vault_url or os.environ.get("VAULT_ADDR", "http://127.0.0.1:8200")
        ).rstrip("/")
        self._token = token or os.environ.get("VAULT_TOKEN")
        self._role_id = role_id
        self._secret_id = secret_id
        self._mount_point = mount_point.strip("/")
        self._auto_mask = auto_mask
        self._timeout = timeout
        self._masker = SecretMasker()

        if not self._token and self._role_id and self._secret_id:
            self._authenticate_approle()

    def _authenticate_approle(self) -> None:
        login_url = f"{self._url}/v1/auth/approle/login"
        payload = json.dumps(
            {"role_id": self._role_id, "secret_id": self._secret_id}
        ).encode("utf-8")
        req = urllib.request.Request(
            login_url,
            data=payload,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=self._timeout) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                self._token = data["auth"]["client_token"]
        except Exception as e:
            raise RuntimeError(f"Vault AppRole authentication failed: {e}") from e

    def _get_headers(self) -> dict[str, str]:
        if not self._token:
            raise RuntimeError("Vault token is required but not configured")
        return {
            "X-Vault-Token": self._token,
            "Content-Type": "application/json",
        }

    def get_secret(self, key: str, namespace: str = "default") -> str:
        path = f"{namespace}/{key}" if namespace and namespace != "default" else key
        # Try KV v2 first (v1/secret/data/path)
        url_v2 = f"{self._url}/v1/{self._mount_point}/data/{path}"
        req_v2 = urllib.request.Request(
            url_v2, headers=self._get_headers(), method="GET"
        )
        try:
            with urllib.request.urlopen(req_v2, timeout=self._timeout) as resp:
                res = json.loads(resp.read().decode("utf-8"))
                data = res.get("data", {}).get("data", {})
                if "value" in data:
                    val = str(data["value"])
                elif key in data:
                    val = str(data[key])
                elif len(data) == 1:
                    val = str(next(iter(data.values())))
                else:
                    val = json.dumps(data)

                if self._auto_mask:
                    self._masker.register_secret(val)
                return val
        except urllib.error.HTTPError as e:
            if e.code == 404:
                # Try KV v1 (v1/secret/path)
                url_v1 = f"{self._url}/v1/{self._mount_point}/{path}"
                req_v1 = urllib.request.Request(
                    url_v1, headers=self._get_headers(), method="GET"
                )
                try:
                    with urllib.request.urlopen(
                        req_v1, timeout=self._timeout
                    ) as resp_v1:
                        res = json.loads(resp_v1.read().decode("utf-8"))
                        data = res.get("data", {})
                        val = (
                            str(data.get("value", data.get(key, json.dumps(data))))
                            if data
                            else ""
                        )
                        if self._auto_mask:
                            self._masker.register_secret(val)
                        return val
                except Exception as e1:
                    raise KeyError(f"Secret '{key}' not found in Vault: {e1}") from e1
            raise RuntimeError(f"Vault HTTP error {e.code}: {e.reason}") from e
        except Exception as e:
            raise RuntimeError(f"Failed to fetch secret '{key}' from Vault: {e}") from e

    def set_secret(self, key: str, value: str, namespace: str = "default") -> None:
        path = f"{namespace}/{key}" if namespace and namespace != "default" else key
        url = f"{self._url}/v1/{self._mount_point}/data/{path}"
        payload = json.dumps({"data": {"value": value}}).encode("utf-8")
        req = urllib.request.Request(
            url, data=payload, headers=self._get_headers(), method="POST"
        )
        try:
            with urllib.request.urlopen(req, timeout=self._timeout):
                if self._auto_mask:
                    self._masker.register_secret(value)
        except Exception as e:
            raise RuntimeError(f"Failed to write secret '{key}' to Vault: {e}") from e

    def list_secrets(self, namespace: str = "default") -> list[str]:
        path = namespace if namespace and namespace != "default" else ""
        url = (
            f"{self._url}/v1/{self._mount_point}/metadata/{path}".rstrip("/")
            + "?list=true"
        )
        req = urllib.request.Request(url, headers=self._get_headers(), method="GET")
        try:
            with urllib.request.urlopen(req, timeout=self._timeout) as resp:
                res = json.loads(resp.read().decode("utf-8"))
                keys = res.get("data", {}).get("keys", [])
                return sorted(keys)
        except Exception:
            return []

    def delete_secret(self, key: str, namespace: str = "default") -> bool:
        path = f"{namespace}/{key}" if namespace and namespace != "default" else key
        url = f"{self._url}/v1/{self._mount_point}/metadata/{path}"
        req = urllib.request.Request(url, headers=self._get_headers(), method="DELETE")
        try:
            with urllib.request.urlopen(req, timeout=self._timeout) as resp:
                return resp.status in (200, 204)
        except Exception:
            return False
