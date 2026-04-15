"""Tests for HTTP Library."""

from __future__ import annotations

import pytest
from unittest.mock import Mock, patch, MagicMock
import json

from rpaforge_libraries.HTTP import HTTP


class TestHTTPConfigure:
    """Tests for HTTP configuration."""

    def test_configure_default_settings(self):
        """Test configuring default HTTP settings."""
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
        """Test configuring with default headers."""
        http = HTTP()
        headers = {"Content-Type": "application/json", "Accept": "application/json"}
        result = http.configure(default_headers=headers)
        assert result is not None


class TestHTTPAuthentication:
    """Tests for HTTP authentication."""

    def test_set_auth_basic(self):
        """Test setting basic authentication."""
        http = HTTP()
        result = http.set_auth_basic("user", "pass")
        assert result == "Basic authentication configured"
        assert http._auth_type == "basic"
        assert http._auth_token is not None

    def test_set_auth_bearer(self):
        """Test setting bearer token authentication."""
        http = HTTP()
        result = http.set_auth_bearer("my-token-123")
        assert result == "Bearer authentication configured"
        assert http._auth_type == "bearer"
        assert http._auth_token == "my-token-123"

    def test_set_auth_api_key(self):
        """Test setting API key authentication."""
        http = HTTP()
        result = http.set_auth_api_key("api-key-456")
        assert result == "API Key authentication configured"
        assert http._auth_type == "api_key"
        assert http._auth_token == "api-key-456"

    def test_clear_auth(self):
        """Test clearing authentication."""
        http = HTTP()
        http.set_auth_bearer("token")
        result = http.clear_auth()
        assert result == "Authentication cleared"
        assert http._auth_type is None
        assert http._auth_token is None


class TestHTTPHeaders:
    """Tests for HTTP headers management."""

    def test_set_default_headers(self):
        """Test setting default headers."""
        http = HTTP()
        headers = {"X-Custom-Header": "value"}
        result = http.set_default_headers(headers)
        assert "X-Custom-Header" in result
        assert http._default_headers["X-Custom-Header"] == "value"

    def test_clear_default_headers(self):
        """Test clearing default headers."""
        http = HTTP()
        http.set_default_headers({"X-Test": "value"})
        result = http.clear_default_headers()
        assert result == "Default headers cleared"
        assert http._default_headers == {}


class TestHTTPRequests:
    """Tests for HTTP request methods."""

    @patch("rpaforge_libraries.HTTP.library.requests.Session")
    def test_get_request(self, mock_session_class):
        """Test GET request."""
        mock_session = MagicMock()
        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.reason = "OK"
        mock_response.headers = {"Content-Type": "application/json"}
        mock_response.url = "https://api.example.com/users"
        mock_response.elapsed.total_seconds.return_value = 0.5
        mock_response.json.return_value = {"users": []}
        mock_session.request.return_value = mock_response
        mock_session_class.return_value = mock_session

        http = HTTP()
        result = http.get("https://api.example.com/users")

        assert result["status_code"] == 200
        assert result["reason"] == "OK"
        assert "json" in result
        mock_session.request.assert_called_once()

    @patch("rpaforge_libraries.HTTP.library.requests.Session")
    def test_post_request_with_json(self, mock_session_class):
        """Test POST request with JSON body."""
        mock_session = MagicMock()
        mock_response = Mock()
        mock_response.status_code = 201
        mock_response.reason = "Created"
        mock_response.headers = {"Content-Type": "application/json"}
        mock_response.url = "https://api.example.com/users"
        mock_response.elapsed.total_seconds.return_value = 0.3
        mock_response.json.return_value = {"id": 1}
        mock_session.request.return_value = mock_response
        mock_session_class.return_value = mock_session

        http = HTTP()
        result = http.post(
            "https://api.example.com/users",
            json_data={"name": "Test User"},
        )

        assert result["status_code"] == 201
        mock_session.request.assert_called_once()
        call_kwargs = mock_session.request.call_args[1]
        assert call_kwargs["method"] == "POST"
        assert call_kwargs["json"] == {"name": "Test User"}

    @patch("rpaforge_libraries.HTTP.library.requests.Session")
    def test_put_request(self, mock_session_class):
        """Test PUT request."""
        mock_session = MagicMock()
        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.reason = "OK"
        mock_response.headers = {}
        mock_response.url = "https://api.example.com/users/1"
        mock_response.elapsed.total_seconds.return_value = 0.2
        mock_response.json.return_value = {"id": 1, "updated": True}
        mock_session.request.return_value = mock_response
        mock_session_class.return_value = mock_session

        http = HTTP()
        result = http.put(
            "https://api.example.com/users/1", json_data={"name": "Updated"}
        )

        assert result["status_code"] == 200

    @patch("rpaforge_libraries.HTTP.library.requests.Session")
    def test_delete_request(self, mock_session_class):
        """Test DELETE request."""
        mock_session = MagicMock()
        mock_response = Mock()
        mock_response.status_code = 204
        mock_response.reason = "No Content"
        mock_response.headers = {}
        mock_response.url = "https://api.example.com/users/1"
        mock_response.elapsed.total_seconds.return_value = 0.1
        mock_response.text = ""
        mock_session.request.return_value = mock_response
        mock_session_class.return_value = mock_session

        http = HTTP()
        result = http.delete("https://api.example.com/users/1")

        assert result["status_code"] == 204

    @patch("rpaforge_libraries.HTTP.library.requests.Session")
    def test_patch_request(self, mock_session_class):
        """Test PATCH request."""
        mock_session = MagicMock()
        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.reason = "OK"
        mock_response.headers = {}
        mock_response.url = "https://api.example.com/users/1"
        mock_response.elapsed.total_seconds.return_value = 0.15
        mock_response.json.return_value = {"id": 1, "patched": True}
        mock_session.request.return_value = mock_response
        mock_session_class.return_value = mock_session

        http = HTTP()
        result = http.patch(
            "https://api.example.com/users/1", json_data={"name": "Patched"}
        )

        assert result["status_code"] == 200

    @patch("rpaforge_libraries.HTTP.library.requests.Session")
    def test_request_with_custom_method(self, mock_session_class):
        """Test generic request method with custom HTTP method."""
        mock_session = MagicMock()
        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.reason = "OK"
        mock_response.headers = {}
        mock_response.url = "https://api.example.com/"
        mock_response.elapsed.total_seconds.return_value = 0.05
        mock_response.text = "OK"
        mock_session.request.return_value = mock_response
        mock_session_class.return_value = mock_session

        http = HTTP()
        result = http.request("HEAD", "https://api.example.com/")

        assert result["status_code"] == 200

    def test_request_invalid_method(self):
        """Test request with invalid HTTP method."""
        http = HTTP()
        with pytest.raises(ValueError, match="Invalid HTTP method"):
            http.request("INVALID", "https://api.example.com/")


class TestHTTPBaseUrl:
    """Tests for base URL handling."""

    @patch("rpaforge_libraries.HTTP.library.requests.Session")
    def test_base_url_concatenation(self, mock_session_class):
        """Test that relative URLs are concatenated to base URL."""
        mock_session = MagicMock()
        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.reason = "OK"
        mock_response.headers = {}
        mock_response.url = "https://api.example.com/users"
        mock_response.elapsed.total_seconds.return_value = 0.1
        mock_response.json.return_value = {}
        mock_session.request.return_value = mock_response
        mock_session_class.return_value = mock_session

        http = HTTP()
        http.configure(base_url="https://api.example.com")
        http.get("/users")

        call_kwargs = mock_session.request.call_args[1]
        assert call_kwargs["url"] == "https://api.example.com/users"


class TestHTTPRetry:
    """Tests for retry functionality."""

    def test_retry_on_failure(self):
        """Test that requests are retried on failure."""
        import requests

        http = HTTP()
        http.configure(default_retry_count=2, default_retry_delay=0.01)

        responses = [
            requests.exceptions.ConnectionError("Connection error"),
            requests.exceptions.ConnectionError("Connection error"),
            Mock(
                status_code=200,
                reason="OK",
                headers={},
                url="https://api.example.com/",
                elapsed=Mock(total_seconds=lambda: 0.1),
                text="OK",
            ),
        ]

        def mock_request(*args, **kwargs):
            response = responses.pop(0)
            if isinstance(response, Exception):
                raise response
            return response

        session = http._get_session()
        session.request = mock_request
        result = http.get("https://api.example.com/")

        assert result["status_code"] == 200
        assert len(responses) == 0


class TestHTTPSession:
    """Tests for session management."""

    def test_close_session(self):
        """Test closing the HTTP session."""
        http = HTTP()
        session_mock = MagicMock()
        http._session = session_mock
        result = http.close()
        assert result == "HTTP session closed"
        session_mock.close.assert_called_once()
