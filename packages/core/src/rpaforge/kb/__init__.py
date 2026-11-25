"""Local knowledge base: vector store primitives + ``kb.search`` agent tool.

Issue #902. The default backend is SQLite (WAL) with pure-Python cosine
similarity; backends implement :class:`~rpaforge.kb.interfaces.VectorStore`.
"""

from rpaforge.kb.interfaces import DEFAULT_COLLECTION, VectorStore
from rpaforge.kb.models import KbChunk, KbSearchHit
from rpaforge.kb.sqlite_store import SQLiteVectorStore
from rpaforge.kb.tools import (
    KB_SEARCH_TOOL_ID,
    KB_TOOL_REGISTRY,
    run_kb_tool,
)

__all__ = [
    "DEFAULT_COLLECTION",
    "KB_SEARCH_TOOL_ID",
    "KB_TOOL_REGISTRY",
    "KbChunk",
    "KbSearchHit",
    "SQLiteVectorStore",
    "VectorStore",
    "run_kb_tool",
]
