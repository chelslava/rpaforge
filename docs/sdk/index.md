# RPAForge SDK Overview

The **RPAForge SDK** enables Python developers to create custom RPA automation libraries that seamlessly integrate with the RPAForge Execution Engine and Studio UI.

## Key Features

- **Native Decorators**: Use `@library`, `@activity`, and `@param` decorators (`rpaforge.core.activity`) to register Python classes and functions.
- **Entry Points Architecture**: Third-party libraries register via standard Python entry points (`[project.entry-points."rpaforge.libraries"]`), eliminating any coupling to core packages.
- **Isolated Process Execution**: Activities run safely with timeout, retry, and parameter validation.
- **Rich Schema Metadata**: Generate structured activity definitions used by Studio UI for drag-and-drop property panels and code generation.

## SDK Components

| Module | Description |
| :--- | :--- |
| [`rpaforge.core.activity`](core-api.md) | `@library`, `@activity`, and `@param` decorators for declaring activities and parameters |
| [`rpaforge.engine`](engine.md) | `StudioEngine` wrapper, process builder (`SuiteBuilder`), and execution runner |
| [Writing a Library Guide](writing-a-library.md) | Step-by-step tutorial on building, packaging, and publishing custom RPAForge libraries |

## Quick Start Example

```python
from __future__ import annotations

from typing import Any
from rpaforge.core.activity import activity, library, param


@library(name="MyCustomLibrary", category="Custom")
class MyCustomLibrary:
    """Example custom library registered with RPAForge SDK."""

    @activity(name="Format Message", category="String Operations")
    @param("user_name", type="string", description="Name of the user to greet.")
    def format_message(self, user_name: str) -> dict[str, Any]:
        """Formats a greeting message for the specified user."""
        return {"greeting": f"Hello, {user_name}! Welcome to RPAForge."}
```
