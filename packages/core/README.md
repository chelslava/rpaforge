# RPAForge Core

[![PyPI version](https://badge.fury.io/py/rpaforge-core.svg)](https://badge.fury.io/py/rpaforge-core)
[![Python Support](https://img.shields.io/pypi/pyversions/rpaforge-core.svg)](https://pypi.org/project/rpaforge-core/)
[![License](https://img.shields.io/github/license/chelslava/rpaforge)](LICENSE)

Core engine for RPAForge - wraps Robot Framework with extended debugging, recording, and execution capabilities.

## Installation

```bash
pip install rpaforge-core
```

## Usage

```python
from rpaforge import StudioEngine, Debugger

# Create an execution engine
engine = StudioEngine()

# Run a simple process
result = engine.run_string("""
*** Tasks ***
Example Task
    Log    Hello from RPAForge!
""")

print(result.suite.tests[0].status)  # PASS
```

## Features

- **Engine Wrapper**: Simplified Robot Framework execution
- **Debugger**: Breakpoints, step execution, variable watching
- **Recorder**: Record user actions to automation scripts
- **IPC Bridge**: Communication interface for UI integration

## Development

```bash
# Install in development mode
pip install -e .

# Run tests
pytest tests/ -v

# Format code
ruff format src/
isort src/
```

## License

Apache License 2.0
