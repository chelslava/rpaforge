"""
RPAForge Bridge Handlers.

Request handlers for JSON-RPC methods.

This module re-exports BridgeHandlers from the handlers subpackage.
"""

from rpaforge.bridge.handlers import BridgeHandlers

__all__ = ["BridgeHandlers"]
