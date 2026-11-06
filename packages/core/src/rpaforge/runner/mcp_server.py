"""MCP server exposing RPAForge processes as agent-callable tools (issue #854).

``rpaforge-runner mcp`` speaks the Model Context Protocol so external AI
agents (Claude Desktop, Cursor, custom LangGraph/OpenAI agents) can drive
the unattended runner natively:

- ``list_processes`` — discover runnable processes from a processes dir,
- ``run_process`` — enqueue one run (same queue + payload convention as
  ``POST /trigger``), returning the queue item id,
- ``get_run_status`` / ``list_runs`` — inspect queue items,
- ``cancel`` — cancel a queued (not yet picked up) item.

Transports: ``stdio`` by default (local agent use, e.g. Claude Desktop's
``mcpServers`` config) and optional ``streamable HTTP`` (``--transport http``)
guarded by the same ``RPAFORGE_SERVE_TOKEN`` bearer auth as the serve API —
the server refuses to start in HTTP mode without a token (fail-closed).

Typed tool arguments only: agents pass a process name/path, a variables
object of JSON primitives, priority and an optional policy manifest path —
never a raw payload passthrough. Policy manifests are validated eagerly
(fail-closed), mirroring serve's ``X-RPAForge-Policy`` behaviour. Threat
model: local-first, run on a trusted host; the MCP surface is exactly as
powerful as the runner host permits, so bind HTTP to localhost and keep the
token secret.

The ``mcp`` SDK (2.x) is imported lazily — the queue backend logic is
testable without the ``[mcp]`` extra installed.
"""

from __future__ import annotations

import json
import logging
import os
from collections.abc import Callable
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, ParamSpec, TypeVar

from rpaforge.core.policy import PolicyConfigError, load_policy_file
from rpaforge.queues.models import QueueItem, QueueItemStatus, QueuePriority
from rpaforge.queues.sqlite_store import SQLiteQueueStore

logger = logging.getLogger("rpaforge.runner.mcp_server")

P = ParamSpec("P")
R = TypeVar("R")

#: Priorities accepted for ``run_process`` (mirrors serve / QueuePriority).
_ALLOWED_PRIORITIES = ("High", "Normal", "Low")

#: Process-file suffixes accepted for explicit path references.
_PROCESS_SUFFIXES = (".process", ".forge", ".rpa")


@dataclass
class McpRunnerConfig:
    """Configuration for the MCP runner server."""

    queue_name: str = "default"
    db_path: Path | str | None = None
    #: Directory scanned by ``list_processes``; process names resolve here.
    processes_dir: Path = field(default_factory=Path.cwd)
    #: Bearer token for HTTP transport; stdio needs none (same process).
    token: str | None = None
    quiet: bool = False


def _is_primitive(value: Any) -> bool:
    """Return True for JSON-primitive variable values (no containers)."""
    return isinstance(value, (str, int, float, bool)) or value is None


class McpRunnerBackend:
    """Queue-facing logic behind the MCP tools, transport- and SDK-agnostic."""

    def __init__(
        self, config: McpRunnerConfig, store: SQLiteQueueStore | None = None
    ) -> None:
        self.config = config
        self.store = (
            store if store is not None else SQLiteQueueStore(db_path=config.db_path)
        )

    # -- discovery ----------------------------------------------------------

    def list_processes(self) -> list[dict[str, Any]]:
        """Discover runnable processes under ``processes_dir``."""
        base = self.config.processes_dir
        if not base.is_dir():
            raise FileNotFoundError(f"processes dir does not exist: {base}")
        found: dict[str, dict[str, Any]] = {}
        candidates: list[Path] = []
        for root, _dirs, files in os.walk(
            base, onerror=lambda _exc: None, followlinks=False
        ):
            for filename in files:
                if filename.lower().endswith(_PROCESS_SUFFIXES):
                    candidates.append(Path(root) / filename)
        for path in sorted(candidates):
            if not path.is_file():
                continue
            resolved = str(path.resolve())
            if resolved in found:
                continue
            found[resolved] = {
                "name": _diagram_display_name(path),
                "path": resolved,
            }
        return sorted(found.values(), key=lambda entry: entry["path"])

    def resolve_process(self, process: str) -> Path:
        """Resolve a process name (from ``list_processes``) or explicit path.

        An explicit path (existing ``.process``/``.forge``/``.rpa`` file) wins
        over the name scan; a bare name matches the display name of discovered
        processes case-insensitively.
        """
        query = process.strip()
        if not query:
            raise ValueError("'process' must be a non-empty name or path")
        candidate = Path(query).expanduser()
        if candidate.suffix.lower() in _PROCESS_SUFFIXES and candidate.is_file():
            return candidate
        for entry in self.list_processes():
            if entry["name"].casefold() == query.casefold():
                return Path(entry["path"])
        raise FileNotFoundError(
            f"unknown process '{query}': not a discovered name or an "
            f"existing {'/'.join(_PROCESS_SUFFIXES)} file"
        )

    # -- run management -----------------------------------------------------

    def run_process(
        self,
        process: str,
        variables: dict[str, Any] | None = None,
        priority: str = "Normal",
        policy_path: str | None = None,
        reference: str | None = None,
    ) -> dict[str, Any]:
        """Validate typed arguments and enqueue one run (like ``/trigger``)."""
        resolved = self.resolve_process(process)
        if variables is None:
            variables = {}
        if not isinstance(variables, dict) or not all(
            isinstance(key, str) and _is_primitive(value)
            for key, value in variables.items()
        ):
            raise ValueError(
                "'variables' must be an object of JSON primitives "
                "(string, number, boolean or null)"
            )
        if priority not in _ALLOWED_PRIORITIES:
            raise ValueError(f"'priority' must be one of {list(_ALLOWED_PRIORITIES)}")
        if reference is not None and not isinstance(reference, str):
            raise ValueError("'reference' must be a string")

        payload: dict[str, Any] = {
            "diagram_path": str(resolved),
            "variables": dict(variables),
        }
        if policy_path is not None and str(policy_path).strip():
            manifest = str(policy_path).strip()
            try:
                load_policy_file(manifest)
            except (OSError, PolicyConfigError, ValueError) as exc:
                raise ValueError(f"invalid policy manifest: {exc}") from exc
            payload["policy"] = manifest

        item = self.store.add_item(
            self.config.queue_name,
            payload=payload,
            reference=reference,
            priority=priority,
        )
        logger.info(
            "MCP run_process enqueued: item=%s queue=%s process=%s",
            item.id,
            self.config.queue_name,
            resolved,
        )
        return {
            "status": "queued",
            "item_id": item.id,
            "queue": self.config.queue_name,
            "process": str(resolved),
        }

    def get_run_status(self, item_id: str) -> dict[str, Any]:
        """Return the current state of one queued run."""
        item = self.store.get_item(item_id)
        return _item_view(item)

    def list_runs(self, limit: int = 20) -> list[dict[str, Any]]:
        """Return recent runs of the queue, newest first."""
        if not isinstance(limit, int) or isinstance(limit, bool) or limit < 1:
            raise ValueError("'limit' must be a positive integer")
        return [
            _item_view(item)
            for item in self.store.list_items(
                self.config.queue_name, limit=min(limit, 100)
            )
        ]

    def cancel(self, item_id: str) -> dict[str, Any]:
        """Cancel a queued run that the daemon has not picked up yet."""
        item = self.store.cancel_item(item_id, reason="cancelled via MCP")
        return _item_view(item)


def _diagram_display_name(path: Path) -> str:
    """Prefer the document's ``metadata.name``, fall back to the file stem."""
    if path.suffix.lower() != ".process":
        return path.stem
    try:
        document = json.loads(path.read_text(encoding="utf-8"))
        metadata = document.get("metadata") if isinstance(document, dict) else None
        if isinstance(metadata, dict):
            name = str(metadata.get("name", "")).strip()
            if name:
                return name
    except (OSError, ValueError):
        pass
    return path.stem


def _item_view(item: QueueItem) -> dict[str, Any]:
    """Compact JSON-safe view of a queue item for tool results."""
    payload = item.payload if isinstance(item.payload, dict) else {}
    return {
        "item_id": item.id,
        "queue": item.queue_name,
        "status": (
            item.status.value
            if isinstance(item.status, QueueItemStatus)
            else str(item.status)
        ),
        "priority": (
            item.priority.value
            if isinstance(item.priority, QueuePriority)
            else str(item.priority)
        ),
        "reference": item.reference,
        "process": payload.get("diagram_path"),
        "error": item.error_message,
        "retry_count": item.retry_count,
        "created_at": item.created_at,
        "updated_at": item.updated_at,
    }


def build_mcp_server(config: McpRunnerConfig) -> Any:
    """Create the SDK ``MCPServer`` with the runner tools registered.

    Requires the ``mcp`` package (``pip install rpaforge-core[mcp]``).
    Tool validation errors raise ``ValueError``/``FileNotFoundError`` and are
    surfaced by the SDK as ``isError`` tool results carrying the message.
    """
    try:
        from mcp.server.mcpserver import MCPServer
        from mcp.server.mcpserver.exceptions import ToolError
    except ModuleNotFoundError as exc:  # pragma: no cover - env guard
        raise ModuleNotFoundError(
            "The MCP server requires the 'mcp' package (pip install rpaforge-core[mcp])"
        ) from exc

    backend = McpRunnerBackend(config)

    def guarded(call: Callable[P, R]) -> Callable[P, R]:
        """Convert backend validation errors into SDK ``ToolError`` results.

        ``ToolError`` reaches the agent as ``isError=True`` with the message;
        any other exception would be a protocol-level crash.
        """

        def wrapper(*args: P.args, **kwargs: P.kwargs) -> R:
            try:
                return call(*args, **kwargs)
            except (ValueError, FileNotFoundError) as exc:
                raise ToolError(str(exc)) from exc

        return wrapper

    server = MCPServer(
        name="rpaforge",
        title="RPAForge Runner",
        instructions=(
            "Trigger and observe RPAForge automations. Use list_processes to "
            "discover runnable processes, run_process to enqueue one run, "
            "get_run_status/list_runs to observe, cancel to remove a queued "
            "run that has not started yet."
        ),
    )

    @server.tool(
        name="list_processes",
        description="List RPAForge processes runnable on this runner host.",
    )
    def tool_list_processes() -> list[dict[str, Any]]:
        """Discover runnable processes."""
        return guarded(backend.list_processes)()

    @server.tool(
        name="run_process",
        description=(
            "Enqueue one RPAForge process run. Variables must be an object "
            "of JSON primitives; priority is High/Normal/Low; policy_path "
            "optionally names a permission-policy manifest on the runner "
            "host (validated eagerly). Returns the queue item id."
        ),
    )
    def tool_run_process(
        process: str,
        variables: dict[str, Any] | None = None,
        priority: str = "Normal",
        policy_path: str | None = None,
        reference: str | None = None,
    ) -> dict[str, Any]:
        """Enqueue one process run."""
        return guarded(backend.run_process)(
            process,
            variables=variables,
            priority=priority,
            policy_path=policy_path,
            reference=reference,
        )

    @server.tool(
        name="get_run_status",
        description="Get the queue status of one RPAForge run by item id.",
    )
    def tool_get_run_status(item_id: str) -> dict[str, Any]:
        """Inspect one queued run."""
        return guarded(backend.get_run_status)(item_id)

    @server.tool(
        name="list_runs",
        description="List recent RPAForge runs, newest first.",
    )
    def tool_list_runs(limit: int = 20) -> list[dict[str, Any]]:
        """List recent runs."""
        return guarded(backend.list_runs)(limit)

    @server.tool(
        name="cancel",
        description=(
            "Cancel a queued RPAForge run before the daemon picks it up. "
            "Runs already in progress cannot be cancelled."
        ),
    )
    def tool_cancel(item_id: str) -> dict[str, Any]:
        """Cancel one queued run."""
        return guarded(backend.cancel)(item_id)

    return server


def _bearer_auth_middleware(downstream: Any, token: str) -> Any:
    """Pure-ASGI bearer-token guard for the streamable HTTP app (fail-closed).

    Every request must carry ``Authorization: Bearer <token>``; anything else
    is answered with 401 before reaching the MCP app.
    """
    import hmac

    async def app(scope: dict[str, Any], receive: Any, send: Any) -> None:
        if scope.get("type") != "http":
            await downstream(scope, receive, send)
            return
        headers = {
            key.decode("latin-1").lower(): value.decode("latin-1")
            for key, value in scope.get("headers", [])
        }
        provided: str | None = None
        auth_header = headers.get("authorization", "")
        scheme, _, credential = auth_header.partition(" ")
        if scheme.lower() == "bearer":
            provided = credential.strip()
        if not provided or not hmac.compare_digest(provided, token):
            body = b'{"error": "invalid or missing auth token"}'
            await send(
                {
                    "type": "http.response.start",
                    "status": 401,
                    "headers": [
                        (b"content-type", b"application/json; charset=utf-8"),
                        (b"content-length", str(len(body)).encode("latin-1")),
                        (b"www-authenticate", b"Bearer"),
                    ],
                }
            )
            await send({"type": "http.response.body", "body": body})
            return
        await downstream(scope, receive, send)

    return app


def run_mcp_server(
    config: McpRunnerConfig,
    transport: str = "stdio",
    host: str = "127.0.0.1",
    port: int = 8766,
) -> int:
    """Run the MCP server on ``transport`` until interrupted. Returns exit code."""
    if transport not in ("stdio", "http"):
        raise ValueError(f"unknown transport: {transport}")

    server = build_mcp_server(config)

    if transport == "stdio":
        message = f"mcp: stdio server ready (queue={config.queue_name})"
        if not config.quiet:
            print(message, flush=True)
        logger.info(message)
        import anyio

        anyio.run(server.run_stdio_async)
        return 0

    if not config.token:
        raise RuntimeError(
            "HTTP transport requires RPAFORGE_SERVE_TOKEN "
            "(fail-closed: unauthenticated MCP access is refused)"
        )
    app = _bearer_auth_middleware(server.streamable_http_app(), config.token)
    message = (
        f"mcp: streamable HTTP listening on http://{host}:{port}/mcp "
        f"queue={config.queue_name} (bearer auth enabled)"
    )
    if not config.quiet:
        print(message, flush=True)
    logger.info(message)
    import uvicorn

    uvicorn.run(app, host=host, port=port, log_level="warning")
    return 0
