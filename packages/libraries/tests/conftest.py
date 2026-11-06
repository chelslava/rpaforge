"""Pytest configuration for libraries tests."""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

libs_src = Path(__file__).parent.parent / "src"
if str(libs_src) not in sys.path:
    sys.path.insert(0, str(libs_src))


@pytest.fixture(autouse=True)
def _http_ssrf_dns_bypass(monkeypatch):
    """Bypass DNS resolution in the HTTP library SSRF guard for unit tests.

    Tests that exercise the guard itself monkeypatch
    ``rpaforge_libraries.HTTP.library.resolve_blocked_address`` again with
    canned resolution results.
    """
    monkeypatch.setattr(
        "rpaforge_libraries.HTTP.library.resolve_blocked_address",
        lambda _hostname: None,
    )


@pytest.fixture
def tmp_vault_path(tmp_path):
    """Fixture for temporary vault path."""
    return tmp_path / "vault.json"


@pytest.fixture
def tmp_credentials_dir(tmp_path):
    """Fixture for temporary credentials directory."""
    return tmp_path / "credentials"
