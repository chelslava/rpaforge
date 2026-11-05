"""Tests for MCP integration (issue #853)."""

from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest

from rpaforge.mcp.config import (
    MCPConfigError,
    load_mcp_config,
    parse_mcp_config,
    resolve_mcp_config_path,
)

pytest.importorskip("mcp")

ASSETS = Path(__file__).parent / "assets"


# ---------------------------------------------------------------------------
# Manifest parsing
# ---------------------------------------------------------------------------


class TestConfigParsing:
    def test_parses_full_manifest(self):
        servers = parse_mcp_config(
            {
                "servers": [
                    {
                        "name": "invoices",
                        "transport": "stdio",
                        "command": "uvx",
                        "args": ["mcp-server-invoices"],
                        "env": {"API_KEY": "x"},
                    },
                    {
                        "name": "search",
                        "transport": "http",
                        "url": "https://mcp.internal/search",
                        "headers": {"Authorization": "Bearer t"},
                    },
                ]
            }
        )
        assert [s.name for s in servers] == ["invoices", "search"]
        assert servers[0].library_name == "MCP:invoices"
        assert servers[1].url == "https://mcp.internal/search"

    def test_stdio_requires_command(self):
        with pytest.raises(MCPConfigError, match="command"):
            parse_mcp_config({"servers": [{"name": "x", "transport": "stdio"}]})

    def test_http_requires_url(self):
        with pytest.raises(MCPConfigError, match="url"):
            parse_mcp_config({"servers": [{"name": "x", "transport": "http"}]})

    def test_duplicate_names_rejected(self):
        with pytest.raises(MCPConfigError, match="duplicate"):
            parse_mcp_config(
                {
                    "servers": [
                        {"name": "a", "transport": "http", "url": "u1"},
                        {"name": "a", "transport": "http", "url": "u2"},
                    ]
                }
            )

    def test_invalid_name_rejected(self):
        with pytest.raises(MCPConfigError, match="A-Za-z0-9"):
            parse_mcp_config(
                {"servers": [{"name": "bad name!", "transport": "http", "url": "u"}]}
            )

    def test_load_from_file(self, tmp_path: Path):
        path = tmp_path / "mcp.json"
        path.write_text(
            json.dumps({"servers": [{"name": "a", "transport": "http", "url": "u"}]}),
            encoding="utf-8",
        )
        assert [s.name for s in load_mcp_config(path)] == ["a"]

    def test_load_missing_file_raises(self, tmp_path: Path):
        with pytest.raises(MCPConfigError, match="cannot read"):
            load_mcp_config(tmp_path / "absent.json")

    def test_resolve_prefers_env(self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
        manifest = tmp_path / "mcp.json"
        manifest.write_text("{}", encoding="utf-8")
        monkeypatch.setenv("RPAFORGE_MCP_CONFIG", str(manifest))
        assert resolve_mcp_config_path(tmp_path / "x.process") == manifest

    def test_resolve_diagram_side_default(
        self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
    ):
        monkeypatch.delenv("RPAFORGE_MCP_CONFIG", raising=False)
        diagram = tmp_path / "proc.process"
        diagram.write_text("{}", encoding="utf-8")
        config_dir = tmp_path / ".rpaforge"
        config_dir.mkdir()
        manifest = config_dir / "mcp.json"
        manifest.write_text("{}", encoding="utf-8")
        assert resolve_mcp_config_path(diagram) == manifest

    def test_resolve_none_when_absent(
        self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
    ):
        monkeypatch.delenv("RPAFORGE_MCP_CONFIG", raising=False)
        assert resolve_mcp_config_path(tmp_path / "proc.process") is None


# ---------------------------------------------------------------------------
# Live stdio integration (stub server)
# ---------------------------------------------------------------------------


@pytest.fixture()
def demo_manifest(tmp_path: Path) -> Path:
    manifest = tmp_path / "mcp.json"
    manifest.write_text(
        json.dumps(
            {
                "servers": [
                    {
                        "name": "demo",
                        "transport": "stdio",
                        "command": sys.executable,
                        "args": ["-u", str(ASSETS / "mcp_stub_server.py")],
                    }
                ]
            }
        ),
        encoding="utf-8",
    )
    return manifest


# The live stdio tests verify the full integration on POSIX (CI ubuntu/
# macos legs). On Windows the SDK 2.x stdio subprocess teardown can leave
# the spawned server holding inherited pytest capture pipes, hanging the
# session end — a flake independent of the code under test.
@pytest.mark.skipif(
    sys.platform == "win32",
    reason="SDK 2.x stdio teardown flaky under pytest on Windows",
)
class TestLiveServer:
    def test_register_libraries_and_catalog(self, demo_manifest: Path):
        from rpaforge.core.agentic import build_tool_catalog
        from rpaforge.core.executor import ProcessExecutor
        from rpaforge.mcp.library import (
            MCP_TOOL_REGISTRY,
            register_mcp_libraries,
        )

        executor = ProcessExecutor()
        try:
            registered = register_mcp_libraries(executor, str(demo_manifest))
            assert registered == ["MCP:demo"]

            # Catalog exposes both tools through the agentic builder
            keys = list(MCP_TOOL_REGISTRY.keys())
            catalog = build_tool_catalog(keys)
            tool_names = {entry["name"] for entry in catalog}
            assert {"echo", "add"} <= tool_names

            # Standard dispatch path executes a tool call end-to-end
            method = "tool_echo"
            library = executor._libraries["MCP:demo"]
            output = getattr(library, method)(text="hello")
            assert output == "echo:hello"

            # JSON-able args map the same way through kwargs
            add_key = next(k for k in keys if k.endswith("tool_add"))
            add_method = add_key.split(".", 1)[1]
            output2 = getattr(executor._libraries["MCP:demo"], add_method)(a=2, b=3)
            assert output2 == 5
        finally:
            for lib in executor._libraries.values():
                close = getattr(lib, "close", None)
                if close is not None:
                    close()
            MCP_TOOL_REGISTRY.clear()

    def test_connection_failure_is_fail_closed(self, tmp_path: Path):
        """An unreachable server fails registration (fail-closed, #853)."""
        from rpaforge.mcp.library import MCPConnectionError, register_mcp_libraries

        # Deterministic transport failure: the command does not exist, so
        # the spawn fails instantly (no SDK reconnection retries involved).
        manifest = tmp_path / "bad.json"
        manifest.write_text(
            json.dumps(
                {
                    "servers": [
                        {
                            "name": "gone",
                            "transport": "stdio",
                            "command": "rpaforge-definitely-not-a-binary-xyz",
                            "args": [],
                        }
                    ]
                }
            ),
            encoding="utf-8",
        )
        with pytest.raises(MCPConnectionError, match="failed to connect"):
            register_mcp_libraries(ProcessExecutorStub(), str(manifest))


class ProcessExecutorStub:
    def register_library(self, _name: str, _instance: object) -> None:
        raise AssertionError("connection must fail before registration")
