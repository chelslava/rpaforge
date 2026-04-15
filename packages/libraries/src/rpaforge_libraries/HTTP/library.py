"""RPAForge HTTP Library - HTTP/API operations."""

from __future__ import annotations

import base64
import json
import logging
import time
from typing import TYPE_CHECKING, Any
from urllib.parse import urljoin

import requests
from requests.auth import HTTPBasicAuth

from rpaforge.core.activity import activity, library, output, param, tags

if TYPE_CHECKING:
    pass

logger = logging.getLogger("rpaforge.http")

HTTP_METHODS = ["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS"]


@library(name="HTTP", category="API", icon="🌐")
class HTTP:
    """HTTP/API operations library."""

    def __init__(self) -> None:
        self._session: requests.Session | None = None
        self._base_url: str = ""
        self._default_headers: dict[str, str] = {}
        self._default_timeout: int = 30
        self._default_retry_count: int = 0
        self._default_retry_delay: float = 1.0
        self._auth_token: str | None = None
        self._auth_type: str | None = None

    def _get_session(self) -> requests.Session:
        if self._session is None:
            self._session = requests.Session()
            self._session.headers.update(self._default_headers)
        return self._session

    def _build_url(self, url: str) -> str:
        if self._base_url:
            return urljoin(self._base_url, url)
        return url

    def _build_auth(self) -> Any:
        if self._auth_type == "basic" and self._auth_token:
            decoded = base64.b64decode(self._auth_token).decode("utf-8")
            username, password = decoded.split(":", 1)
            return HTTPBasicAuth(username, password)
        return None

    def _build_headers(self, headers: dict[str, str] | None) -> dict[str, str]:
        result = dict(self._default_headers)
        if headers:
            result.update(headers)
        if self._auth_type == "bearer" and self._auth_token:
            result["Authorization"] = f"Bearer {self._auth_token}"
        elif self._auth_type == "api_key" and self._auth_token:
            result["X-API-Key"] = self._auth_token
        return result

    def _make_request(
        self,
        method: str,
        url: str,
        params: dict[str, Any] | None = None,
        json_data: dict[str, Any] | None = None,
        data: str | bytes | dict[str, Any] | None = None,
        headers: dict[str, str] | None = None,
        timeout: int | None = None,
        retry_count: int | None = None,
        retry_delay: float | None = None,
    ) -> dict[str, Any]:
        session = self._get_session()
        full_url = self._build_url(url)
        final_headers = self._build_headers(headers)
        final_timeout = timeout if timeout is not None else self._default_timeout
        final_retry_count = (
            retry_count if retry_count is not None else self._default_retry_count
        )
        final_retry_delay = (
            retry_delay if retry_delay is not None else self._default_retry_delay
        )
        auth = self._build_auth()

        last_exception: Exception | None = None
        for attempt in range(final_retry_count + 1):
            try:
                response = session.request(
                    method=method.upper(),
                    url=full_url,
                    params=params,
                    json=json_data,
                    data=data,
                    headers=final_headers,
                    timeout=final_timeout,
                    auth=auth,
                )

                result: dict[str, Any] = {
                    "status_code": response.status_code,
                    "reason": response.reason,
                    "headers": dict(response.headers),
                    "url": response.url,
                    "elapsed_ms": int(response.elapsed.total_seconds() * 1000),
                }

                content_type = response.headers.get("Content-Type", "")
                if "application/json" in content_type:
                    try:
                        result["json"] = response.json()
                    except json.JSONDecodeError:
                        result["text"] = response.text
                else:
                    result["text"] = response.text

                logger.info(f"{method} {full_url} -> {response.status_code}")
                return result

            except requests.exceptions.RequestException as e:
                last_exception = e
                logger.warning(
                    f"{method} {full_url} failed (attempt {attempt + 1}): {e}"
                )
                if attempt < final_retry_count:
                    time.sleep(final_retry_delay)

        raise ConnectionError(
            f"Request failed after {final_retry_count + 1} attempts: {last_exception}"
        )

    @activity(name="Configure HTTP Client", category="HTTP")
    @tags("http", "config")
    def configure(
        self,
        base_url: str = "",
        default_timeout: int = 30,
        default_retry_count: int = 0,
        default_retry_delay: float = 1.0,
        default_headers: dict[str, str] | None = None,
    ) -> str:
        """Configure default HTTP client settings.

        :param base_url: Base URL for all requests.
        :param default_timeout: Default timeout in seconds.
        :param default_retry_count: Default number of retries on failure.
        :param default_retry_delay: Delay between retries in seconds.
        :param default_headers: Default headers for all requests.
        :returns: Configuration summary.
        """
        self._base_url = base_url
        self._default_timeout = default_timeout
        self._default_retry_count = default_retry_count
        self._default_retry_delay = default_retry_delay
        if default_headers:
            self._default_headers = default_headers
        return f"Configured: base_url={base_url}, timeout={default_timeout}s, retries={default_retry_count}"

    @activity(name="Set Auth Basic", category="HTTP")
    @tags("http", "auth")
    def set_auth_basic(self, username: str, password: str) -> str:
        """Set Basic authentication for requests.

        :param username: Username for authentication.
        :param password: Password for authentication.
        :returns: Confirmation message.
        """
        credentials = f"{username}:{password}"
        self._auth_token = base64.b64encode(credentials.encode()).decode()
        self._auth_type = "basic"
        return "Basic authentication configured"

    @activity(name="Set Auth Bearer", category="HTTP")
    @tags("http", "auth")
    def set_auth_bearer(self, token: str) -> str:
        """Set Bearer token authentication for requests.

        :param token: Bearer token.
        :returns: Confirmation message.
        """
        self._auth_token = token
        self._auth_type = "bearer"
        return "Bearer authentication configured"

    @activity(name="Set Auth API Key", category="HTTP")
    @tags("http", "auth")
    def set_auth_api_key(self, api_key: str) -> str:
        """Set API Key authentication for requests.

        :param api_key: API key.
        :returns: Confirmation message.
        """
        self._auth_token = api_key
        self._auth_type = "api_key"
        return "API Key authentication configured"

    @activity(name="Clear Auth", category="HTTP")
    @tags("http", "auth")
    def clear_auth(self) -> str:
        """Clear authentication settings.

        :returns: Confirmation message.
        """
        self._auth_token = None
        self._auth_type = None
        return "Authentication cleared"

    @activity(name="Set Default Headers", category="HTTP")
    @tags("http", "headers")
    def set_default_headers(self, headers: dict[str, str]) -> str:
        """Set default headers for all requests.

        :param headers: Dictionary of headers.
        :returns: Confirmation message.
        """
        self._default_headers.update(headers)
        return f"Updated default headers: {list(headers.keys())}"

    @activity(name="Clear Default Headers", category="HTTP")
    @tags("http", "headers")
    def clear_default_headers(self) -> str:
        """Clear all default headers.

        :returns: Confirmation message.
        """
        self._default_headers = {}
        return "Default headers cleared"

    @activity(name="HTTP GET", category="HTTP")
    @tags("http", "get", "request")
    @output("Response dict with status_code, headers, json/text")
    def get(
        self,
        url: str,
        params: dict[str, Any] | None = None,
        headers: dict[str, str] | None = None,
        timeout: int | None = None,
    ) -> dict[str, Any]:
        """Send HTTP GET request.

        :param url: URL to request (relative to base_url if configured).
        :param params: Query parameters.
        :param headers: Additional headers for this request.
        :param timeout: Request timeout in seconds.
        :returns: Response dict with status_code, headers, json/text.
        """
        return self._make_request(
            "GET", url, params=params, headers=headers, timeout=timeout
        )

    @activity(name="HTTP POST", category="HTTP")
    @tags("http", "post", "request")
    @output("Response dict with status_code, headers, json/text")
    def post(
        self,
        url: str,
        json_data: dict[str, Any] | None = None,
        data: str | bytes | dict[str, Any] | None = None,
        params: dict[str, Any] | None = None,
        headers: dict[str, str] | None = None,
        timeout: int | None = None,
    ) -> dict[str, Any]:
        """Send HTTP POST request.

        :param url: URL to request (relative to base_url if configured).
        :param json_data: JSON body data.
        :param data: Raw body data (string, bytes, or form data).
        :param params: Query parameters.
        :param headers: Additional headers for this request.
        :param timeout: Request timeout in seconds.
        :returns: Response dict with status_code, headers, json/text.
        """
        return self._make_request(
            "POST",
            url,
            params=params,
            json_data=json_data,
            data=data,
            headers=headers,
            timeout=timeout,
        )

    @activity(name="HTTP PUT", category="HTTP")
    @tags("http", "put", "request")
    @output("Response dict with status_code, headers, json/text")
    def put(
        self,
        url: str,
        json_data: dict[str, Any] | None = None,
        data: str | bytes | dict[str, Any] | None = None,
        params: dict[str, Any] | None = None,
        headers: dict[str, str] | None = None,
        timeout: int | None = None,
    ) -> dict[str, Any]:
        """Send HTTP PUT request.

        :param url: URL to request (relative to base_url if configured).
        :param json_data: JSON body data.
        :param data: Raw body data (string, bytes, or form data).
        :param params: Query parameters.
        :param headers: Additional headers for this request.
        :param timeout: Request timeout in seconds.
        :returns: Response dict with status_code, headers, json/text.
        """
        return self._make_request(
            "PUT",
            url,
            params=params,
            json_data=json_data,
            data=data,
            headers=headers,
            timeout=timeout,
        )

    @activity(name="HTTP DELETE", category="HTTP")
    @tags("http", "delete", "request")
    @output("Response dict with status_code, headers, json/text")
    def delete(
        self,
        url: str,
        params: dict[str, Any] | None = None,
        headers: dict[str, str] | None = None,
        timeout: int | None = None,
    ) -> dict[str, Any]:
        """Send HTTP DELETE request.

        :param url: URL to request (relative to base_url if configured).
        :param params: Query parameters.
        :param headers: Additional headers for this request.
        :param timeout: Request timeout in seconds.
        :returns: Response dict with status_code, headers, json/text.
        """
        return self._make_request(
            "DELETE", url, params=params, headers=headers, timeout=timeout
        )

    @activity(name="HTTP PATCH", category="HTTP")
    @tags("http", "patch", "request")
    @output("Response dict with status_code, headers, json/text")
    def patch(
        self,
        url: str,
        json_data: dict[str, Any] | None = None,
        data: str | bytes | dict[str, Any] | None = None,
        params: dict[str, Any] | None = None,
        headers: dict[str, str] | None = None,
        timeout: int | None = None,
    ) -> dict[str, Any]:
        """Send HTTP PATCH request.

        :param url: URL to request (relative to base_url if configured).
        :param json_data: JSON body data.
        :param data: Raw body data (string, bytes, or form data).
        :param params: Query parameters.
        :param headers: Additional headers for this request.
        :param timeout: Request timeout in seconds.
        :returns: Response dict with status_code, headers, json/text.
        """
        return self._make_request(
            "PATCH",
            url,
            params=params,
            json_data=json_data,
            data=data,
            headers=headers,
            timeout=timeout,
        )

    @activity(name="HTTP Request", category="HTTP")
    @tags("http", "request")
    @output("Response dict with status_code, headers, json/text")
    def request(
        self,
        method: str,
        url: str,
        json_data: dict[str, Any] | None = None,
        data: str | bytes | dict[str, Any] | None = None,
        params: dict[str, Any] | None = None,
        headers: dict[str, str] | None = None,
        timeout: int | None = None,
        retry_count: int | None = None,
        retry_delay: float | None = None,
    ) -> dict[str, Any]:
        """Send HTTP request with any method.

        :param method: HTTP method (GET, POST, PUT, DELETE, PATCH, HEAD, OPTIONS).
        :param url: URL to request (relative to base_url if configured).
        :param json_data: JSON body data.
        :param data: Raw body data (string, bytes, or form data).
        :param params: Query parameters.
        :param headers: Additional headers for this request.
        :param timeout: Request timeout in seconds.
        :param retry_count: Number of retries on failure.
        :param retry_delay: Delay between retries in seconds.
        :returns: Response dict with status_code, headers, json/text.
        """
        if method.upper() not in HTTP_METHODS:
            raise ValueError(
                f"Invalid HTTP method: {method}. Valid methods: {HTTP_METHODS}"
            )
        return self._make_request(
            method,
            url,
            params=params,
            json_data=json_data,
            data=data,
            headers=headers,
            timeout=timeout,
            retry_count=retry_count,
            retry_delay=retry_delay,
        )

    @activity(name="Close HTTP Session", category="HTTP")
    @tags("http", "cleanup")
    def close(self) -> str:
        """Close the HTTP session.

        :returns: Confirmation message.
        """
        if self._session:
            self._session.close()
            self._session = None
        return "HTTP session closed"
