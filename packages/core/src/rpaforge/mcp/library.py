"""MCP client library: tools as a synthetic ``MCP:<server>`` library.

Each configured server becomes one :class:`MCPLibrary` instance registered
on the executor under ``MCP:<server>``; every tool becomes a bound method,
so agentic-loop calls flow through the standard activity dispatch —
whitelist checks, permission policies (the audit hook sees MCP stdio
spawns and HTTP sockets), timeouts and step audit records.

The ``mcp`` SDK (2.x) is imported lazily; the sync engine talks to the
async SDK through a dedicated background event-loop thread. The session
lives inside a persistent task on that loop — async context managers
cannot be entered from a completing coroutine.
"""

from __future__ import annotations

import asyncio
import concurrent.futures
import json
import logging
import re
import threading
import time
from typing import Any

from rpaforge.mcp.config import MCPServerConfig

__all__ = ["MCPLibrary", "MCPConnectionError", "register_mcp_libraries"]

logger = logging.getLogger("rpaforge.mcp")

#: Registry of declared MCP tools for the agentic-loop catalog builder:
#: ``"MCP:<server>.<tool_method>" -> {"description": ..., "params_schema": ...}``
MCP_TOOL_REGISTRY: dict[str, dict[str, Any]] = {}

_CONNECT_TIMEOUT_S = 60.0
_CALL_TIMEOUT_S = 120.0


class MCPConnectionError(RuntimeError):
    """Raised when an MCP server cannot be reached or returns an error."""


class _LoopWorker:
    """A private asyncio loop on a background thread for the MCP SDK."""

    def __init__(self) -> None:
        self._loop = asyncio.new_event_loop()
        self._thread = threading.Thread(
            target=self._loop.run_forever, name="rpaforge-mcp", daemon=True
        )
        self._thread.start()

    @property
    def loop(self) -> asyncio.AbstractEventLoop:
        return self._loop

    def submit(self, coro: Any) -> concurrent.futures.Future[Any]:
        """Schedule a coroutine on the loop; returns a concurrent Future."""
        return asyncio.run_coroutine_threadsafe(coro, self._loop)

    def run(self, coro: Any, timeout: float = _CALL_TIMEOUT_S) -> Any:
        return self.submit(coro).result(timeout=timeout)

    def close(self) -> None:
        self._loop.call_soon_threadsafe(self._loop.stop)
        self._thread.join(timeout=5)
        self._loop.close()


class MCPLibrary:
    """Synthetic library exposing one MCP server's tools as methods."""

    def __init__(self, server: MCPServerConfig) -> None:
        self.server = server
        self._worker: _LoopWorker | None = None
        self._session: Any = None
        self._lifecycle_task: concurrent.futures.Future[None] | None = None
        self._tools: list[dict[str, Any]] = []
        self._lock = threading.Lock()

    # -- connection --------------------------------------------------------

    def connect(self) -> None:
        """Open the session on the background loop and cache the tools.

        The session lives inside a persistent task that holds the SDK's
        async context managers open; :meth:`close` cancels that task.
        """
        with self._lock:
            if self._session is not None:
                return
            try:
                from mcp import ClientSession, StdioServerParameters
                from mcp.client.stdio import stdio_client
                from mcp.client.streamable_http import streamable_http_client
            except ImportError as exc:  # pragma: no cover
                raise MCPConnectionError(
                    "MCP support requires the [mcp] extra "
                    "(pip install rpaforge-core[mcp]); the import itself "
                    f"failed: {exc}"
                ) from exc

            self._worker = _LoopWorker()
            ready = threading.Event()
            outcome: dict[str, Any] = {}
            server = self.server

            async def _session_lifecycle() -> None:
                try:
                    if server.transport == "stdio":
                        parameters = StdioServerParameters(
                            command=server.command or "",
                            args=list(server.args),
                            env={**os_base_env(), **server.env},
                        )
                        async with stdio_client(parameters) as (
                            read_stream,
                            write_stream,
                        ):
                            async with ClientSession(
                                read_stream, write_stream
                            ) as session:
                                await session.initialize()
                                self._session = session
                                ready.set()
                                await asyncio.Event().wait()  # hold open
                    else:
                        import httpx2

                        http_client = (
                            httpx2.AsyncClient(headers=server.headers)
                            if server.headers
                            else None
                        )
                        async with streamable_http_client(
                            server.url or "", http_client=http_client
                        ) as (read_stream, write_stream):
                            async with ClientSession(
                                read_stream, write_stream
                            ) as session:
                                await session.initialize()
                                self._session = session
                                ready.set()
                                await asyncio.Event().wait()  # hold open
                except asyncio.CancelledError as exc:  # surfaced to caller
                    outcome["error"] = exc
                    ready.set()
                except Exception as exc:  # noqa: BLE001 — surfaced to caller
                    outcome["error"] = exc
                    ready.set()

            self._lifecycle_task = self._worker.submit(_session_lifecycle())
            if not ready.wait(timeout=_CONNECT_TIMEOUT_S):
                self._lifecycle_task.cancel()
                self._worker.close()
                self._worker = None
                raise MCPConnectionError(
                    f"MCP server '{server.name}' did not connect within "
                    f"{_CONNECT_TIMEOUT_S:.0f}s"
                )
            if "error" in outcome:
                self.close()
                raise MCPConnectionError(
                    f"MCP server '{server.name}' failed to connect: {outcome['error']}"
                )
            try:
                session = self._session
                if session is None or self._worker is None:
                    raise MCPConnectionError(
                        f"MCP server '{server.name}' session was closed"
                    )
                response = self._worker.run(session.list_tools())
            except Exception as exc:
                self.close()
                raise MCPConnectionError(
                    f"MCP server '{server.name}' failed to list tools: {exc}"
                ) from exc
            self._tools = [
                {
                    "name": tool.name,
                    "description": tool.description or "",
                    "inputSchema": getattr(tool, "inputSchema", {}) or {},
                }
                for tool in response.tools
            ]
            logger.info(
                "MCP server '%s' connected (%d tools)",
                server.name,
                len(self._tools),
            )

    def close(self) -> None:
        with self._lock:
            self._session = None
            if self._lifecycle_task is not None:
                task = self._lifecycle_task
                self._lifecycle_task = None
                # Request cancellation and let the loop RUN the async CM
                # __aexit__ (which terminates the child process) before the
                # loop stops — otherwise the spawned server keeps holding
                # the stdio pipes and pytest/callers hang on exit.
                if self._worker is not None:
                    self._worker.loop.call_soon_threadsafe(task.cancel)
                    deadline = time.monotonic() + 5.0
                    while not task.done() and time.monotonic() < deadline:
                        time.sleep(0.05)
            if self._worker is not None:
                self._worker.close()
                self._worker = None

    # -- tool surface ------------------------------------------------------

    def list_tools(self) -> list[dict[str, Any]]:
        """Tool list for the agentic-loop catalog (name/description/schema)."""
        self.connect()
        return list(self._tools)

    def call_tool(self, tool_name: str, arguments: dict[str, Any]) -> Any:
        """Invoke one tool and unwrap text/JSON content."""
        self.connect()
        session = self._session
        worker = self._worker
        if session is None or worker is None:
            raise MCPConnectionError(
                f"MCP server '{self.server.name}' session is closed"
            )
        try:
            response = worker.run(
                session.call_tool(tool_name, arguments or {}),
                timeout=_CALL_TIMEOUT_S,
            )
        except Exception as exc:
            raise MCPConnectionError(
                f"MCP tool '{tool_name}' on '{self.server.name}' failed: {exc}"
            ) from exc
        if getattr(response, "isError", False):
            raise MCPConnectionError(
                f"MCP tool '{tool_name}' returned an error: {_content_text(response)}"
            )
        return _unwrap_content(response)

    # -- dispatch surface --------------------------------------------------

    def tool_method_name(self, tool_name: str) -> str:
        """Executor-callable method name for a tool (snake_case-safe)."""
        return "tool_" + re.sub(r"[^A-Za-z0-9_]", "_", tool_name)

    def attach_tool(
        self,
        tool_name: str,
        description: str,
        input_schema: dict[str, Any] | None = None,
    ) -> None:
        """Bind one tool as a dispatchable method on this instance."""
        method_name = self.tool_method_name(tool_name)
        registry_key = f"{self.server.library_name}.{method_name}"
        MCP_TOOL_REGISTRY[registry_key] = {
            "tool_name": tool_name,
            "server": self.server.name,
            "description": description,
            "params_schema": input_schema or {},
        }

        def tool_method(_self: Any = None, **kwargs: Any) -> Any:
            return self.call_tool(tool_name, kwargs)

        tool_method.__name__ = method_name
        tool_method.__doc__ = description or f"MCP tool {tool_name}"
        setattr(self, method_name, tool_method)


def os_base_env() -> dict[str, str]:
    """Minimal OS environment for spawned MCP stdio servers."""
    import os as _os

    keep = ("SYSTEMROOT", "COMSPEC", "PATHEXT", "PATH", "TEMP", "TMP", "HOME")
    return {key: value for key, value in _os.environ.items() if key in keep}


def _content_text(response: Any) -> str:
    parts = []
    for block in getattr(response, "content", []) or []:
        text = getattr(block, "text", None)
        if text:
            parts.append(text)
    return "\n".join(parts) or "(empty MCP response)"


def _unwrap_content(response: Any) -> Any:
    blocks = list(getattr(response, "content", []) or [])
    if len(blocks) == 1:
        return _unwrap_content_one(blocks[0])
    if not blocks:
        return None
    return [_unwrap_content_one(block) for block in blocks]


def _unwrap_content_one(block: Any) -> Any:
    text = getattr(block, "text", None)
    if text is not None:
        try:
            return json.loads(text)
        except (ValueError, TypeError):
            return text
    return block


def register_mcp_libraries(executor: Any, config_path: str) -> list[str]:
    """Connect configured MCP servers and register their tools.

    Returns the list of registered library names (``MCP:<server>``).
    Raises :class:`MCPConnectionError` when a server fails to connect —
    fail-closed, so a broken manifest never silently drops tools.
    """
    from rpaforge.mcp.config import load_mcp_config

    servers = load_mcp_config(config_path)
    registered: list[str] = []
    for server in servers:
        library = MCPLibrary(server)
        library.connect()
        tools = library.list_tools()
        for tool in tools:
            library.attach_tool(tool["name"], tool["description"], tool["inputSchema"])
        executor.register_library(server.library_name, library)
        registered.append(server.library_name)
        logger.info(
            "Registered MCP library '%s' with %d tools",
            server.library_name,
            len(tools),
        )
    return registered
