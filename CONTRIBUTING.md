# Contributing to RPAForge

Thank you for your interest in contributing to RPAForge! This document provides guidelines and instructions for contributing.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Project Structure](#project-structure)
- [Coding Standards](#coding-standards)
- [Commit Guidelines](#commit-guidelines)
- [Pull Request Process](#pull-request-process)
- [Testing](#testing)
- [Documentation](#documentation)

## Code of Conduct

This project follows the [Contributor Covenant Code of Conduct](https://www.contributor-covenant.org/version/2/1/code_of_conduct/). By participating, you are expected to uphold this code. Please report unacceptable behavior to the project maintainers.

## Getting Started

1. Fork the repository
2. Clone your fork locally
3. Create a feature branch
4. Make your changes
5. Submit a pull request

### Branch Naming Convention

- `feature/PR-XXX-description` - New features
- `fix/PR-XXX-description` - Bug fixes
- `docs/description` - Documentation changes
- `refactor/PR-XXX-description` - Code refactoring
- `test/PR-XXX-description` - Test additions/updates

Example: `feature/PR-007-desktop-ui-library`

## Development Setup

### Prerequisites

- Python 3.10 or higher
- Node.js 18 or higher
- Git
- Make (optional, for convenience commands)

### Installation

```bash
# Clone your fork
git clone https://github.com/YOUR_USERNAME/rpaforge.git
cd rpaforge

# Create virtual environment
python -m venv .venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate

# Install development dependencies
pip install -r requirements-dev.txt

# Install pre-commit hooks
pre-commit install

# Install packages in editable mode
pip install -e packages/core
pip install -e packages/libraries

# Install Studio UI dependencies
cd packages/studio
npm install
```

## Project Structure

```
rpaforge/
├── packages/
│   ├── core/              # Core engine (Python)
│   │   ├── src/rpaforge/
│   │   └── tests/
│   ├── libraries/         # RPA libraries (Python)
│   │   ├── src/rpaforge_libraries/
│   │   └── tests/
│   ├── studio/            # Desktop UI (Electron + React)
│   │   ├── electron/
│   │   └── src/
│   └── orchestrator/      # Control Tower (Python FastAPI)
├── docs/                  # Documentation
├── plugins/               # Example plugins
├── examples/              # Sample scripts
└── tools/                 # Development tools
```

## Coding Standards

### Python

We follow Python and Robot Framework's coding conventions with some additions:

- **Style**: PEP-8 with 88 character line length (Black default)

```python
# Example
from typing import Any

from robot.api.deco import keyword, library


@library(scope="GLOBAL", auto_keywords=True)
class MyLibrary:
    """Example library following RPAForge conventions."""

    @keyword(tags=["example", "demo"])
    def do_something(self, arg: str, optional: int = 0) -> dict[str, Any]:
        """Do something with the provided arguments.

        :param arg: Description of arg.
        :param optional: Description of optional.
        :returns: A dictionary with results.
        """
        return {"result": arg, "count": optional}
```

### TypeScript/React

- **Style**: ESLint + Prettier
- **Components**: Functional components with hooks
- **State**: Zustand for global state
- **Styling**: TailwindCSS

```typescript
// Example component
import { useState } from "react";
import { useStore } from "../stores/processStore";

interface ActivityCardProps {
  id: string;
  name: string;
  onSelect: (id: string) => void;
}

export function ActivityCard({ id, name, onSelect }: ActivityCardProps) {
  const [isSelected, setSelected] = useState(false);
  const { activities } = useStore();

  return (
    <div
      className={`p-4 border rounded ${isSelected ? "border-blue-500" : ""}`}
      onClick={() => {
        setSelected(!isSelected);
        onSelect(id);
      }}
    >
      {name}
    </div>
  );
}
```

## Commit Guidelines

We follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <description>

[optional body]

[optional footer(s)]
```

### Types

- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation only
- `style`: Code style changes (formatting, etc.)
- `refactor`: Code refactoring
- `test`: Adding/updating tests
- `chore`: Maintenance tasks

### Examples

```
feat(core): add breakpoint condition support

Add support for conditional breakpoints using Python expressions.
The condition is evaluated before stopping execution.

Closes #42
```

```
fix(libraries): correct selector timeout handling

The timeout was not properly converted from string to seconds.
```

## Pull Request Process

1. **Create a branch** from `main` following naming convention
2. **Make your changes** with clear commit messages
3. **Add/update tests** for your changes
4. **Update documentation** if needed
5. **Run tests locally**: `make test`
6. **Run linting**: `make lint`
7. **Push your branch** and create a PR

### PR Template

```markdown
## Description
[Describe your changes]

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation update

## Testing
- [ ] Unit tests added/updated
- [ ] Integration tests added/updated
- [ ] Manual testing performed

## Checklist
- [ ] Code follows style guidelines
- [ ] Self-review completed
- [ ] Documentation updated
- [ ] Tests pass locally
```

### Review Process

1. At least one approval required
2. All CI checks must pass
3. No merge conflicts
4. Squash and merge to `main`

## Testing

### Running Tests

```bash
# All tests
make test

# Python tests only
pytest packages/core/tests
pytest packages/libraries/tests

# With coverage
pytest --cov=src/rpaforge packages/core/tests

# UI tests
cd packages/studio
npm run test
```

### Writing Tests

```python
# Python test example
import pytest
from rpaforge.engine.executor import StudioEngine


class TestStudioEngine:
    def test_create_process(self):
        engine = StudioEngine()
        process = engine.create_process("Test Process")
        assert process.name == "Test Process"

    def test_run_simple_process(self):
        engine = StudioEngine()
        result = engine.run_string("*** Tasks ***\nTest\n    Log    Hello")
        assert result.suite.tests[0].status == "PASS"
```

## Documentation

### Building Docs

```bash
# Install docs dependencies
pip install -r requirements-docs.txt

# Serve locally
mkdocs serve

# Build
mkdocs build
```

### Writing Docs

- Use Markdown for all documentation
- Follow the existing structure
- Include code examples
- Update API reference for new public APIs

## Questions?

- Open a [Discussion](https://github.com/chelslava/rpaforge/discussions)
- Join our community chat (coming soon)

---

Thank you for contributing to RPAForge! 🎉
