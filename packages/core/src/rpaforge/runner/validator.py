"""Static pre-flight validation for processes, projects, and packages."""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from rpaforge.cli.run import RunConfigurationError, RunValidationError, load_diagram
from rpaforge.core.activity import LIBRARY_REGISTRY
from rpaforge.core.diagram_converter import DiagramConverter
from rpaforge.core.validator import ProcessValidator


@dataclass
class ValidationReport:
    """Detailed result of a static pre-flight validation check."""

    is_valid: bool
    source_path: str
    process_name: str = ""
    errors: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    node_count: int = 0
    edge_count: int = 0
    variable_count: int = 0
    activities: list[str] = field(default_factory=list)
    libraries: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "valid": self.is_valid,
            "source": self.source_path,
            "process_name": self.process_name,
            "errors": self.errors,
            "warnings": self.warnings,
            "stats": {
                "nodes": self.node_count,
                "edges": self.edge_count,
                "variables": self.variable_count,
                "activities_count": len(self.activities),
                "libraries_count": len(self.libraries),
            },
            "activities": self.activities,
            "libraries": self.libraries,
        }


def validate_source(
    source: Path | str, selector: str | None = None
) -> ValidationReport:
    """Validate a standalone process, project, or package without executing it."""
    source_str = str(source)
    try:
        loaded = load_diagram(source, selector)
    except (RunConfigurationError, RunValidationError) as err:
        return ValidationReport(
            is_valid=False,
            source_path=source_str,
            errors=[str(err)],
        )
    except Exception as err:
        return ValidationReport(
            is_valid=False,
            source_path=source_str,
            errors=[f"Failed to load diagram: {err}"],
        )

    doc = loaded.document
    report = ValidationReport(
        is_valid=True,
        source_path=str(loaded.source),
    )

    validator = ProcessValidator()
    validation_res = validator.validate_diagram(doc)
    report.errors.extend(validation_res.errors)
    report.warnings.extend(validation_res.warnings)

    try:
        converter = DiagramConverter()
        process = converter.convert(doc)
        report.process_name = process.name
    except Exception as err:
        report.errors.append(f"Diagram conversion failed: {err}")

    nodes = doc.get("nodes", [])
    edges = doc.get("edges", [])
    report.node_count = len(nodes)
    report.edge_count = len(edges)
    report.variable_count = len(loaded.variables)

    # Collect activities and check availability
    discovered_activities: set[str] = set()
    discovered_libraries: set[str] = set()

    for node in nodes:
        if not isinstance(node, dict):
            continue
        data = node.get("data", {})
        if not isinstance(data, dict):
            continue
        block_data = (
            data.get("blockData", {})
            if isinstance(data.get("blockData"), dict)
            else data
        )
        raw_act = (
            block_data.get("activity")
            or data.get("activity")
            or data.get("label")
            or data.get("name")
        )
        act_name = raw_act.get("name") if isinstance(raw_act, dict) else raw_act
        lib_name = block_data.get("library") or data.get("library")
        if isinstance(raw_act, dict) and not lib_name:
            lib_name = raw_act.get("library")

        if lib_name:
            discovered_libraries.add(str(lib_name))
        if act_name:
            full_name = f"{lib_name}.{act_name}" if lib_name else str(act_name)
            discovered_activities.add(full_name)

        # Check library presence if specified and not built-in
        if (
            lib_name
            and str(lib_name) not in LIBRARY_REGISTRY
            and str(lib_name) not in {"BuiltIn", "Flow"}
        ):
            report.warnings.append(
                f"Node '{node.get('id', '')}': Library '{lib_name}' is not currently loaded in local environment"
            )

    report.activities = sorted(discovered_activities)
    report.libraries = sorted(discovered_libraries)

    if report.errors:
        report.is_valid = False

    return report
