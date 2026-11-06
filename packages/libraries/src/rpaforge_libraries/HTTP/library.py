"""RPAForge HTTP Library - HTTP/API operations."""

from __future__ import annotations

import base64
import json
import logging
import time
from typing import Any
from urllib.parse import urljoin

import requests
from requests.auth import HTTPBasicAuth

from rpaforge.core.activity import activity, library, output, tags
from rpaforge.core.ssrf import (
    allow_private_from_env,
    http_hostname,
    resolve_blocked_address,
)
from rpaforge_libraries.i18n import _

logger = logging.getLogger("rpaforge.http")

HTTP_METHODS = ["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS"]

#: Set to ``1``/``true``/``yes``/``on`` to allow requests to private ranges.
ALLOW_PRIVATE_ENV = "RPAFORGE_HTTP_ALLOW_PRIVATE"

#: Redirect hops followed manually so every hop re-runs the SSRF guard.
MAX_REDIRECTS = 10

_REDIRECT_STATUSES = (301, 302, 303, 307, 308)


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
        self._allow_private_addresses: bool | None = None

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

    def _private_allowed(self) -> bool:
        """Resolve the SSRF opt-out: configure() flag overrides the env var."""
        if self._allow_private_addresses is not None:
            return self._allow_private_addresses
        return allow_private_from_env(ALLOW_PRIVATE_ENV)

    def _assert_public_target(self, url: str) -> None:
        """Refuse non-public targets unless the SSRF opt-out is active.

        Re-evaluated before every request attempt and every redirect hop so
        freshly re-resolved DNS cannot skip the check (issue #861). Raises
        the builtin ``ConnectionError`` (not the requests one) so a guard
        refusal is never swallowed by the retry loop.
        """
        if self._private_allowed():
            return
        hostname = http_hostname(url)
        if hostname is None:
            return  # scheme/URL errors are surfaced by the request itself
        reason = resolve_blocked_address(hostname)
        if reason is not None:
            raise ConnectionError(
                f"Request to {url} is blocked by the SSRF guard: hostname "
                f"{reason}. Set {ALLOW_PRIVATE_ENV}=1 (or configure "
                "allow_private_addresses) for trusted environments."
            )

    def _request_following_redirects(
        self,
        session: requests.Session,
        method: str,
        url: str,
        params: dict[str, Any] | None,
        json_data: dict[str, Any] | None,
        data: str | bytes | dict[str, Any] | None,
        headers: dict[str, str],
        timeout: int,
        auth: Any,
    ) -> requests.Response:
        """Issue ``session.request`` re-validating the SSRF guard per hop.

        Redirects are followed manually (bounded by ``MAX_REDIRECTS``)
        because ``requests`` follows them internally without letting callers
        re-check the destination; this closes the public-server-redirects-to-
        metadata attack pattern.
        """
        current_url = url
        current_method = method
        current_params = params
        current_json = json_data
        current_data = data

        for _hop in range(MAX_REDIRECTS + 1):
            self._assert_public_target(current_url)
            response = session.request(
                method=current_method,
                url=current_url,
                params=current_params,
                json=current_json,
                data=current_data,
                headers=headers,
                timeout=timeout,
                auth=auth,
                allow_redirects=False,
            )
            if response.status_code not in _REDIRECT_STATUSES:
                return response
            location = response.headers.get("Location")
            if not location:
                return response
            current_url = urljoin(response.url, location)
            current_params = None  # query string is carried by Location
            if response.status_code == 303 or (
                response.status_code in (301, 302)
                and current_method not in ("GET", "HEAD")
            ):
                current_method = "GET"
                current_json = None
                current_data = None
        raise ConnectionError(f"Request to {url} exceeded {MAX_REDIRECTS} redirects")

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
                response = self._request_following_redirects(
                    session,
                    method.upper(),
                    full_url,
                    params,
                    json_data,
                    data,
                    final_headers,
                    final_timeout,
                    auth,
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

                logger.info(
                    _(
                        "str",
                        method=method,
                        full_url=full_url,
                        response_code=response.status_code,
                    )
                )
                return result

            except requests.exceptions.RequestException as e:
                last_exception = e
                logger.warning(
                    _(
                        "failed_attempt",
                        method=method,
                        full_url=full_url,
                        attempt=attempt,
                        e=e,
                    )
                )
                if attempt < final_retry_count:
                    time.sleep(final_retry_delay)

        raise ConnectionError(
            _(
                "Request failed after {count} attempts: {exception}",
                count=final_retry_count + 1,
                exception=last_exception,
            )
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
        allow_private_addresses: bool | None = None,
    ) -> str:
        """Configure default HTTP client settings.

        :param base_url: Base URL for all requests.
        :param default_timeout: Default timeout in seconds.
        :param default_retry_count: Default number of retries on failure.
        :param default_retry_delay: Delay between retries in seconds.
        :param default_headers: Default headers for all requests.
        :param allow_private_addresses: Disable the SSRF guard for this
            client; defaults to ``RPAFORGE_HTTP_ALLOW_PRIVATE`` (guard active
            when unset). Leave unset to follow the environment.
        :returns: Configuration summary.
        """
        self._base_url = base_url
        self._default_timeout = default_timeout
        self._default_retry_count = default_retry_count
        self._default_retry_delay = default_retry_delay
        self._allow_private_addresses = allow_private_addresses
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
                _(
                    "Invalid HTTP method: {method}. Valid methods: {methods}",
                    method=method,
                    methods=HTTP_METHODS,
                )
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
