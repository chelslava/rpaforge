# sdk-hello-library

Minimal example RPAForge library — a starter template for the
[Library Development SDK](../../docs/developer-guide/writing-a-library.md).

It registers a `HelloWorld` library with two activities (`Greet`, `Add Numbers`)
to prove that third-party libraries work end-to-end without any changes to
`rpaforge-core`.

## Try it

```bash
pip install -e packages/core
pip install -e examples/sdk-hello-library
python -c "from rpaforge.core.activity import discover_libraries; print(discover_libraries())"
```

`HelloWorld` shows up alongside the built-in libraries (`DesktopUI`, `Excel`, ...).

## Use as a template

Copy `src/sdk_hello_library/` into your own package, rename `HelloWorld` to your
library, and update the entry point in `pyproject.toml`:

```toml
[project.entry-points."rpaforge.libraries"]
YourLibrary = "your_package.library:YourLibrary"
```
