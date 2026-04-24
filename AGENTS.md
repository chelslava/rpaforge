# AGENTS.md - RPAForge Development Guide

Essential information for AI coding agents working on RPAForge.

## Project Overview

RPAForge is an Open Source RPA Studio. It provides a visual process designer, recorder, debugger, and orchestrator for RPA automation.

**Current Version**: v0.2.0-dev (Core Engine & Libraries Complete)

**Status**: Active Development - v0.3.0 Planned

## Build/Lint/Test Commands

### Quick Start (Full Setup)

```bash
# 1. Install development dependencies
pip install -r requirements-dev.txt
pre-commit install

# 2. Install Python packages in development mode
pip install -e packages/core
pip install -e packages/libraries

# 3. Install Studio UI dependencies
cd packages/studio && npm ci --include=optional && cd ../..

# 4. Verify installation
pytest packages/core/tests -v          # Python tests (4 test files)
cd packages/studio && npm test -- --run && cd ../..  # UI tests (8 test files)

## Architecture Improvements

RPAForge has been refactored for improved stability, security, and performance:

### Python Core Engine (v0.3.0)
- **Subprocess-based timeout handling**: Activities now run in isolated subprocesses to prevent resource leaks when timeouts occur
- **Safe condition evaluator**: Breakpoint conditions are now evaluated using AST-based parsing instead of `eval()`, eliminating security risks
- **Non-blocking retry**: Reduced minimum retry delay to 1ms for better performance

### Electron Security (v0.3.0)
- **Content Security Policy (CSP)**: Production builds now include strict CSP headers
- **IPC payload validation**: All IPC handlers validate incoming payloads for security
- **Path traversal protection**: File system operations validate paths to prevent directory traversal attacks

## Project Structure

```
rpaforge/
├── packages/
│   ├── core/                    # Python core engine
│   │   ├── src/rpaforge/
│   │   │   ├── engine/          # Execution engine (executor.py, suite_builder.py)
│   │   │   ├── debugger/        # Debugging system
│   │   │   ├── recorder/        # Action recording
│   │   │   └── utils/           # Utilities
│   │   └── tests/
│   │
│   ├── libraries/               # RPA libraries
│   │   └── src/rpaforge_libraries/
│   │       ├── DesktopUI/       # Windows automation
│   │       ├── WebUI/           # Web automation
│   │       ├── OCR/             # Text recognition
│   │       ├── Excel/           # Spreadsheet automation
│   │       ├── Database/        # Database operations
│   │       └── Credentials/     # Secure credentials
│   │
│   ├── studio/                  # Electron + React UI
│   │   ├── electron/            # Electron main process
│   │   └── src/
│   │       ├── components/      # Designer, Debugger, Recorder, Common
│   │       ├── stores/          # Zustand state
│   │       └── hooks/           # Custom hooks
│   │
│   └── orchestrator/            # Control Tower (future)
└── docs/
```

## Code Style Guidelines

### Python

- **Formatting**: PEP-8 with 88 character line length (Black default)
- **Formatter**: Use `ruff format` and `isort`
- **Imports**: isort with hanging grid grouped style (multi_line_output=5)
- **Type hints**: Required for all public APIs
- **Docstrings**: PEP-257 style for public APIs
- **Comments**: No comments unless requested

```python
from __future__ import annotations

from typing import Any

from robot.api.deco import keyword, library


@library(scope="GLOBAL", auto_keywords=True)
class MyLibrary:
    """Example library following RPAForge conventions."""

    @keyword(tags=["example"])
    def do_something(self, arg: str, optional: int = 0) -> dict[str, Any]:
        """Do something with the provided arguments.

        :param arg: Description of arg.
        :param optional: Description of optional.
        :returns: A dictionary with results.
        """
        return {"result": arg, "count": optional}
```

### Import Order

1. `from __future__ import annotations`
2. Standard library imports
3. Third-party imports
4. First-party imports (`rpaforge`, `rpaforge_libraries`)

### TypeScript/React

- **Components**: Functional components with hooks
- **State**: Zustand for global state management
- **Styling**: TailwindCSS
- **Formatting**: ESLint + Prettier
- **TypeScript**: Strict mode enabled, no unused locals/parameters
- **Path aliases**: Use `@/*` for `src/*` imports

```typescript
import { useState } from "react";
import { useStore } from "../stores/processStore";

interface ComponentProps {
  title: string;
  onAction: () => void;
}

export function MyComponent({ title, onAction }: ComponentProps) {
  const [isActive, setIsActive] = useState(false);

  return (
    <div className="p-4 bg-white rounded shadow">
      <h2>{title}</h2>
      <button onClick={onAction}>Action</button>
    </div>
  );
}
```

### Error Handling

- Follow Python conventions with type hints
- Use exception hierarchy from the standard library
- Log errors appropriately for debugging

### Naming Conventions

- **Python**: snake_case for functions/variables, PascalCase for classes
- **TypeScript**: camelCase for functions/variables, PascalCase for components/types
- **Files**: snake_case for Python, PascalCase for React components

## Key Patterns

### Engine Wrapper

```python
from rpaforge import StudioEngine

engine = StudioEngine()
result = engine.run_string("""
*** Tasks ***
My Task
    Log    Hello
""")
```

### Process Builder

```python
from rpaforge import StudioEngine

engine = StudioEngine()
builder = engine.create_process("My Process")
builder.add_task("Task 1", [
    ("Log", ["Hello"]),
    ("Set Variable", ["${name}", "World"]),
])
suite = builder.build()
result = engine.run(suite)
```

### Test Pattern

```python
class TestClassName:
    """Tests for ClassName."""

    def test_feature_description(self):
        """Test description."""
        engine = StudioEngine()
        result = engine.run_string("...")
        assert result is not None
```

## Important Rules

- **Never commit changes unless explicitly requested by the user**
- Run `ruff format packages/` before submitting changes
- Run `pytest packages/` to verify Python changes
- Run `npm test` in packages/studio to verify UI changes
- Maintain backward compatibility
- Python 3.10+ required (supports 3.10, 3.11, 3.12, 3.13)
