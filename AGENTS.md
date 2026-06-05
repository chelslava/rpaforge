# AGENTS.md - RPAForge Development Guide

Essential information for AI coding agents working on RPAForge.

## Project Overview

RPAForge is an Open Source RPA Studio. It provides a visual process designer, recorder, debugger, and orchestrator for RPA automation.

**Current Version**: v0.3.1

**Status**: Active Development - v0.4.0 Planned

## Knowledge Base — LLM Wiki (read first, write after)

The project keeps a persistent, grep-able knowledge base at `.omc/wiki/` (markdown,
compounds across sessions). Treat it as required workflow, not optional:

- **Before** starting non-trivial work, **search it first**: `wiki_query` (or grep
  `.omc/wiki/`) for the symptom / file / component / error string you're about to
  touch — past root causes, gotchas, and fixes live there. `wiki_list` to browse,
  `wiki_read` to open a page.
- **After** finishing an investigation or fix, **record it**: `wiki_ingest` the root
  cause, the evidence, the fix, and `file:line`. Append to an existing page when the
  topic matches; create a new page otherwise.
- **Make it findable for next time:** give every page searchable **marker words/tags**
  (symptom keywords, file names, error strings, component names) and **cross-link**
  related pages, so a future `wiki_query` hits fast.
- Tools: `wiki_query`, `wiki_list`, `wiki_read`, `wiki_ingest`, `wiki_add`, `wiki_lint`.

## Build/Lint/Test Commands

### Quick Start (Full Setup)

```bash
# 1. Install Python packages in development mode (use uv for speed)
uv pip install -e packages/core
uv pip install -e packages/libraries

# 2. Install Studio UI dependencies
cd packages/studio && pnpm install && cd ../..

# 3. Verify installation
pytest packages/core/tests -v          # Python tests
cd packages/studio && pnpm test        # UI tests
```

## Security (v0.3.1)

Critical security vulnerabilities have been addressed:

- **SQL Injection Prevention**: Table name validation in Database library
- **Unsafe getattr Prevention**: Library/activity name validation in Executor
- **Path Traversal Prevention**: Symlink validation in File library
- **Null Pointer Prevention**: Window null check in Electron handlers
- **Race Condition Prevention**: File descriptor operations for log writing

## Architecture

### Python Core Engine
- **Subprocess-based timeout handling**: Activities run in isolated subprocesses
- **Safe condition evaluator**: AST-based parsing instead of `eval()`
- **Non-blocking retry**: Minimum 1ms retry delay

### Electron Security
- **Content Security Policy (CSP)**: Strict CSP headers in production
- **IPC payload validation**: All handlers validate incoming data
- **Path traversal protection**: File operations validated

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

- **Search the LLM Wiki (`.omc/wiki/`) before non-trivial work, and record your
  findings/fixes back to it** with searchable tags + cross-links (see "Knowledge Base")
- **Never commit changes unless explicitly requested by the user**
- Run `ruff format packages/` before submitting changes
- Run `pytest packages/` to verify Python changes
- Run `pnpm test` in packages/studio to verify UI changes
- Maintain backward compatibility
- Python 3.10+ required (supports 3.10, 3.11, 3.12, 3.13)
