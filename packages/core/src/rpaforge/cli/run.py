"""Headless project loading and execution for the RPAForge CLI."""

from __future__ import annotations

import json
import os
import signal
import threading
from collections.abc import Callable
from dataclasses import dataclass
from enum import IntEnum
from pathlib import Path
from typing import Any

from rpaforge.core.diagram_converter import DiagramConverter
from rpaforge.core.execution import ExecutionResult, ExecutionStatus, Process
from rpaforge.core.runner import StudioEngine
from rpaforge.core.validation import validate_variable_name
from rpaforge.core.validator import ValidationError as DiagramValidationError


class RunExitCode(IntEnum):
    """Stable exit codes returned by ``rpaforge run``."""

    SUCCESS = 0
    EXECUTION_FAILURE = 1
    VALIDATION_FAILURE = 2
    CANCELLED = 3
    CONFIGURATION_ERROR = 4


class RunConfigurationError(ValueError):
    """Raised when a run request cannot be configured."""


class RunValidationError(ValueError):
    """Raised when a source diagram cannot be converted into a process."""


@dataclass(frozen=True)
class LoadedDiagram:
    """A selected diagram and its source metadata."""

    document: dict[str, Any]
    variables: list[dict[str, Any]]
    source: Path


def _read_json(path: Path) -> dict[str, Any]:
    try:
        with path.open(encoding="utf-8") as stream:
            value = json.load(stream)
    except FileNotFoundError as error:
        raise RunConfigurationError(f"Input file does not exist: {path}") from error
    except OSError as error:
        raise RunConfigurationError(f"Cannot read input file: {path}") from error
    except json.JSONDecodeError as error:
        raise RunConfigurationError(f"Input is not valid JSON: {path}") from error

    if not isinstance(value, dict):
        raise RunConfigurationError("Input JSON must contain an object")
    return value


def _check_version(value: dict[str, Any]) -> None:
    version = value.get("version")
    if version is not None and version not in {"1.0.0", "1.1.0"}:
        raise RunConfigurationError(f"Unsupported file version: {version}")


def _document_from_value(value: dict[str, Any]) -> dict[str, Any]:
    _check_version(value)
    if isinstance(value.get("diagram"), dict):
        nested = value["diagram"]
        document = dict(value)
        document.update(nested)
        document.pop("diagram", None)
    else:
        document = dict(value)

    if not isinstance(document.get("nodes"), list) or not isinstance(
        document.get("edges"), list
    ):
        raise RunConfigurationError("A process document must contain nodes and edges")
    return document


def _matches_diagram(key: str, document: dict[str, Any], selector: str) -> bool:
    metadata = document.get("metadata")
    if not isinstance(metadata, dict):
        return key == selector
    return selector in {
        key,
        str(metadata.get("id", "")),
        str(metadata.get("name", "")),
    }


def _select_project_diagram(
    source: Path,
    project: dict[str, Any],
    diagrams: dict[str, Any],
    variables: dict[str, Any] | None,
    selector: str | None,
) -> LoadedDiagram:
    candidates = [(str(key), value) for key, value in diagrams.items()]
    candidates = [(key, value) for key, value in candidates if isinstance(value, dict)]
    if not candidates:
        raise RunConfigurationError("Project does not contain any diagrams")

    selected: tuple[str, dict[str, Any]] | None = None
    if selector:
        selected = next(
            (
                (key, value)
                for key, value in candidates
                if _matches_diagram(key, value, selector)
            ),
            None,
        )
        if selected is None:
            raise RunConfigurationError(f"Diagram not found: {selector}")
    else:
        main_id = project.get("main")
        selected = next(
            ((key, value) for key, value in candidates if key == main_id),
            candidates[0],
        )

    key, value = selected
    document = _document_from_value(value)
    selected_variables = variables.get(key, []) if isinstance(variables, dict) else []
    if not isinstance(selected_variables, list):
        selected_variables = []
    document_variables = document.get("variables")
    return LoadedDiagram(
        document=document,
        variables=document_variables
        if isinstance(document_variables, list)
        else selected_variables,
        source=source,
    )


def _safe_project_path(root: Path, relative_path: str) -> Path:
    candidate = (root / relative_path).resolve()
    try:
        candidate.relative_to(root.resolve())
    except ValueError as error:
        raise RunConfigurationError(
            "Project diagram path escapes the project root"
        ) from error
    return candidate


def _load_manifest(
    manifest_path: Path, manifest: dict[str, Any], selector: str | None
) -> LoadedDiagram:
    project = manifest.get("project")
    entries = manifest.get("diagrams")
    if not isinstance(project, dict) or not isinstance(entries, list) or not entries:
        raise RunConfigurationError("Project manifest has no valid diagram entries")

    selected: dict[str, Any] | None = None
    if selector:
        selected = next(
            (
                entry
                for entry in entries
                if isinstance(entry, dict)
                and selector
                in {
                    str(entry.get("id", "")),
                    str(entry.get("name", "")),
                    str(entry.get("path", "")),
                }
            ),
            None,
        )
        if selected is None:
            raise RunConfigurationError(f"Diagram not found: {selector}")
    else:
        main_id = project.get("main")
        selected = next(
            (
                entry
                for entry in entries
                if isinstance(entry, dict)
                and (entry.get("id") == main_id or entry.get("type") == "main")
            ),
            entries[0] if isinstance(entries[0], dict) else None,
        )

    if not selected or not isinstance(selected.get("path"), str):
        raise RunConfigurationError("Selected manifest entry has no process path")
    process_path = _safe_project_path(manifest_path.parent, selected["path"])
    document = _document_from_value(_read_json(process_path))
    manifest_variables = manifest.get("variables")
    selected_variables = (
        manifest_variables.get(str(selected.get("id")), [])
        if isinstance(manifest_variables, dict)
        else []
    )
    return LoadedDiagram(
        document=document,
        variables=document.get("variables", [])
        if isinstance(document.get("variables"), list)
        else selected_variables,
        source=process_path,
    )


def load_diagram(source: Path | str, selector: str | None = None) -> LoadedDiagram:
    """Load a standalone process, project export, or folder project."""
    input_path = Path(source).expanduser()
    if input_path.is_dir():
        manifests = sorted(input_path.glob("*.rpaforge"))
        if len(manifests) != 1:
            raise RunConfigurationError(
                "A project directory must contain exactly one .rpaforge manifest"
            )
        input_path = manifests[0]
    if not input_path.is_file():
        raise RunConfigurationError(f"Input path does not exist: {input_path}")

    value = _read_json(input_path)
    _check_version(value)
    if isinstance(value.get("diagrams"), dict):
        project = value.get("project")
        if not isinstance(project, dict):
            raise RunConfigurationError("Project export has no project metadata")
        return _select_project_diagram(
            input_path,
            project,
            value["diagrams"],
            value.get("variables"),
            selector,
        )
    if isinstance(value.get("diagrams"), list):
        return _load_manifest(input_path, value, selector)
    return LoadedDiagram(
        document=_document_from_value(value),
        variables=value.get("variables", [])
        if isinstance(value.get("variables"), list)
        else [],
        source=input_path,
    )


def _parse_assignment(raw: str, option: str) -> tuple[str, str]:
    name, separator, value = raw.partition("=")
    if not separator or not name:
        raise RunConfigurationError(f"{option} must use NAME=VALUE syntax")
    try:
        validate_variable_name(name)
    except Exception as error:
        raise RunConfigurationError(f"Invalid variable name: {name}") from error
    return name, value


def _parse_value(value: str) -> Any:
    try:
        return json.loads(value)
    except json.JSONDecodeError:
        return value


def apply_overrides(
    process: Process,
    variables: list[dict[str, Any]],
    values: list[str],
    secret_envs: list[str],
) -> None:
    """Apply explicit CLI variables without exposing their values."""
    for variable in variables:
        name = variable.get("name")
        if isinstance(name, str) and name:
            process.variables.setdefault(name, variable.get("value", ""))

    for raw in values:
        name, value = _parse_assignment(raw, "--var")
        process.set_variable(name, _parse_value(value))

    for raw in secret_envs:
        name, environment_name = _parse_assignment(raw, "--secret-env")
        if environment_name not in os.environ:
            raise RunConfigurationError(
                f"Environment variable is not set: {environment_name}"
            )
        process.set_variable(name, os.environ[environment_name])


def _result_payload(
    engine: StudioEngine,
    result: ExecutionResult,
    process: Process,
) -> dict[str, Any]:
    audit_path = engine.last_audit_path
    return {
        "status": result.status.value.lower(),
        "process": process.name,
        "run_id": engine.last_run_id,
        "audit_path": str(audit_path) if audit_path else None,
        "elapsed_ms": result.elapsed_ms,
        "message": result.message,
    }


def run_process(
    loaded: LoadedDiagram,
    values: list[str] | None = None,
    secret_envs: list[str] | None = None,
    timeout: float | None = None,
    engine_factory: Callable[[], StudioEngine] = StudioEngine,
) -> tuple[RunExitCode, dict[str, Any]]:
    """Convert and execute a selected diagram, returning its CLI result."""
    if timeout is not None and timeout <= 0:
        raise RunConfigurationError("--timeout must be greater than zero")
    try:
        process = DiagramConverter().convert(loaded.document)
    except (DiagramValidationError, KeyError, TypeError, ValueError) as error:
        raise RunValidationError(str(error)) from error

    apply_overrides(process, loaded.variables, values or [], secret_envs or [])
    engine = engine_factory()
    cancel_requested = threading.Event()

    def request_cancel(_signum: int | None = None, _frame: Any = None) -> None:
        cancel_requested.set()
        engine.cancel()

    previous_handlers: dict[signal.Signals, Any] = {}
    for signum in (signal.SIGINT, signal.SIGTERM):
        try:
            previous_handlers[signum] = signal.getsignal(signum)
            signal.signal(signum, request_cancel)
        except (OSError, RuntimeError, ValueError):
            pass

    timer = threading.Timer(timeout, request_cancel) if timeout else None
    if timer:
        timer.daemon = True
        timer.start()
    try:
        result = engine.run(process)
    finally:
        if timer:
            timer.cancel()
        for signum, handler in previous_handlers.items():
            signal.signal(signum, handler)
        engine.close()

    payload = _result_payload(engine, result, process)
    if cancel_requested.is_set() or result.status == ExecutionStatus.CANCELLED:
        return RunExitCode.CANCELLED, payload
    if result.status != ExecutionStatus.PASS:
        return RunExitCode.EXECUTION_FAILURE, payload
    return RunExitCode.SUCCESS, payload


def error_payload(status: str, message: str) -> dict[str, Any]:
    """Build a non-leaking error response for CLI output."""
    return {"status": status, "error": message, "run_id": None, "audit_path": None}
