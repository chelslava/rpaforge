# AGENTS.md - RPAForge Development Guide

This document provides essential information for AI coding agents working on RPAForge.

## Project Overview

RPAForge is an Open Source RPA Studio built on Robot Framework. It provides a visual process designer, recorder, debugger, and orchestrator for RPA automation.

## Build/Lint/Test Commands

### Setup

```bash
# Install Python packages in development mode
pip install -e packages/core
pip install -e packages/libraries

# Install development dependencies
pip install -r requirements-dev.txt
pre-commit install

# Install Studio UI dependencies
cd packages/studio && npm install
```

### Python Tests

```bash
# Run all tests
pytest packages/ -v

# Run specific package tests
pytest packages/core/tests -v
pytest packages/libraries/tests -v

# Run with coverage
pytest packages/ --cov=src --cov-report=html

# Run specific test file
pytest packages/core/tests/test_engine.py -v

# Run specific test case
pytest packages/core/tests/test_engine.py::TestStudioEngine::test_run_simple_string -v
```

### UI Tests

```bash
cd packages/studio
npm test
npm run test:coverage
```

### Linting and Formatting

```bash
# Format all Python code
ruff format packages/
isort packages/

# Lint Python code
ruff check packages/
mypy packages/core/src packages/libraries/src

# Lint UI code
cd packages/studio
npm run lint
npm run lint:fix
```

### Running the Studio

```bash
# Development mode
cd packages/studio
npm run dev

# Electron development
npm run electron:dev
```

## Project Structure

```
rpaforge/
├── packages/
│   ├── core/                    # Python core engine
│   │   ├── src/rpaforge/
│   │   │   ├── engine/          # Execution engine
│   │   │   ├── debugger/        # Debugging system
│   │   │   ├── recorder/        # Action recording
│   │   │   └── utils/           # Utilities (IPC)
│   │   └── tests/
│   │
│   ├── libraries/               # RPA libraries
│   │   ├── src/rpaforge_libraries/
│   │   │   ├── DesktopUI/       # Windows automation
│   │   │   ├── WebUI/           # Web automation
│   │   │   ├── OCR/             # Text recognition
│   │   │   ├── Excel/           # Spreadsheet automation
│   │   │   ├── Database/        # Database operations
│   │   │   └── Credentials/     # Secure credentials
│   │   └── tests/
│   │
│   ├── studio/                  # Electron + React UI
│   │   ├── electron/            # Electron main process
│   │   │   ├── main.ts          # Entry point
│   │   │   ├── preload.ts       # IPC bridge
│   │   │   └── python-bridge.ts # Python communication
│   │   └── src/
│   │       ├── components/
│   │       │   ├── Designer/    # Visual process designer
│   │       │   ├── Debugger/    # Debugging UI
│   │       │   └── Common/      # Shared components
│   │       ├── stores/          # Zustand state
│   │       └── hooks/           # Custom hooks
│   │
│   └── orchestrator/            # Control Tower (future)
│
├── docs/                        # Documentation
├── examples/                    # Example automation scripts
├── plugins/                     # Example plugins
└── tools/                       # Development tools
```

## Code Style Guidelines

### Python

- Follow PEP-8 with 88 character line length (Black default)
- Use `ruff format` and `isort` for formatting
- Type hints required for all public APIs
- Docstrings required for public APIs (PEP-257 style)
- No comments unless requested

```python
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

### TypeScript/React

- Use functional components with hooks
- Zustand for global state management
- TailwindCSS for styling
- ESLint + Prettier for formatting

```typescript
import { useState } from "react";

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

## Key Architectural Patterns

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

### Debugger

```python
from rpaforge import Debugger

debugger = Debugger()
debugger.add_breakpoint("process.robot", 10)
debugger.add_breakpoint("process.robot", 15, condition="${count} > 5")

engine = StudioEngine(debugger=debugger)
```

### IPC Bridge

```python
from rpaforge.utils import IPCBridge

bridge = IPCBridge()
bridge.register_handler("runProcess", lambda p: engine.run(p))
bridge.register_handler("setBreakpoint", lambda p: debugger.add_breakpoint(**p))
```

## Extension Points

| Extension Point | How to Extend |
|-----------------|---------------|
| RPA Libraries | Create new library in `packages/libraries/src/rpaforge_libraries/` |
| UI Components | Add to `packages/studio/src/components/` |
| Plugins | Create plugin in `plugins/` directory |
| IPC Methods | Register handlers in `electron/python-bridge.ts` |

## Important Notes

- **Never commit changes unless explicitly requested by the user**
- Run `ruff format packages/` before submitting changes
- Test Python changes with `pytest packages/`
- Test UI changes with `npm test` in packages/studio
- Maintain backward compatibility
- Use `# type: ignore` sparingly - prefer proper type hints
