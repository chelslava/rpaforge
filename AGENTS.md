# AGENTS.md - RPAForge Development Guide

Essential information for AI coding agents working on RPAForge.

## Project Overview

RPAForge is an Open Source RPA Studio built on Robot Framework. It provides a visual process designer, recorder, debugger, and orchestrator for RPA automation.

## Build/Lint/Test Commands

### Setup

```bash
# Install development dependencies
pip install -r requirements-dev.txt
pre-commit install

# Install Python packages in development mode
pip install -e packages/core
pip install -e packages/libraries

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

# Run single test file
pytest packages/core/tests/test_engine.py -v

# Run single test case
pytest packages/core/tests/test_engine.py::TestStudioEngine::test_run_simple_string -v

# Run with coverage
pytest packages/ --cov=src --cov-report=html
```

### UI Tests

```bash
cd packages/studio
npm test                    # Run all tests
npm run test:coverage       # Run with coverage
```

### Linting and Formatting

```bash
# Format Python code
ruff format packages/
isort packages/

# Lint Python code
ruff check packages/
mypy packages/core/src packages/libraries/src

# Lint and auto-fix
ruff check --fix packages/

# Lint UI code
cd packages/studio
npm run lint
npm run lint:fix
```

### Running the Studio

```bash
cd packages/studio
npm run dev              # Development mode
npm run electron:dev     # Electron development
```

### Makefile Shortcuts

```bash
make test                # Run all tests
make lint                # Run linting
make format              # Format code
make dev                 # Install dev dependencies
```

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

- Raise specific exceptions with descriptive messages
- Use Robot Framework's exception hierarchy where appropriate
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
- Use `# type: ignore` sparingly - prefer proper type hints
- First-party imports: `rpaforge`, `rpaforge_libraries`
