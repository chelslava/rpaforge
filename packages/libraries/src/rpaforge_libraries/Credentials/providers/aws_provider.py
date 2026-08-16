"""AWS Secrets Manager Secret Provider."""

from __future__ import annotations

import logging
import os
from typing import Any

from rpaforge_libraries.Credentials.providers.base import SecretMasker

logger = logging.getLogger("rpaforge.credentials.aws")


class AwsSecretProvider:
    """Provides secrets from AWS Secrets Manager."""

    def __init__(
        self,
        region_name: str | None = None,
        auto_mask: bool = True,
        **boto_kwargs: Any,
    ) -> None:
        self._region = region_name or os.environ.get("AWS_DEFAULT_REGION", "us-east-1")
        self._auto_mask = auto_mask
        self._masker = SecretMasker()
        self._boto_kwargs = boto_kwargs
        self._client: Any = None

    def _get_client(self) -> Any:
        if self._client is None:
            try:
                import boto3

                self._client = boto3.client(
                    "secretsmanager", region_name=self._region, **self._boto_kwargs
                )
            except ImportError as e:
                raise RuntimeError(
                    "boto3 is required for AwsSecretProvider. Install with: pip install boto3"
                ) from e
        return self._client

    def _qualify_secret_id(self, key: str, namespace: str) -> str:
        if namespace and namespace != "default":
            return f"{namespace}/{key}"
        return key

    def get_secret(self, key: str, namespace: str = "default") -> str:
        client = self._get_client()
        secret_id = self._qualify_secret_id(key, namespace)
        try:
            resp = client.get_secret_value(SecretId=secret_id)
            if "SecretString" in resp:
                val = resp["SecretString"]
            elif "SecretBinary" in resp:
                val = resp["SecretBinary"].decode("utf-8")
            else:
                val = ""
            if self._auto_mask:
                self._masker.register_secret(val)
            return val
        except Exception as e:
            raise KeyError(f"Failed to get secret '{secret_id}' from AWS: {e}") from e

    def set_secret(self, key: str, value: str, namespace: str = "default") -> None:
        client = self._get_client()
        secret_id = self._qualify_secret_id(key, namespace)
        try:
            client.put_secret_value(SecretId=secret_id, SecretString=value)
        except Exception:
            client.create_secret(Name=secret_id, SecretString=value)
        if self._auto_mask:
            self._masker.register_secret(value)

    def list_secrets(self, namespace: str = "default") -> list[str]:
        client = self._get_client()
        prefix = f"{namespace}/" if namespace and namespace != "default" else ""
        results = []
        paginator = client.get_paginator("list_secrets")
        for page in paginator.paginate():
            for secret in page.get("SecretList", []):
                name = secret.get("Name", "")
                if prefix:
                    if name.startswith(prefix):
                        results.append(name[len(prefix) :])
                else:
                    results.append(name)
        return sorted(results)

    def delete_secret(self, key: str, namespace: str = "default") -> bool:
        client = self._get_client()
        secret_id = self._qualify_secret_id(key, namespace)
        try:
            client.delete_secret(SecretId=secret_id, ForceDeleteWithoutRecovery=True)
            return True
        except Exception:
            return False
