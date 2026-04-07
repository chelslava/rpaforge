#!/usr/bin/env python3
"""
Test script to verify Python bridge works correctly.

Run this script to test the bridge server independently.
"""

import asyncio
import sys
from rpaforge import StudioEngine
from rpaforge.debugger import Debugger
from rpaforge.bridge import BridgeServer


async def test_bridge():
    """Test the bridge server."""
    print("[Test] Creating engine and debugger...")
    debugger = Debugger()
    engine = StudioEngine(debugger=debugger)

    print("[Test] Creating bridge server...")
    server = BridgeServer(engine, debugger)

    print("[Test] Starting bridge server...")
    print("[Test] Send JSON-RPC messages via stdin. Example:")
    print('[Test] {"jsonrpc":"2.0","method":"ping","id":1}')
    print('[Test] {"jsonrpc":"2.0","method":"getCapabilities","id":2}')
    print('[Test] {"jsonrpc":"2.0","method":"getActivities","id":3}')
    print("[Test] Press Ctrl+C to exit.")
    print("-" * 50)

    await server.start()


if __name__ == "__main__":
    try:
        asyncio.run(test_bridge())
    except KeyboardInterrupt:
        print("\n[Test] Bridge server stopped.")
        sys.exit(0)
