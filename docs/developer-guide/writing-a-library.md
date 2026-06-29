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

## 5. Publishing to the Community Library Browser (Optional)

Once your library is published to PyPI and ready for community use, you can
register it in the RPAForge Community Library Browser. This makes your library
discoverable from the Studio UI without users needing to know the exact package
name.

### Prerequisites

- Your library is published on [PyPI](https://pypi.org)
- It follows the naming convention: `rpaforge-*` (e.g., `rpaforge-salesforce`)
- The package has proper metadata in `pyproject.toml`:
  - `description` (shown in the library browser)
  - `authors` (displayed as "By Author")
  - `version` (displayed to users)

### Registry submission

The community library list is maintained in a central registry manifest. To add
your library:

1. **Prepare your library metadata:**
   ```python
   # pyproject.toml
   [project]
   name = "rpaforge-your-library"
   version = "1.0.0"
   description = "Brief description of what your library does"
   authors = [{name = "Your Name", email = "your@email.com"}]
   ```

2. **Submit a pull request** to the RPAForge repository with:
   - Your library name, PyPI package name, version, description, and author
   - A list of relevant tags (e.g., "crm", "automation", "web", "desktop")
   - A short activity count estimate

3. **Registry entry format:**
   ```json
   {
     "name": "your-library",
     "display_name": "Your Library Name",
     "description": "What your library does",
     "author": "Your Name",
     "pypi_package": "rpaforge-your-library",
     "version": "1.0.0",
     "tags": ["tag1", "tag2", "tag3"]
   }
   ```

### Discovery and installation

Once approved:
- Your library appears in the **Community** tab of the Library Browser
- Users can install it with one click from Studio
- The installation uses `pip install --no-deps` (users must review dependencies)
- After installation, users restart the bridge and your activities are available

## What this does not cover

- **Sandboxing** — libraries run as regular Python in the engine process (or
  the timeout-protected subprocess for long-running activities). The engine
  already executes arbitrary Python by design; a plugin has the same level of
  trust as a built-in library, so only install libraries you trust.
- **Scaffolding CLI** — there's no `rpaforge create-library` generator yet;
  copy [`examples/sdk-hello-library`](../../examples/sdk-hello-library) as a
  starting point.
