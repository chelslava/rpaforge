"""MCP (Model Context Protocol) integration (issue #853).

External MCP servers' tools become a synthetic ``MCP:<server>`` library on
the executor, callable from the agentic-loop with standard dispatch
semantics. Manifest resolution and the ``[mcp]`` extra policy are
documented in :mod:`rpaforge.mcp.config`.
"""

from rpaforge.mcp.config import (
    ENV_MCP_CONFIG,
    MCPConfigError,
    MCPServerConfig,
    load_mcp_config,
    parse_mcp_config,
    resolve_mcp_config_path,
)
from rpaforge.mcp.library import (
    MCP_TOOL_REGISTRY,
    MCPConnectionError,
    MCPLibrary,
    register_mcp_libraries,
)

__all__ = [
    "ENV_MCP_CONFIG",
    "MCP_TOOL_REGISTRY",
    "MCPConfigError",
    "MCPConnectionError",
    "MCPLibrary",
    "MCPServerConfig",
    "load_mcp_config",
    "parse_mcp_config",
    "register_mcp_libraries",
    "resolve_mcp_config_path",
]
