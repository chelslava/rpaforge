# Writing a Custom RPAForge Library

RPAForge's RPA libraries (`DesktopUI`, `WebUI`, `Excel`, ...) and third-party
plugins use the exact same mechanism — there is no special "built-in" path.
This guide walks through writing your own library and making it discoverable
by the engine, with no changes to `rpaforge-core` required.

A complete, runnable example lives in [`examples/sdk-hello-library`](../../examples/sdk-hello-library).

## 1. The decorator API

Activities and libraries are plain Python classes decorated with helpers from
`rpaforge.core.activity`:

```python
from rpaforge.core.activity import activity, library, output, param, tags

@library(name="HelloWorld", category="Examples", icon="👋")
class HelloWorld:
    @activity(name="Greet", category="Examples")
    @param("name", type="string", description="Who to greet")
    @output("The greeting message")
    def greet(self, name: str = "World") -> str:
        return f"Hello, {name}!"
```

- `@library(...)` registers the class and, as a side effect, every method on it
  decorated with `@activity` — under `<LibraryName>.<method_name>`.
- `@activity(...)` registers a method as an RPA activity. Parameter metadata
  (name, type, required/default) is inferred from the method signature; use
  `@param(...)` to override the inferred type/label/description, `@tags(...)`
  to add search tags, and `@output(...)` to mark that the activity returns a
  value the visual designer can save to a variable.
- Supported `@param` types: `string`, `integer`, `float`, `boolean`,
  `variable`, `expression`, `secret`, `code`, `list`, `dict`.

This is the entire metadata model used by the Studio activity palette, the AI
diagram generator's prompt context, and the Python code generator — it's the
same registry built-in libraries populate.

## 2. Register the entry point

The engine discovers libraries via the `rpaforge.libraries` entry-point group
(the same mechanism pytest/flake8 use for their plugins), not a hardcoded
list. Declare your class in your package's `pyproject.toml`:

```toml
[project.entry-points."rpaforge.libraries"]
HelloWorld = "sdk_hello_library.library:HelloWorld"
```

The value is `<dotted.module.path>:<ClassName>`. That's it — no registry file
to edit inside `rpaforge-core`, no PR against this repo required.

## 3. Install and verify

```bash
pip install -e packages/core            # rpaforge-core, provides the decorators
pip install -e your-library-package      # editable install of your library
```

```python
from rpaforge.core.activity import discover_libraries

for name, cls in discover_libraries():
    print(name, cls)
```

Your library should appear alongside the built-in ones. Restart the Studio
bridge (or just the Python process) after installing — discovery runs once at
bridge startup (`BridgeHandlers.__init__`).

## 4. Optional dependencies

If your library depends on something that might not be installed (the way
`DesktopUI` needs `pywinauto` or `WebUI` needs `playwright`), put the import
inside the class/method body rather than at module top level, or declare it
as an extra in your own `pyproject.toml`. `discover_libraries()` catches
`ImportError` per-library and logs a warning instead of failing engine
startup — a missing optional dependency in one library never blocks the rest.

## What this does not cover

- **Distribution/marketplace** — publishing and discovering community
  libraries is a separate, not-yet-built piece of the roadmap. Today,
  "installing a plugin" means `pip install` (or `pip install -e .` for local
  development) into the same environment the engine runs in.
- **Scaffolding CLI** — there's no `rpaforge create-library` generator yet;
  copy [`examples/sdk-hello-library`](../../examples/sdk-hello-library) as a
  starting point.
- **Sandboxing** — libraries run as regular Python in the engine process (or
  the timeout-protected subprocess for long-running activities). The engine
  already executes arbitrary Python by design; a plugin has the same level of
  trust as a built-in library, so only install libraries you trust.
