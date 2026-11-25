"""Built-in ``kb.search`` tool for the agentic loop (issue #902).

The registry mirrors ``rpaforge.mcp.library.MCP_TOOL_REGISTRY``:
``build_tool_catalog`` resolves ``kb.search`` here, and the executor
dispatches it through :func:`run_kb_tool` instead of the activity
machinery. Opt-in the same way as any activity - list ``"kb.search"`` in
the agentic block's ``allowed_activities``.
"""

from __future__ import annotations

import json
import logging
from typing import Any

from rpaforge.core.execution import ExecutionStatus

logger = logging.getLogger("rpaforge.kb")

KB_SEARCH_TOOL_ID = "kb.search"

KB_TOOL_REGISTRY: dict[str, dict[str, Any]] = {
    KB_SEARCH_TOOL_ID: {
        "name": "kb.search",
        "description": (
            "Search the persistent knowledge base (RAG memory). Returns the "
            "most relevant indexed text chunks with similarity scores and "
            "metadata. Memory survives across iterations and runs."
        ),
        "params": [
            {
                "name": "query",
                "type": "string",
                "required": True,
                "default": None,
            },
            {
                "name": "collection",
                "type": "string",
                "required": False,
                "default": "default",
            },
            {
                "name": "top_k",
                "type": "integer",
                "required": False,
                "default": 5,
            },
            {
                "name": "filter",
                "type": "string",
                "required": False,
                "default": None,
            },
        ],
    }
}

_store: Any = None
_embedder: Any = None


def _get_default_store() -> Any:
    """Return the process-wide store, creating it on first use."""
    global _store
    if _store is None:
        from rpaforge.kb.sqlite_store import SQLiteVectorStore

        _store = SQLiteVectorStore()
    return _store


def _get_default_embedder() -> Any:
    """Return the process-wide embedder, creating it on first use."""
    global _embedder
    if _embedder is None:
        from rpaforge.llm.embeddings import resolve_embedder

        _embedder = resolve_embedder()
    return _embedder


def _reset_defaults() -> None:
    """Drop cached singletons (tests inject fresh store/embedder pairs)."""
    global _store, _embedder
    _store = None
    _embedder = None


def run_kb_tool(tool_id: str, args: dict[str, Any]) -> dict[str, Any]:
    """Execute ``kb.search`` and return an ``_run_activity``-shaped result.

    Never raises: embedder/store failures become a FAIL observation with an
    actionable message so the agent can adapt or finish instead of crashing
    the whole loop.
    """
    if tool_id not in KB_TOOL_REGISTRY:
        raise KeyError(f"Unknown KB tool '{tool_id}'")
    query = str(args.get("query") or "").strip()
    if not query:
        return {
            "status": ExecutionStatus.FAIL,
            "output": None,
            "error": "kb.search requires a non-empty 'query' argument",
        }
    collection = str(args.get("collection") or "default")
    try:
        top_k = int(args.get("top_k") or 5)
    except (TypeError, ValueError):
        top_k = 5
    raw_filter = args.get("filter")
    if isinstance(raw_filter, str) and raw_filter.strip():
        try:
            metadata_filter = json.loads(raw_filter)
        except ValueError as err:
            return {
                "status": ExecutionStatus.FAIL,
                "output": None,
                "error": f"kb.search 'filter' is not valid JSON: {err}",
            }
    elif isinstance(raw_filter, dict):
        metadata_filter = raw_filter
    else:
        metadata_filter = None

    try:
        embedder = _get_default_embedder()
        vector = embedder.embed([query])[0]
        store = _get_default_store()
        hits = store.search(
            collection,
            vector,
            top_k=top_k,
            metadata_filter=metadata_filter,
        )
    except Exception as err:  # noqa: BLE001 - surfaced as a FAIL observation
        logger.warning("kb.search failed: %s", err)
        return {
            "status": ExecutionStatus.FAIL,
            "output": None,
            "error": f"kb.search failed: {err}",
        }
    return {
        "status": ExecutionStatus.PASS,
        "output": {
            "query": query,
            "collection": collection,
            "hits": [hit.to_dict() for hit in hits],
        },
        "error": None,
    }
