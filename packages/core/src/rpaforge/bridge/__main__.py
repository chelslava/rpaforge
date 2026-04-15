"""RPAForge Bridge Server module."""

from rpaforge.bridge.server import main

if __name__ == "__main__":
    import asyncio

    asyncio.run(main())
