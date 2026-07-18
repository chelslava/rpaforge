"""Command-line tools for RPAForge."""

from __future__ import annotations

import argparse
import re
import sys
from collections.abc import Callable, Sequence
from pathlib import Path

Prompt = Callable[[str], str]


def _slugify(value: str) -> str:
    """Return a filesystem/package-friendly name."""
    slug = re.sub(r"[^a-z0-9]+", "-", value.strip().lower()).strip("-")
    if not slug:
        raise ValueError("Library name must contain at least one letter or digit")
    return slug


def _package_name(slug: str) -> str:
    """Convert a project slug to a valid Python package name."""
    package = slug.replace("-", "_")
    if package[0].isdigit():
        package = f"library_{package}"
    return package


def _class_name(name: str) -> str:
    """Convert a human-readable library name to a class name."""
    words = re.findall(r"[A-Za-z0-9]+", name)
    result = "".join(word[:1].upper() + word[1:].lower() for word in words)
    if not result or result[0].isdigit():
        result = f"Library{result}"
    return result


def _method_name(name: str) -> str:
    """Convert an activity label to a valid Python method name."""
    method = re.sub(r"[^a-z0-9]+", "_", name.strip().lower()).strip("_")
    if not method:
        raise ValueError("Activity name must contain at least one letter or digit")
    if method[0].isdigit():
        method = f"activity_{method}"
    return method


def _render_files(
    *,
    project_name: str,
    package_name: str,
    class_name: str,
    description: str,
    author: str,
    activity_name: str,
    activity_method: str,
) -> dict[str, str]:
    """Render the files for a new RPAForge library project."""
    return {
        "pyproject.toml": f'''[build-system]
requires = ["setuptools>=61.0", "wheel"]
build-backend = "setuptools.build_meta"

[project]
name = "{project_name}"
version = "0.1.0"
description = "{description}"
readme = "README.md"
license = {{text = "Apache-2.0"}}
requires-python = ">=3.10"
authors = [{{name = "{author}"}}]
dependencies = [
    "rpaforge-core>=0.4.5",
]

[project.entry-points."rpaforge.libraries"]
{class_name} = "{package_name}.library:{class_name}"

[tool.setuptools.packages.find]
where = ["src"]
''',
        f"src/{package_name}/__init__.py": f'''"""{description}."""

from {package_name}.library import {class_name}

__all__ = ["{class_name}"]
''',
        f"src/{package_name}/library.py": f'''"""{class_name} library implementation."""

from __future__ import annotations

from rpaforge.core.activity import activity, library, output


@library(name="{class_name}", category="Custom")
class {class_name}:
    """{description}."""

    @activity(name="{activity_name}", category="Custom")
    @output("Activity result")
    def {activity_method}(self) -> str:
        """Run the starter activity."""
        return "{activity_name} completed"
''',
        "tests/test_library.py": f'''from {package_name}.library import {class_name}


def test_{activity_method}():
    """The starter activity can be called directly."""
    assert {class_name}().{activity_method}() == "{activity_name} completed"
''',
        "README.md": f"""# {project_name}

{description}

Generated with `rpaforge create-library`.

## Install

```bash
pip install -e .
```

The `{class_name}` library is registered through the `rpaforge.libraries`
entry-point group and will appear in the RPAForge Activity Palette after the
Studio bridge is restarted.

## Test

```bash
pytest
```
""",
        "LICENSE": "Apache License 2.0\n\nCopyright (c) 2026 " + author + "\n",
    }


def create_library(
    name: str,
    description: str,
    author: str,
    activity_name: str,
    output_dir: Path | str = ".",
) -> Path:
    """Generate an installable RPAForge library project."""
    project_name = _slugify(name)
    package_name = _package_name(project_name)
    class_name = _class_name(name)
    activity_method = _method_name(activity_name)
    destination = Path(output_dir) / project_name
    if destination.exists():
        raise FileExistsError(f"Destination already exists: {destination}")

    files = _render_files(
        project_name=project_name,
        package_name=package_name,
        class_name=class_name,
        description=description,
        author=author,
        activity_name=activity_name,
        activity_method=activity_method,
    )
    for relative_path, content in files.items():
        path = destination / relative_path
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content, encoding="utf-8")
    return destination


def _prompt_non_empty(prompt: Prompt, label: str) -> str:
    """Prompt until a non-empty answer is supplied."""
    while True:
        value = prompt(label).strip()
        if value:
            return value
        print("This value cannot be empty.", file=sys.stderr)


def _create_library_command(prompt: Prompt | None = None) -> int:
    """Run the interactive create-library command."""
    prompt = input if prompt is None else prompt
    name = _prompt_non_empty(prompt, "Library name: ")
    description = _prompt_non_empty(prompt, "Description: ")
    author = _prompt_non_empty(prompt, "Author: ")
    activity_name = _prompt_non_empty(prompt, "First activity name: ")
    try:
        destination = create_library(name, description, author, activity_name)
    except (FileExistsError, ValueError) as error:
        print(f"Error: {error}", file=sys.stderr)
        return 1
    print(
        f"Library created at ./{destination.name}/. Run "
        f"cd {destination.name} && pip install -e . to install"
    )
    return 0


def main(argv: Sequence[str] | None = None) -> int:
    """Run the RPAForge command-line interface."""
    parser = argparse.ArgumentParser(prog="rpaforge")
    subparsers = parser.add_subparsers(dest="command")
    subparsers.add_parser("create-library", help="Scaffold an RPAForge library")
    args = parser.parse_args(argv)
    if args.command == "create-library":
        return _create_library_command()
    parser.print_help()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
