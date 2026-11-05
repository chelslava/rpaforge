"""Custom activity packaging: sub-diagram → installable library (issue #851).

A sub-diagram becomes a first-class activity by generating a distributable
Python library project that bundles the diagram JSON and executes it through
the native runtime at call time: DiagramConverter turns the document into a
``Process``, declared inputs are seeded as process variables, and the wrapped
engine returns the sub-diagram's final variable state — declared outputs are
mapped into the activity result.

The generated project is a plain ``rpaforge.libraries`` entry-point package,
so installed custom activities load identically to built-in ones (palette,
dispatch, sandbox, policies) with zero engine changes.
"""

from __future__ import annotations

import json
import keyword
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

__all__ = [
    "ActivityContract",
    "build_activity_project",
    "derive_contract",
]

_PARAM_TYPES = ("string", "integer", "number", "boolean")

_TOKEN_RE = re.compile(r"\b[A-Za-z_][A-Za-z0-9_]*\b")

_EXPRESSION_FIELDS = ("expression", "condition")


@dataclass
class ActivityContract:
    """Sub-diagram variable contract (user-confirmable)."""

    #: ``{"name", "type": string|integer|number|boolean, "default"}``
    inputs: list[dict[str, Any]] = field(default_factory=list)
    #: Variable names mapped into the activity result after execution.
    outputs: list[str] = field(default_factory=list)
    #: Non-fatal derivation notes (e.g. proposed inputs).
    warnings: list[str] = field(default_factory=list)


def _snake(name: str) -> str:
    slug = re.sub(r"[^A-Za-z0-9]+", "_", name).strip("_").lower()
    return slug or "activity"


def _pascal(name: str) -> str:
    parts = re.split(r"[^A-Za-z0-9]+", name.strip())
    joined = "".join(p[:1].upper() + p[1:] for p in parts if p)
    if not joined or joined[0].isdigit():
        joined = f"Activity{joined}"
    return joined


def _iter_block_data(diagram: dict[str, Any]) -> list[dict[str, Any]]:
    return [
        node.get("data", {}).get("blockData", {})
        for node in diagram.get("nodes", [])
        if isinstance(node, dict)
    ]


def derive_contract(sub_diagram: dict[str, Any]) -> ActivityContract:
    """Propose the input/output variable contract of a sub-diagram.

    Outputs: every activity ``output_variable`` written inside the
    sub-diagram. Inputs: identifiers referenced by expressions/conditions
    that are never assigned or pre-declared as diagram variables.
    """
    contract = ActivityContract()

    assigned: set[str] = set()
    for block in _iter_block_data(sub_diagram):
        name = block.get("variableName")
        if isinstance(name, str) and name:
            assigned.add(name)
        output = block.get("output_variable")
        if isinstance(output, str) and output and output not in contract.outputs:
            contract.outputs.append(output)

    declared: set[str] = set()
    for variable in sub_diagram.get("variables", []) or []:
        if isinstance(variable, dict):
            name = variable.get("name")
            if isinstance(name, str) and name:
                declared.add(name)

    seen_tokens: set[str] = set()
    for block in _iter_block_data(sub_diagram):
        for field_name in _EXPRESSION_FIELDS:
            value = block.get(field_name)
            if not isinstance(value, str):
                continue
            for token in _TOKEN_RE.findall(value):
                if token in seen_tokens:
                    continue
                seen_tokens.add(token)
                if (
                    token in assigned
                    or token in declared
                    or token in contract.outputs
                    or keyword.iskeyword(token)
                ):
                    continue
                contract.inputs.append({"name": token, "type": "string", "default": ""})
                contract.warnings.append(
                    f"'{token}' is referenced but never assigned — proposed as input"
                )
    return contract


def _python_type(param_type: str) -> str:
    return {
        "integer": "int",
        "number": "float",
        "boolean": "bool",
    }.get(param_type, "str")


def _param_literal(value: Any, param_type: str) -> str:
    if param_type == "integer":
        try:
            return str(int(value))
        except (TypeError, ValueError):
            return "0"
    if param_type == "number":
        try:
            return str(float(value))
        except (TypeError, ValueError):
            return "0.0"
    if param_type == "boolean":
        return "True" if value in (True, "true", "True", 1) else "False"
    return json.dumps(str(value))


def _render_library_source(
    *,
    class_name: str,
    activity_name: str,
    method_name: str,
    description: str,
    contract: ActivityContract,
    returns: list[str],
) -> str:
    decorators: list[str] = []
    params: list[str] = []
    for spec in contract.inputs:
        name = spec["name"]
        param_type = spec.get("type", "string")
        if param_type not in _PARAM_TYPES:
            param_type = "string"
        decorators.append(
            f'    @param("{name}", type="{param_type}", description="Input {name}.")'
        )
        default_literal = _param_literal(spec.get("default", ""), param_type)
        params.append(f"{name}: {_python_type(param_type)} = {default_literal}")

    decorator_block = "\n".join(decorators)
    signature = ", ".join(["self", *params]) if params else "self"

    body: list[str] = [
        '        """Execute the packaged sub-diagram and return its outputs."""'
    ]
    for spec in contract.inputs:
        coerced = spec.get("type", "string")
        if coerced not in _PARAM_TYPES:
            coerced = "string"
        body.append(f"        {spec['name']} = _convert_{coerced}({spec['name']})")
    body.append(
        '        diagram = json.loads(_DIAGRAM_PATH.read_text(encoding="utf-8"))'
    )
    body.append("        process = DiagramConverter().convert(diagram)")
    for spec in contract.inputs:
        body.append(f'        process.set_variable("{spec["name"]}", {spec["name"]})')
    body.append("        engine = StudioEngine()")
    body.append("        result = engine.run(process)")
    body.append("        if not result.passed:")
    body.append(
        '            raise RuntimeError(f"sub-diagram failed: {result.message}")'
    )
    if returns:
        body.append("        return {")
        for name in returns:
            body.append(f'            "{name}": result.variables.get("{name}"),')
        body.append("        }")
    else:
        body.append("        return {}")
    body_block = "\n".join(body)

    return f'''"""Generated wrapper executing the packaged sub-diagram natively."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from rpaforge import StudioEngine
from rpaforge.core.activity import activity, library, param
from rpaforge.core.diagram_converter import DiagramConverter

_DIAGRAM_PATH = Path(__file__).with_name("diagram.json")


def _convert_string(value: Any) -> str:
    return str(value)


def _convert_integer(value: Any) -> int:
    return int(value)


def _convert_number(value: Any) -> float:
    return float(value)


def _convert_boolean(value: Any) -> bool:
    return bool(value)


@library(name="{class_name}", category="Custom")
class {class_name}:
    """{description}."""

    @activity(name="{activity_name}", category="Custom")
{decorator_block}
    def {method_name}({signature}) -> dict[str, Any]:
{body_block}
'''


def build_activity_project(
    output_dir: Path | str,
    *,
    diagram: dict[str, Any],
    library_name: str,
    activity_name: str,
    description: str = "",
    version: str = "0.1.0",
    author: str = "RPAForge Studio",
    contract: ActivityContract | None = None,
    returns: list[str] | None = None,
) -> Path:
    """Generate an installable custom-activity library project.

    The returned directory is a setuptools project registering one library
    (entry point ``rpaforge.libraries``) whose single activity executes the
    bundled sub-diagram through the native runtime. Names are sanitized
    deterministically; keyword collisions get a suffix.
    """
    resolved_contract = contract or derive_contract(diagram)
    output_names = returns if returns is not None else list(resolved_contract.outputs)

    package_name = _snake(library_name)
    if keyword.iskeyword(package_name):
        package_name = f"{package_name}_lib"
    class_name = _pascal(library_name)
    method_name = _snake(activity_name)
    if keyword.iskeyword(method_name):
        method_name = f"{method_name}_act"
    text = description or f'Custom activity packaging the "{library_name}" sub-diagram'

    destination = Path(output_dir) / package_name
    if destination.exists():
        raise FileExistsError(f"Destination already exists: {destination}")

    files: dict[str, str] = {
        "pyproject.toml": f'''[build-system]
requires = ["setuptools>=61.0", "wheel"]
build-backend = "setuptools.build_meta"

[project]
name = "{package_name}"
version = "{version}"
description = "{text}"
readme = "README.md"
license = {{text = "Apache-2.0"}}
requires-python = ">=3.12"
authors = [{{name = "{author}"}}]
dependencies = [
    "rpaforge-core>=0.7.0",
]

[project.entry-points."rpaforge.libraries"]
{class_name} = "{package_name}.library:{class_name}"

[tool.setuptools.packages.find]
where = ["src"]

[tool.setuptools.package-data]
{package_name} = ["diagram.json"]
''',
        f"src/{package_name}/__init__.py": (
            f'"""{text}."""\n\nfrom {package_name}.library import {class_name}\n\n'
            f'__all__ = ["{class_name}"]\n'
        ),
        f"src/{package_name}/diagram.json": json.dumps(
            diagram, ensure_ascii=False, indent=2
        ),
        f"src/{package_name}/library.py": _render_library_source(
            class_name=class_name,
            activity_name=activity_name,
            method_name=method_name,
            description=text,
            contract=resolved_contract,
            returns=output_names,
        ),
        "tests/test_library.py": (
            f"from {package_name}.library import {class_name}\n\n\n"
            f"def test_activity_callable():\n"
            f'    """The generated activity exposes the packaged method."""\n'
            f'    assert hasattr({class_name}(), "{method_name}")\n'
        ),
        "README.md": (
            f"# {class_name}\n\n{text}\n\nGenerated with "
            f"`rpaforge build-activity` (issue #851).\n\n## Install\n\n"
            "```bash\npip install -e .\n```\n"
        ),
        "LICENSE": "Apache License 2.0\n\nCopyright (c) 2026 " + author + "\n",
    }
    for relative_path, content in files.items():
        path = destination / relative_path
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content, encoding="utf-8")
    return destination
