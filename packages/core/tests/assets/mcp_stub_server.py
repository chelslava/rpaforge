"""Stub MCP stdio server for integration tests (issue #853; SDK 2.x)."""

import sys
import threading

from mcp.server.mcpserver import MCPServer

server = MCPServer("demo")


@server.tool()
def echo(text: str = "") -> str:
    """Echo the provided text back with a prefix."""
    return f"echo:{text}"


@server.tool()
def add(a: int = 0, b: int = 0) -> int:
    """Add two integers."""
    return a + b


def _watch_stdin() -> None:
    """Hard-exit when the parent closes our stdin (deterministic teardown).

    os._exit is required: sys.exit in a non-main thread only unwinds that
    thread, leaving the process (and its stdio pipes) alive.
    """
    import os

    try:
        while sys.stdin.buffer.read(1):
            pass
    except Exception:
        pass
    os._exit(0)


if __name__ == "__main__":
    threading.Thread(target=_watch_stdin, daemon=True).start()
    server.run(transport="stdio")
    sys.exit(0)
