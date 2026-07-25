"""RPAForge Bridge Server module."""

from rpaforge.bridge.server import main

if __name__ == "__main__":
    import asyncio
    import multiprocessing

    multiprocessing.freeze_support()
    asyncio.run(main())
