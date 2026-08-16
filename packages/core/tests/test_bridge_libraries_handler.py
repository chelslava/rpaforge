"""Tests for bridge library-management security (hash verification + spec allow-list)."""

from __future__ import annotations

import hashlib
import json

import pytest

from rpaforge.bridge.handlers.libraries import (
    _validate_package_spec,
    _verify_package_hash,
)


class _FakeResponse:
    """Minimal stand-in for urllib.request.urlopen's context-manager response."""

    def __init__(self, payload: bytes) -> None:
        self._payload = payload

    def read(self) -> bytes:
        return self._payload

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False


def _install_fake_pypi(monkeypatch, wheel_bytes: bytes, dist_url: str) -> None:
    """Point the handler's network calls at a fake PyPI providing one wheel."""
    pypi_json = {"info": {"urls": [{"url": dist_url, "filename": "test.whl"}]}}

    def fake_urlopen(url, timeout=None):
        if "pypi.org/pypi" in url:
            return _FakeResponse(json.dumps(pypi_json).encode())
        if url == dist_url:
            return _FakeResponse(wheel_bytes)
        raise AssertionError(f"Unexpected URL: {url}")

    monkeypatch.setattr(
        "rpaforge.bridge.handlers.libraries.urllib.request.urlopen", fake_urlopen
    )


class TestValidatePackageSpec:
    """Security allow-list for pip package specs received over IPC (#681)."""

    def test_accepts_simple_name(self):
        _validate_package_spec("requests")

    def test_accepts_normalized_name_with_underscores_dots(self):
        _validate_package_spec("some_pkg-extra_thing")

    def test_accepts_version_specifier(self):
        _validate_package_spec("requests>=2.0,<3.0")
        _validate_package_spec("flask==2.2.5")
        _validate_package_spec("pandas>=1.5,!=1.6.0,<2.0")

    def test_accepts_extras(self):
        _validate_package_spec("rpaforge-libraries[ocr]")
        _validate_package_spec("django[argon2,bcrypt]")

    def test_rejects_empty(self):
        with pytest.raises(ValueError, match="must not be empty"):
            _validate_package_spec("")
        with pytest.raises(ValueError, match="must not be empty"):
            _validate_package_spec("   ")

    def test_rejects_pip_option_injection(self):
        with pytest.raises(ValueError, match="must not start with"):
            _validate_package_spec("--index-url http://evil.example")
        with pytest.raises(ValueError, match="must not start with"):
            _validate_package_spec("--user numpy")

    def test_rejects_whitespace_split_extra_args(self):
        with pytest.raises(ValueError, match="disallowed character"):
            _validate_package_spec("numpy --index-url http://evil.example")

    def test_rejects_url_and_vcs(self):
        with pytest.raises(ValueError, match="disallowed character"):
            _validate_package_spec("git+https://github.com/evil/repo.git")
        with pytest.raises(ValueError, match="disallowed character"):
            _validate_package_spec("https://example.com/evil.whl")

    def test_rejects_shell_metacharacters(self):
        for spec in ("numpy; rm -rf /", "numpy& wget evil", "pkg|sh", "pkg`id`"):
            with pytest.raises(ValueError, match="disallowed character"):
                _validate_package_spec(spec)


class TestVerifyPackageHashHardFail:
    """A checksum mismatch must raise (block install), not be swallowed (#681)."""

    def test_mismatched_file_hash_raises_value_error(self, monkeypatch):
        """When the downloaded artifact does not match the expected hash, the
        install must be blocked (ValueError propagates to the caller)."""
        wheel_bytes = b"not-a-real-wheel-content"
        dist_url = "https://files.example/test-1.0-py3-none-any.whl"
        _install_fake_pypi(monkeypatch, wheel_bytes, dist_url)

        # Expected hash (all zeros) intentionally differs from the artifact's.
        with pytest.raises(ValueError, match="Checksum mismatch"):
            _verify_package_hash("test-pkg", expected_sha256="0" * 64)

    def test_matching_hash_passes(self, monkeypatch):
        """A matching hash must not raise (verification passes)."""
        wheel_bytes = b"real-wheel-content"
        dist_url = "https://files.example/test-1.0-py3-none-any.whl"
        expected = hashlib.sha256(wheel_bytes).hexdigest()
        _install_fake_pypi(monkeypatch, wheel_bytes, dist_url)

        # Must not raise.
        _verify_package_hash("test-pkg", expected_sha256=expected)

    def test_no_hash_provided_skips_verification(self):
        """Backward compat: no expected hash => verification skipped silently."""
        _verify_package_hash("some-pkg", expected_sha256=None)
        _verify_package_hash("some-pkg", expected_sha256="   ")
