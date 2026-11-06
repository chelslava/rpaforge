"""SSRF guard tests for the HTTP library (issue #861).

The autouse ``_http_ssrf_dns_bypass`` fixture in conftest.py disables DNS
resolution for all HTTP-library tests; these tests re-patch
``rpaforge_libraries.HTTP.library.resolve_blocked_address`` with canned
results to exercise the guard deterministically.
"""

from __future__ import annotations

from unittest.mock import MagicMock, Mock, patch

import pytest

from rpaforge_libraries.HTTP import HTTP

GUARD = "rpaforge_libraries.HTTP.library.resolve_blocked_address"


def _mock_response(
    status_code: int = 200,
    headers: dict | None = None,
    url: str = "https://api.example.com/users",
) -> Mock:
    response = Mock()
    response.status_code = status_code
    response.reason = "OK" if status_code == 200 else "Redirect"
    response.headers = (
        headers if headers is not None else {"Content-Type": "application/json"}
    )
    response.url = url
    response.elapsed.total_seconds.return_value = 0.1
    response.json.return_value = {"ok": True}
    return response


def _mock_session(responses: list[Mock]) -> tuple:
    session_instance = MagicMock()
    session_instance.request.side_effect = responses
    patcher = patch("rpaforge_libraries.HTTP.library.requests.Session")
    mocked = patcher.start()
    mocked.return_value = session_instance
    return patcher, session_instance


@pytest.fixture(autouse=True)
def _restore_patches():
    yield
    patch.stopall()


class TestHttpSsrfGuard:
    """Default-on SSRF denylist for HTTP library requests (issue #861)."""

    def test_get_blocked_loopback_ip(self, monkeypatch):
        monkeypatch.setattr(
            GUARD,
            lambda _hostname: "resolves to non-public address 127.0.0.1",
        )
        http = HTTP()
        with pytest.raises(ConnectionError, match="SSRF guard"):
            http.get("http://127.0.0.1:8080/api")

    def test_get_blocked_metadata_ip(self, monkeypatch):
        monkeypatch.setattr(
            GUARD,
            lambda _hostname: "resolves to non-public address 169.254.169.254",
        )
        http = HTTP()
        with pytest.raises(ConnectionError, match="169.254.169.254"):
            http.get("http://169.254.169.254/latest/meta-data/")

    def test_get_blocked_ipv6_loopback(self, monkeypatch):
        monkeypatch.setattr(
            GUARD,
            lambda _hostname: "resolves to non-public address ::1",
        )
        http = HTTP()
        with pytest.raises(ConnectionError, match="SSRF guard"):
            http.get("http://[::1]:8080/api")

    def test_get_blocked_dns_failure(self, monkeypatch):
        """DNS failure counts as blocked (fail closed)."""
        monkeypatch.setattr(GUARD, lambda _hostname: "DNS resolution failed (OSError)")
        http = HTTP()
        with pytest.raises(ConnectionError, match="SSRF guard"):
            http.get("http://unresolvable.invalid/api")

    def test_public_host_passes(self, monkeypatch):
        monkeypatch.setattr(GUARD, lambda _hostname: None)
        response = _mock_response()
        patcher, session = _mock_session([response])
        http = HTTP()
        result = http.get("https://api.example.com/users")
        assert result["status_code"] == 200
        assert session.request.call_count == 1

    def test_opt_out_env_allows_private(self, monkeypatch):
        monkeypatch.setenv("RPAFORGE_HTTP_ALLOW_PRIVATE", "1")
        calls: list[str] = []

        def fake_resolve(hostname: str) -> str | None:
            calls.append(hostname)
            return "resolves to non-public address 127.0.0.1"

        monkeypatch.setattr(GUARD, fake_resolve)
        response = _mock_response(url="http://127.0.0.1:8080/api")
        patcher, session = _mock_session([response])
        http = HTTP()
        result = http.get("http://127.0.0.1:8080/api")
        assert result["status_code"] == 200
        assert calls == []  # opt-out short-circuits the guard entirely

    def test_configure_allow_private_overrides_guard(self, monkeypatch):
        monkeypatch.setattr(
            GUARD,
            lambda _hostname: "resolves to non-public address 127.0.0.1",
        )
        response = _mock_response(url="http://127.0.0.1:8080/api")
        patcher, session = _mock_session([response])
        http = HTTP()
        http.configure(allow_private_addresses=True)
        result = http.get("http://127.0.0.1:8080/api")
        assert result["status_code"] == 200

    def test_configure_false_overrides_env(self, monkeypatch):
        monkeypatch.setenv("RPAFORGE_HTTP_ALLOW_PRIVATE", "1")
        monkeypatch.setattr(
            GUARD,
            lambda _hostname: "resolves to non-public address 127.0.0.1",
        )
        http = HTTP()
        http.configure(allow_private_addresses=False)
        with pytest.raises(ConnectionError, match="SSRF guard"):
            http.get("http://127.0.0.1:8080/api")


class TestHttpSsrfRedirects:
    """Redirect hops are followed manually and re-validated per hop."""

    def test_redirect_to_private_blocked(self, monkeypatch):
        """A public server redirecting to the metadata endpoint is refused."""

        def fake_resolve(hostname: str) -> str | None:
            if hostname == "169.254.169.254":
                return "resolves to non-public address 169.254.169.254"
            return None

        monkeypatch.setattr(GUARD, fake_resolve)
        first = _mock_response(
            302,
            headers={"Location": "http://169.254.169.254/latest/meta-data/"},
            url="http://api.example.com/old",
        )
        patcher, session = _mock_session([first])
        http = HTTP()
        with pytest.raises(ConnectionError, match="SSRF guard"):
            http.get("http://api.example.com/old")
        assert session.request.call_count == 1  # stopped at the first hop

    def test_redirect_to_public_followed(self, monkeypatch):
        monkeypatch.setattr(GUARD, lambda _hostname: None)
        first = _mock_response(302, headers={"Location": "https://api.example.com/new"})
        second = _mock_response(url="https://api.example.com/new")
        patcher, session = _mock_session([first, second])
        http = HTTP()
        result = http.get("http://api.example.com/old")
        assert result["status_code"] == 200
        assert result["url"] == "https://api.example.com/new"
        assert session.request.call_count == 2

    def test_post_303_downgraded_to_get(self, monkeypatch):
        monkeypatch.setattr(GUARD, lambda _hostname: None)
        first = _mock_response(
            303, headers={"Location": "https://api.example.com/done"}
        )
        second = _mock_response()
        patcher, session = _mock_session([first, second])
        http = HTTP()
        http.post("http://api.example.com/submit", json_data={"a": 1})
        first_call = session.request.call_args_list[0]
        second_call = session.request.call_args_list[1]
        assert first_call.kwargs["method"] == "POST"
        assert second_call.kwargs["method"] == "GET"
        assert second_call.kwargs["json"] is None

    def test_redirect_loop_bounded(self, monkeypatch):
        monkeypatch.setattr(GUARD, lambda _hostname: None)
        redirect = _mock_response(
            302, headers={"Location": "http://api.example.com/loop"}
        )
        patcher, session = _mock_session([redirect] * 50)
        http = HTTP()
        with pytest.raises(ConnectionError, match="redirects"):
            http.get("http://api.example.com/loop")
        assert session.request.call_count == 11  # MAX_REDIRECTS + 1


class TestHttpSsrfRetryInteraction:
    """Guard refusals are configuration errors: never retried."""

    def test_guard_refusal_not_retried(self, monkeypatch):
        monkeypatch.setattr(
            GUARD,
            lambda _hostname: "resolves to non-public address 127.0.0.1",
        )
        patcher, session = _mock_session([])
        http = HTTP()
        with pytest.raises(ConnectionError, match="SSRF guard"):
            http.request("GET", "http://127.0.0.1:8080/api", retry_count=3)
        assert session.request.call_count == 0

    def test_network_error_still_retried(self, monkeypatch):
        """Non-guard failures keep the existing retry semantics."""
        import requests as requests_lib

        monkeypatch.setattr(GUARD, lambda _hostname: None)
        session_instance = MagicMock()
        session_instance.request.side_effect = requests_lib.exceptions.ConnectTimeout(
            "boom"
        )
        with patch(
            "rpaforge_libraries.HTTP.library.requests.Session"
        ) as mock_session_class:
            mock_session_class.return_value = session_instance
            http = HTTP()
            with patch("rpaforge_libraries.HTTP.library.time.sleep") as mock_sleep:
                with pytest.raises(ConnectionError, match="after 3 attempts"):
                    http.request("GET", "https://api.example.com/api", retry_count=2)
        assert session_instance.request.call_count == 3
        assert mock_sleep.call_count == 2
