"""MCP (Model Context Protocol) integration for RPAForge (issue #853).

Lets the agentic-loop call tools exposed by external MCP servers. Tools
are registered as a synthetic library ``MCP:<server>`` on the executor,
so the standard dispatch path — whitelisting, permission policies,
timeouts, audit events — applies unchanged.

Servers are declared in a JSON manifest (default resolution: the
``RPAFORGE_MCP_CONFIG`` environment variable, then ``.rpaforge/mcp.json``
next to the diagram)::

    {
      "servers": [
        {
          "name": "invoices",
          "transport": "stdio",
          "command": "uvx",
          "args": ["mcp-server-invoices"],
          "env": {"API_KEY_FILE": "~/.secrets/invoices"}
        },
        {
          "name": "search",
          "transport": "http",
          "url": "https://mcp.internal.corp/search/mcp",
          "headers": {"Authorization": "Bearer ${MCP_TOKEN}"}
        }
      ]
    }

The SDK lives behind the ``[mcp]`` extra and is imported lazily —
without it, a configured manifest raises a typed error only when MCP
servers are actually declared.
"""

from __future__ import annotations

import json
import os
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import rpaforge.config as config

__all__ = [
    "MCPServerConfig",
    "MCPConfigError",
    "load_mcp_config",
    "resolve_mcp_config_path",
]

#: Environment variable pointing at an MCP server manifest (issue #853).
ENV_MCP_CONFIG = config.ENV_MCP_CONFIG

_DEFAULT_FILENAME = ".rpaforge/mcp.json"


class MCPConfigError(ValueError):
    """Raised when an MCP manifest cannot be parsed or fails validation."""


@dataclass(frozen=True)
class MCPServerConfig:
    """One MCP server declaration (picklable)."""

    name: str
    transport: str  # "stdio" | "http"
    command: str | None = None
    args: tuple[str, ...] = ()
    env: dict[str, str] = field(default_factory=dict)
    url: str | None = None
    headers: dict[str, str] = field(default_factory=dict)

    @property
    def library_name(self) -> str:
        """Executor library name for this server's tools."""
        return f"MCP:{self.name}"


def _require(value: Any, what: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise MCPConfigError(f"MCP server '{what}' must be a non-empty string")
    return value.strip()


def _parse_server(data: Any, index: int) -> MCPServerConfig:
    if not isinstance(data, dict):
        raise MCPConfigError(f"servers[{index}] must be an object")
    unknown = set(data) - {
        "name",
        "transport",
        "command",
        "args",
        "env",
        "url",
        "headers",
    }
    if unknown:
        raise MCPConfigError(f"servers[{index}]: unknown keys {sorted(unknown)}")
    name = _require(data.get("name"), "name")
    if not re.fullmatch(r"[A-Za-z0-9_-]+", name):
        raise MCPConfigError(
            f"servers[{index}].name must match [A-Za-z0-9_-]+ (got {name!r})"
        )
    transport = str(data.get("transport", "stdio")).strip().lower()
    if transport not in ("stdio", "http"):
        raise MCPConfigError(f"servers[{index}].transport must be 'stdio' or 'http'")
    command = data.get("command")
    url = data.get("url")
    if transport == "stdio":
        command = _require(command, "command")
    else:
        url = _require(url, "url")
    args = data.get("args", [])
    if not isinstance(args, list) or any(not isinstance(a, str) for a in args):
        raise MCPConfigError(f"servers[{index}].args must be a list of strings")
    for key_name in ("env", "headers"):
        section = data.get(key_name, {})
        if not isinstance(section, dict) or any(
            not isinstance(k, str) or not isinstance(v, str) for k, v in section.items()
        ):
            raise MCPConfigError(f"servers[{index}].{key_name} must be a string map")
    return MCPServerConfig(
        name=name,
        transport=transport,
        command=command,
        args=tuple(args),
        env=dict(data.get("env", {})),
        url=url,
        headers=dict(data.get("headers", {})),
    )


def parse_mcp_config(
    data: Any, source_path: str | None = None
) -> list[MCPServerConfig]:
    """Parse a raw manifest dict into server configs (validating)."""
    if not isinstance(data, dict):
        raise MCPConfigError("MCP manifest must be a JSON object")
    unknown = set(data) - {"servers"}
    if unknown:
        raise MCPConfigError(f"unknown MCP manifest keys: {sorted(unknown)}")
    servers_raw = data.get("servers", [])
    if not isinstance(servers_raw, list):
        raise MCPConfigError("'servers' must be a list")
    servers = [_parse_server(s, i) for i, s in enumerate(servers_raw)]
    names = [s.name for s in servers]
    if len(names) != len(set(names)):
        raise MCPConfigError("duplicate MCP server names in manifest")
    return servers


def load_mcp_config(path: str | Path) -> list[MCPServerConfig]:
    """Load an MCP server manifest from a JSON file."""
    manifest_path = Path(path).expanduser()
    try:
        raw = manifest_path.read_text(encoding="utf-8")
    except OSError as exc:
        raise MCPConfigError(
            f"cannot read MCP manifest {manifest_path}: {exc}"
        ) from exc
    try:
        data = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise MCPConfigError(
            f"invalid JSON in MCP manifest {manifest_path}: {exc}"
        ) from exc
    return parse_mcp_config(data, source_path=str(manifest_path))


def resolve_mcp_config_path(diagram_path: str | Path | None = None) -> Path | None:
    """Resolve the MCP manifest path (env > diagram-side default > None)."""
    env_path = os.environ.get(ENV_MCP_CONFIG, "").strip()
    if env_path:
        candidate = Path(env_path).expanduser()
        return candidate if candidate.exists() else None
    if diagram_path is not None:
        base = Path(diagram_path).expanduser()
        directory = base.parent if base.is_file() else base
        candidate = directory / _DEFAULT_FILENAME
        if candidate.exists():
            return candidate
    return None
