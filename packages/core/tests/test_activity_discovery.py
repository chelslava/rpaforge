"""Tests for plugin discovery via the 'rpaforge.libraries' entry-point group."""

from __future__ import annotations

import sys
from importlib.metadata import EntryPoint
from pathlib import Path

import pytest

from rpaforge.core.activity import (
    LIBRARY_REGISTRY,
    activity,
    discover_libraries,
    get_library_module,
    library,
)
from rpaforge.core.executor import ProcessExecutor


# EntryPoint.load() resolves "<module>:<attr>" via getattr() on the imported
# module, so the fake library classes used as entry-point targets below must
# live at module level — a class nested inside a test function is not a
# module attribute and can't be resolved that way.
@library(name="FakeOne")
class _FakeOne:
    @activity(name="Noop")
    def noop(self) -> None:
        return None


@library(name="FakeTwo")
class _FakeTwo:
    pass


class TestDiscoverLibraries:
    def test_discovers_a_well_formed_entry_point(self, monkeypatch):
        ep = EntryPoint(
            name="FakeOne", value=f"{__name__}:_FakeOne", group="rpaforge.libraries"
        )
        monkeypatch.setattr("importlib.metadata.entry_points", lambda **_kwargs: [ep])

        discovered = discover_libraries()

        assert discovered == [("FakeOne", _FakeOne)]

    def test_skips_entry_point_with_missing_optional_dependency(
        self, monkeypatch, caplog
    ):
        ep = EntryPoint(
            name="Missing",
            value="this_module_does_not_exist_at_all:Missing",
            group="rpaforge.libraries",
        )
        monkeypatch.setattr("importlib.metadata.entry_points", lambda **_kwargs: [ep])

        discovered = discover_libraries()

        assert discovered == []
        assert "Missing" in caplog.text

    def test_skips_entry_point_that_raises_unexpectedly(self, monkeypatch):
        class _BoomEntryPoint:
            name = "Boom"
            value = "boom:Boom"
            group = "rpaforge.libraries"

            def load(self):
                raise RuntimeError("kaboom")

        monkeypatch.setattr(
            "importlib.metadata.entry_points", lambda **_kwargs: [_BoomEntryPoint()]
        )

        discovered = discover_libraries()

        assert discovered == []

    def test_continues_after_a_failing_entry_point(self, monkeypatch):
        bad_ep = EntryPoint(
            name="Missing", value="nope:Nope", group="rpaforge.libraries"
        )
        good_ep = EntryPoint(
            name="FakeTwo", value=f"{__name__}:_FakeTwo", group="rpaforge.libraries"
        )
        monkeypatch.setattr(
            "importlib.metadata.entry_points", lambda **_kwargs: [bad_ep, good_ep]
        )

        discovered = discover_libraries()

        assert discovered == [("FakeTwo", _FakeTwo)]


class TestBuiltinLibrariesAreDiscoverable:
    """Regression test for the BUG-003 class of bug: a library defined in
    packages/libraries but missing from the discovery mechanism never shows
    up in getActivities()/the Studio palette/AI generation context. This
    iterates the *real* installed `rpaforge.libraries` entry points (no
    mocking) so a future library added without an entry point fails here."""

    def test_all_expected_builtin_libraries_are_discovered(self):
        discovered_names = {name for name, _ in discover_libraries()}

        expected = {
            "DesktopUI",
            "Excel",
            "File",
            "Flow",
            "HTTP",
            "String",
            "DateTime",
            "Variables",
            "WebUI",
            "DataFrames",
            "OCR",
            "Credentials",
            "Database",
        }
        missing = expected - discovered_names
        assert not missing, f"Libraries missing from discovery: {missing}"

    def test_discovered_classes_are_library_decorated(self):
        for name, cls in discover_libraries():
            assert name in LIBRARY_REGISTRY, f"{name} did not register via @library"
            assert cls._library_meta.module, f"{name} is missing LibraryMeta.module"


class TestLibraryMetaModule:
    def test_library_decorator_captures_module_path(self):
        @library(name="ModuleCheckLib")
        class ModuleCheckLib:
            pass

        assert ModuleCheckLib._library_meta.module == __name__

    def test_get_library_module_returns_module_for_registered_library(self):
        @library(name="GetModuleLib")
        class GetModuleLib:
            pass

        assert get_library_module("GetModuleLib") == __name__

    def test_get_library_module_returns_none_for_unknown_library(self):
        assert get_library_module("ThisLibraryDoesNotExist") is None


class TestExecutorUsesRealLibraryModule:
    """executor.py used to hardcode `f"rpaforge_libraries.{library}"` as the
    subprocess re-import path, which only happened to work for built-ins and
    would silently break for a third-party library with a different
    namespace. Confirms the real registered module is used instead."""

    def test_subprocess_dispatch_uses_registered_module_not_hardcoded_prefix(self):
        @library(name="ThirdPartyStyleLib")
        class ThirdPartyStyleLib:
            @activity(name="Do Thing")
            def do_thing(self) -> str:
                return "done"

        executor = ProcessExecutor()
        executor.register_library("ThirdPartyStyleLib", ThirdPartyStyleLib())

        captured: dict[str, object] = {}

        class _FakeSubprocessExecutor:
            def execute_with_timeout(
                self, library_path, _activity_name, *_args, **_kwargs
            ):
                captured["library_path"] = library_path
                return "ok"

        executor._subprocess_executor = _FakeSubprocessExecutor()

        result = executor._execute_activity(
            "ThirdPartyStyleLib", "do_thing", timeout_ms=1000
        )

        assert result == "ok"
        assert captured["library_path"] == __name__
        assert captured["library_path"] != "rpaforge_libraries.ThirdPartyStyleLib"


class TestThirdPartyExampleLibrary:
    """End-to-end proof that a library living entirely outside this monorepo
    is discoverable through the same entry-point mechanism, without any
    rpaforge-core changes — the actual SDK contract."""

    def test_sdk_hello_library_example_is_discoverable(self, monkeypatch):
        example_src = (
            Path(__file__).resolve().parents[3]
            / "examples"
            / "sdk-hello-library"
            / "src"
        )
        if not example_src.is_dir():
            pytest.skip("examples/sdk-hello-library not present in this checkout")

        monkeypatch.syspath_prepend(str(example_src))
        sys.modules.pop("sdk_hello_library", None)
        sys.modules.pop("sdk_hello_library.library", None)

        ep = EntryPoint(
            name="HelloWorld",
            value="sdk_hello_library.library:HelloWorld",
            group="rpaforge.libraries",
        )
        monkeypatch.setattr("importlib.metadata.entry_points", lambda **_kwargs: [ep])

        discovered = discover_libraries()

        assert len(discovered) == 1
        name, cls = discovered[0]
        assert name == "HelloWorld"
        assert cls().greet("Plugin") == "Hello, Plugin!"
