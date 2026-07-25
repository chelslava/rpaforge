[🇷🇺 Русский](README.ru.md)

# RPAForge Core

[![PyPI version](https://badge.fury.io/py/rpaforge-core.svg)](https://badge.fury.io/py/rpaforge-core)
[![Python Support](https://img.shields.io/pypi/pyversions/rpaforge-core.svg)](https://pypi.org/project/rpaforge-core/)
[![License](https://img.shields.io/github/license/chelslava/rpaforge)](LICENSE)

Core engine for RPAForge — native Python execution with full debugging, recording, and IPC bridge capabilities.

## Installation

```bash
pip install rpaforge-core
```

## Usage

```python
from rpaforge import StudioEngine
from rpaforge_libraries.DesktopUI import DesktopUI

engine = StudioEngine()
engine.executor.register_library("DesktopUI", DesktopUI())

builder = engine.create_process("Notepad Automation")
builder.add_task(
    "Open and Type",
    [
        ("DesktopUI.Open Application", {"executable": "notepad.exe"}),
        ("DesktopUI.Wait For Window", {"title": "Notepad", "timeout": "10s"}),
        ("DesktopUI.Input Text", {"text": "Hello from RPAForge!"}),
        ("DesktopUI.Close Window", {}),
    ],
)

result = engine.run(builder.build())
print(f"Status: {result.status}")
```

## Features

- **Engine**: Native Python execution with topology validation and code generation
- **Debugger**: Breakpoints, step over/into/out, variable inspection, call stack
- **Recorder**: Record user actions to automation diagrams
- **IPC Bridge**: Asyncio JSON-RPC server for Electron ↔ Python communication

## Development

```bash
# Install in development mode
pip install -e .

# Run tests
pytest tests/ -v

# Format code
ruff format src/
```

## License

Apache License 2.0
