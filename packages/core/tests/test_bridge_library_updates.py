"""Tests for the checkLibraryUpdates bridge handler (auto install/update)."""

from __future__ import annotations

import pytest

from rpaforge.bridge.handlers.libraries import _handle_check_library_updates


class TestCheckLibraryUpdates:
    def test_installed_package_reported(self) -> None:
        result = _handle_check_library_updates(
            None, {"expected": {"rpaforge-core": "999.0.0"}}
        )
        entry = result["updates"]["rpaforge-core"]
        assert entry["installed"] is not None
        assert entry["installed"] != "999.0.0"
        assert entry["update_available"] is True
        assert entry["not_installed"] is False

    def test_matching_version_no_update(self) -> None:
        current = __import__("importlib").metadata.version("rpaforge-core")
        result = _handle_check_library_updates(
            None, {"expected": {"rpaforge-core": current}}
        )
        entry = result["updates"]["rpaforge-core"]
        assert entry["update_available"] is False

    def test_unknown_package_flagged_not_installed(self) -> None:
        result = _handle_check_library_updates(
            None, {"expected": {"definitely-not-installed-xyz": "1.0.0"}}
        )
        entry = result["updates"]["definitely-not-installed-xyz"]
        assert entry["installed"] is None
        assert entry["not_installed"] is True
        assert entry["update_available"] is False

    def test_invalid_package_spec_rejected(self) -> None:
        with pytest.raises(ValueError):
            _handle_check_library_updates(None, {"expected": {"evil --pre": "1.0.0"}})

    def test_non_string_mapping_rejected(self) -> None:
        with pytest.raises(ValueError):
            _handle_check_library_updates(None, {"expected": {"pkg": 3}})
        with pytest.raises(ValueError):
            _handle_check_library_updates(None, {"expected": "nope"})
