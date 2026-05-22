"""Pytest configuration for libraries tests."""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

libs_src = Path(__file__).parent.parent / "src"
if str(libs_src) not in sys.path:
    sys.path.insert(0, str(libs_src))


@pytest.fixture
def tmp_vault_path(tmp_path):
    """Fixture for temporary vault path."""
    return tmp_path / "vault.json"


@pytest.fixture
def tmp_credentials_dir(tmp_path):
    """Fixture for temporary credentials directory."""
    return tmp_path / "credentials"
