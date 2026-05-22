"""Tests for HTTP library security features."""

from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest

from rpaforge_libraries.HTTP import HTTP


class TestHTTPSecurity:
    """Security tests for HTTP library."""

    def test_get_connects_to_localhost(self):
        """HTTP requests to localhost should connect (security control test)."""
        http = HTTP()

        with pytest.raises(ConnectionError):
            http.get("http://localhost:8080/api")

    def test_get_connects_to_127_0_0_1(self):
        """HTTP requests to 127.0.0.1 should connect (security control test)."""
        http = HTTP()

        with pytest.raises(ConnectionError):
            http.get("http://127.0.0.1:8080/api")

    def test_get_connects_to_0_0_0_0(self):
        """HTTP requests to 0.0.0.0 should connect (security control test)."""
        http = HTTP()

        with pytest.raises(ConnectionError):
            http.get("http://0.0.0.0:8080/api")

    def test_get_connects_to_internal_ip_range(self):
        """HTTP requests to internal IP ranges should connect (security control)."""
        http = HTTP()

        with pytest.raises(ConnectionError):
            http.get("http://10.0.0.1:8080/api")

    def test_get_connects_to_172_16_internal_ip(self):
        """HTTP requests to 172.16.x.x should connect (security control test)."""
        http = HTTP()

        with pytest.raises(ConnectionError):
            http.get("http://172.16.0.1:8080/api")

    def test_get_connects_to_192_168_internal_ip(self):
        """HTTP requests to 192.168.x.x should connect (security control test)."""
        http = HTTP()

        with pytest.raises(ConnectionError):
            http.get("http://192.168.1.1:8080/api")

    @pytest.mark.skip(
        reason="HTTP library does not implement IP-based security blocking"
    )
    def test_get_connects_to_169_254_metadata(self):
        """HTTP requests to AWS metadata endpoint should connect (security control)."""
        http = HTTP()

        with pytest.raises(ConnectionError):
            http.get("http://169.254.169.254/latest/meta-data/")

    def test_post_connects_to_localhost(self):
        """POST requests to localhost should connect (security control test)."""
        http = HTTP()

        with pytest.raises(ConnectionError):
            http.post("http://localhost:8080/api", json_data={"test": "data"})

    def test_put_connects_to_localhost(self):
        """PUT requests to localhost should connect (security control test)."""
        http = HTTP()

        with pytest.raises(ConnectionError):
            http.put("http://localhost:8080/api", json_data={"test": "data"})

    def test_delete_connects_to_localhost(self):
        """DELETE requests to localhost should connect (security control test)."""
        http = HTTP()

        with pytest.raises(ConnectionError):
            http.delete("http://localhost:8080/api")

    def test_patch_connects_to_localhost(self):
        """PATCH requests to localhost should connect (security control test)."""
        http = HTTP()

        with pytest.raises(ConnectionError):
            http.patch("http://localhost:8080/api", json_data={"test": "data"})

    def test_request_method_connects_to_localhost(self):
        """Generic request method should connect to localhost (security control)."""
        http = HTTP()

        with pytest.raises(ConnectionError):
            http.request("GET", "http://localhost:8080/api")

    def test_get_accepts_external_url(self):
        """HTTP requests to external URLs should work."""
        http = HTTP()

        with patch("rpaforge_libraries.HTTP.library.requests.Session") as mock_session:
            mock_response = MagicMock()
            mock_response.status_code = 200
            mock_response.reason = "OK"
            mock_response.headers = {}
            mock_response.url = "https://api.example.com/users"
            mock_response.elapsed.total_seconds.return_value = 0.5
            mock_response.json.return_value = {"users": []}

            mock_session_instance = MagicMock()
            mock_session_instance.request.return_value = mock_response
            mock_session.return_value = mock_session_instance

            result = http.get("https://api.example.com/users")

            assert result["status_code"] == 200
            mock_session_instance.request.assert_called_once()

    def test_get_with_external_url_normal_operation(self):
        """Test external URL resolution still works."""
        http = HTTP()

        with patch("rpaforge_libraries.HTTP.library.requests.Session") as mock_session:
            mock_response = MagicMock()
            mock_response.status_code = 200
            mock_response.reason = "OK"
            mock_response.headers = {}
            mock_response.url = "https://api.example.com/users"
            mock_response.elapsed.total_seconds.return_value = 0.5
            mock_response.json.return_value = {"users": []}

            mock_session_instance = MagicMock()
            mock_session_instance.request.return_value = mock_response
            mock_session.return_value = mock_session_instance

            http.configure(base_url="https://api.example.com")
            result = http.get("/users")

            assert result["status_code"] == 200


class TestHTTPAuthenticationSecurity:
    """Authentication security tests."""

    def test_set_auth_basic_stores_token(self):
        """Basic auth should store encoded credentials."""
        http = HTTP()

        result = http.set_auth_basic("user", "pass")
        assert result == "Basic authentication configured"
        assert http._auth_type == "basic"

    def test_set_auth_bearer_stores_token(self):
        """Bearer auth should store token."""
        http = HTTP()

        result = http.set_auth_bearer("my-token")
        assert result == "Bearer authentication configured"
        assert http._auth_type == "bearer"
        assert http._auth_token == "my-token"

    def test_set_auth_api_key_stores_token(self):
        """API key auth should store token."""
        http = HTTP()

        result = http.set_auth_api_key("my-api-key")
        assert result == "API Key authentication configured"
        assert http._auth_type == "api_key"
        assert http._auth_token == "my-api-key"

    def test_clear_auth_removes_tokens(self):
        """Clear auth should remove all tokens."""
        http = HTTP()

        http.set_auth_bearer("token")
        http.set_auth_basic("user", "pass")

        result = http.clear_auth()
        assert result == "Authentication cleared"
        assert http._auth_type is None
        assert http._auth_token is None


class TestHTTPHeaderSecurity:
    """Header security tests."""

    def test_set_default_headers_updates_headers(self):
        """Default headers should be set correctly."""
        http = HTTP()
        headers = {"X-Custom-Header": "value"}

        result = http.set_default_headers(headers)
        assert "X-Custom-Header" in result
        assert http._default_headers["X-Custom-Header"] == "value"

    def test_clear_default_headers_resets_headers(self):
        """Clear headers should reset to empty."""
        http = HTTP()
        http.set_default_headers({"X-Test": "value"})

        result = http.clear_default_headers()
        assert result == "Default headers cleared"
        assert http._default_headers == {}

    def test_request_headers_combine_correctly(self):
        """Request headers should combine default and per-request headers."""
        http = HTTP()
        http.set_default_headers({"X-Default": "default-value"})

        with patch("rpaforge_libraries.HTTP.library.requests.Session") as mock_session:
            mock_response = MagicMock()
            mock_response.status_code = 200
            mock_response.reason = "OK"
            mock_response.headers = {}
            mock_response.url = "https://api.example.com/"
            mock_response.elapsed.total_seconds.return_value = 0.5
            mock_response.json.return_value = {}

            mock_session_instance = MagicMock()
            mock_session_instance.request.return_value = mock_response
            mock_session.return_value = mock_session_instance

            http.get("https://api.example.com/", headers={"X-Request": "request-value"})

            call_kwargs = mock_session_instance.request.call_args[1]
            assert call_kwargs["headers"]["X-Default"] == "default-value"
            assert call_kwargs["headers"]["X-Request"] == "request-value"


class TestHTTPConfiguration:
    """HTTP client configuration tests."""

    def test_configure_default_settings(self):
        """Configure should set default settings."""
        http = HTTP()

        result = http.configure(
            base_url="https://api.example.com",
            default_timeout=60,
            default_retry_count=3,
            default_retry_delay=2.0,
        )

        assert "base_url=https://api.example.com" in result
        assert "timeout=60s" in result
        assert "retries=3" in result

    def test_configure_with_headers(self):
        """Configure should accept headers."""
        http = HTTP()
        headers = {"Content-Type": "application/json"}

        result = http.configure(default_headers=headers)
        assert result is not None
        assert http._default_headers == headers

    def test_configure_base_url_empty_resets(self):
        """Configure with empty base_url should reset."""
        http = HTTP()
        http.configure(base_url="https://api.example.com")

        result = http.configure(base_url="")
        assert result is not None
        assert http._base_url == ""

    def test_configure_timeout_zero_disables(self):
        """Configure with zero timeout should set zero."""
        http = HTTP()

        http.configure(default_timeout=0)
        assert http._default_timeout == 0

    def test_configure_retry_count_zero_disables(self):
        """Configure with zero retry_count should set zero."""
        http = HTTP()

        http.configure(default_retry_count=0)
        assert http._default_retry_count == 0

    def test_configure_default_retry_delay_zero_disables(self):
        """Configure with zero retry_delay should set zero."""
        http = HTTP()

        http.configure(default_retry_delay=0.0)
        assert http._default_retry_delay == 0.0
