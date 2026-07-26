"""Tests for the RPAForge scaffolding CLI."""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path
from shutil import which

from rpaforge.cli import create_library, main
from rpaforge.cli.run import (
    LoadedDiagram,
    RunConfigurationError,
    RunExitCode,
    apply_overrides,
    load_diagram,
    run_process,
)
from rpaforge.core.execution import ExecutionResult, ExecutionStatus, Process


def _diagram(name: str = "Demo") -> dict:
    return {
        "version": "1.1.0",
        "metadata": {
            "id": "demo",
            "name": name,
            "createdAt": "2026-01-01T00:00:00Z",
            "updatedAt": "2026-01-01T00:00:00Z",
        },
        "nodes": [
            {
                "id": "start",
                "type": "start",
                "position": {"x": 0, "y": 0},
                "data": {"blockData": {"type": "start", "processName": name}},
            }
        ],
        "edges": [],
        "variables": [{"name": "existing", "type": "string", "value": "file"}],
    }


def test_create_library_generates_installable_project(tmp_path):
    destination = create_library(
        "My RPA Library",
        "Automates the monthly report",
        "Ada Lovelace",
        "Generate Report",
        tmp_path,
    )

    assert destination == tmp_path / "my-rpa-library"
    assert (destination / "pyproject.toml").is_file()
    assert (destination / "src/my_rpa_library/__init__.py").is_file()
    assert (destination / "src/my_rpa_library/library.py").is_file()
    assert (destination / "tests/test_library.py").is_file()
    assert 'MyRpaLibrary = "my_rpa_library.library:MyRpaLibrary"' in (
        destination / "pyproject.toml"
    ).read_text(encoding="utf-8")
    subprocess.run(
        [
            which("uv") or "uv",
            "pip",
            "install",
            "--python",
            sys.executable,
            "-e",
            ".",
            "--no-deps",
        ],
        cwd=destination,
        check=True,
        capture_output=True,
        text=True,
    )
    subprocess.run(
        [
            sys.executable,
            "-c",
            (
                "from rpaforge.core.activity import discover_libraries; "
                "assert any(name == 'MyRpaLibrary' for name, _ in discover_libraries())"
            ),
        ],
        check=True,
        capture_output=True,
        text=True,
    )
    subprocess.run(
        [sys.executable, "-m", "pytest", "tests"],
        cwd=destination,
        check=True,
        capture_output=True,
        text=True,
    )


def test_cli_prompts_for_required_values_and_reports_destination(
    tmp_path, monkeypatch, capsys
):
    answers = iter(["Demo Library", "A demo", "Test Author", "Do Thing"])
    monkeypatch.chdir(tmp_path)
    monkeypatch.setattr("builtins.input", lambda _prompt: next(answers))

    assert main(["create-library"]) == 0
    assert "Library created at ./demo-library/." in capsys.readouterr().out


def test_create_library_rejects_existing_destination(tmp_path):
    create_library("Existing", "Description", "Author", "Activity", tmp_path)

    try:
        create_library("Existing", "Description", "Author", "Activity", tmp_path)
    except FileExistsError:
        pass
    else:
        raise AssertionError("Existing destinations must not be overwritten")


def test_load_diagram_selects_main_project_diagram(tmp_path):
    source = tmp_path / "project.rpaforge"
    source.write_text(
        json.dumps(
            {
                "version": "1.1.0",
                "project": {"name": "Demo", "main": "main"},
                "diagrams": {"main": _diagram("Main"), "other": _diagram("Other")},
            }
        ),
        encoding="utf-8",
    )

    loaded = load_diagram(source)

    assert loaded.document["metadata"]["name"] == "Main"
    assert loaded.source == source


def test_load_diagram_rejects_unknown_project_diagram(tmp_path):
    source = tmp_path / "project.rpaforge"
    source.write_text(
        json.dumps(
            {
                "version": "1.1.0",
                "project": {"main": "main"},
                "diagrams": {"main": _diagram()},
            }
        ),
        encoding="utf-8",
    )

    try:
        load_diagram(source, "missing")
    except RunConfigurationError as error:
        assert "Diagram not found" in str(error)
    else:
        raise AssertionError("Unknown diagram selectors must fail safely")


def test_apply_overrides_keeps_secret_values_out_of_process_metadata(monkeypatch):
    process = Process(name="Demo")
    monkeypatch.setenv("RPA_SECRET", "do-not-print")

    apply_overrides(
        process,
        [{"name": "existing", "value": "file"}],
        ["count=2"],
        ["token=RPA_SECRET"],
    )

    assert process.variables == {
        "existing": "file",
        "count": 2,
        "token": "do-not-print",
    }


class _FakeEngine:
    last_run_id = "run-test"
    last_audit_path = None

    def run(self, process):
        assert process.variables["count"] == 2
        return ExecutionResult(status=ExecutionStatus.PASS, elapsed_ms=3)

    def cancel(self):
        pass

    def close(self):
        pass


def test_run_process_returns_structured_success_without_variable_values():
    code, payload = run_process(
        LoadedDiagram(document=_diagram(), variables=[], source=Path("demo.process")),
        values=["count=2"],
        engine_factory=_FakeEngine,
    )

    assert code == RunExitCode.SUCCESS
    assert payload["run_id"] == "run-test"
    assert "do-not-print" not in str(payload)
