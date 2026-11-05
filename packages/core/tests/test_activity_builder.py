"""Tests for custom activity packaging (issue #851)."""

from __future__ import annotations

import json
import shutil
import subprocess
import sys
from pathlib import Path

import pytest

from rpaforge.core.execution import ProcessBuilder
from rpaforge.core.executor import ProcessExecutor
from rpaforge.core.library_sandbox import ImportWhitelistChecker
from rpaforge.core.runner import ProcessRunner
from rpaforge.packaging.activity_builder import (
    ActivityContract,
    build_activity_project,
    derive_contract,
)


def _sub_diagram() -> dict:
    """Three-node flow: log an input, capture a timestamp output."""
    return {
        "nodes": [
            {"id": "s", "data": {"blockData": {"type": "start", "processName": "Sub"}}},
            {
                "id": "g",
                "data": {
                    "blockData": {
                        "type": "activity",
                        "library": "Flow",
                        "activity": "Log Message",
                        "args": ["greeting"],
                        "output_variable": "",
                    }
                },
            },
            {
                "id": "t",
                "data": {
                    "blockData": {
                        "type": "activity",
                        "library": "Flow",
                        "activity": "Timestamp",
                        "args": [],
                        "output_variable": "ts",
                    }
                },
            },
            {"id": "e", "data": {"blockData": {"type": "end"}}},
        ],
        "edges": [
            {"id": "s-g", "source": "s", "target": "g"},
            {"id": "g-t", "source": "g", "target": "t"},
            {"id": "t-e", "source": "t", "target": "e"},
        ],
    }


def _build_greeter(tmp_path: Path) -> Path:
    return build_activity_project(
        tmp_path,
        diagram=_sub_diagram(),
        library_name="Greeter",
        activity_name="Run Greeting",
        description="Greets the user",
        contract=ActivityContract(
            inputs=[{"name": "greeting", "type": "string", "default": "hello"}],
            outputs=["ts"],
        ),
    )


class TestDeriveContract:
    def test_outputs_from_activity_output_variables(self):
        contract = derive_contract(_sub_diagram())
        assert contract.outputs == ["ts"]

    def test_unassigned_expression_identifiers_proposed_as_inputs(self):
        diagram = _sub_diagram()
        diagram["nodes"].append(
            {
                "id": "c",
                "data": {"blockData": {"type": "if", "condition": "threshold > 0"}},
            }
        )
        contract = derive_contract(diagram)
        names = [spec["name"] for spec in contract.inputs]
        assert names == ["threshold"]
        assert any("threshold" in warning for warning in contract.warnings)

    def test_assigned_and_declared_names_not_proposed(self):
        diagram = _sub_diagram()
        diagram["nodes"].append(
            {
                "id": "a",
                "data": {
                    "blockData": {
                        "type": "assign",
                        "variableName": "threshold",
                        "expression": "10",
                    }
                },
            }
        )
        contract = derive_contract(diagram)
        assert [spec["name"] for spec in contract.inputs] == []

    def test_python_keywords_excluded(self):
        diagram = _sub_diagram()
        diagram["nodes"].append(
            {
                "id": "c",
                "data": {
                    "blockData": {"type": "if", "condition": "True and not False"}
                },
            }
        )
        assert derive_contract(diagram).inputs == []


class TestBuildActivityProject:
    def test_project_layout_and_entry_point(self, tmp_path: Path):
        destination = _build_greeter(tmp_path)
        assert (destination / "pyproject.toml").is_file()
        library_py = destination / "src/greeter/library.py"
        assert library_py.is_file()
        assert (destination / "src/greeter/diagram.json").is_file()
        pyproject = (destination / "pyproject.toml").read_text(encoding="utf-8")
        assert 'Greeter = "greeter.library:Greeter"' in pyproject
        assert '[project.entry-points."rpaforge.libraries"]' in pyproject

    def test_generated_source_compiles(self, tmp_path: Path):
        destination = _build_greeter(tmp_path)
        source = (destination / "src/greeter/library.py").read_text(encoding="utf-8")
        compile(source, "library.py", "exec")

    def test_generated_source_passes_library_sandbox(self, tmp_path: Path):
        destination = _build_greeter(tmp_path)
        source = (destination / "src/greeter/library.py").read_text(encoding="utf-8")
        ImportWhitelistChecker().check_source(source)

    def test_generated_source_passes_ruff(self, tmp_path: Path):
        """Generated wrappers must satisfy the repo ruff gates when available."""
        ruff = shutil.which("ruff")
        if not ruff:
            pytest.skip("ruff not available")
        destination = _build_greeter(tmp_path)
        library_py = destination / "src/greeter/library.py"
        # Format gate: file must already be ruff-formatted.
        check = subprocess.run(
            [ruff, "format", "--check", str(library_py)],
            capture_output=True,
            text=True,
            check=False,
        )
        assert check.returncode == 0, check.stdout + check.stderr
        # Lint gate: no rule violations (E501 excluded — lines mirror templates).
        lint = subprocess.run(
            [ruff, "check", "--no-cache", str(library_py)],
            capture_output=True,
            text=True,
            check=False,
        )
        assert lint.returncode == 0, lint.stdout + lint.stderr

    def test_generated_source_passes_mypy(self, tmp_path: Path):
        """Generated wrappers must satisfy the repo mypy gate when available."""
        mypy = shutil.which("mypy")
        if not mypy:
            pytest.skip("mypy not available")
        destination = _build_greeter(tmp_path)
        library_py = destination / "src/greeter/library.py"
        result = subprocess.run(
            [mypy, "--ignore-missing-imports", str(library_py)],
            capture_output=True,
            text=True,
            check=False,
        )
        assert result.returncode == 0, result.stdout + result.stderr

    def test_existing_destination_rejected(self, tmp_path: Path):
        _build_greeter(tmp_path)
        with pytest.raises(FileExistsError):
            _build_greeter(tmp_path)

    def test_keyword_name_sanitized(self, tmp_path: Path):
        destination = build_activity_project(
            tmp_path,
            diagram=_sub_diagram(),
            library_name="Class",
            activity_name="Import",
            contract=ActivityContract(),
        )
        assert (destination / "src/class_lib/library.py").is_file()


class TestRoundTripWithExecutor:
    """Acceptance round-trip: package → install path → real executor run."""

    def test_packaged_activity_executes_via_real_executor(self, tmp_path: Path):
        destination = _build_greeter(tmp_path)
        sys.path.insert(0, str(destination / "src"))
        try:
            module = __import__("greeter.library", fromlist=["Greeter"])
            executor = ProcessExecutor()
            executor.register_library("Greeter", module.Greeter())
            runner = ProcessRunner(executor=executor)
            builder = ProcessBuilder("UsePackaged")
            task = builder.add_task("Main")
            task.add_activity(
                "Greeter", "run_greeting", "bonjour", output_variable="captured"
            )
            result = runner.run(builder.build())
            assert result.passed, result.message
            captured = result.variables["captured"]
            assert isinstance(captured, dict)
            assert isinstance(captured["ts"], float)
        finally:
            sys.path.remove(str(destination / "src"))
            sys.modules.pop("greeter", None)
            sys.modules.pop("greeter.library", None)

    def test_input_seeding_reaches_nested_activity(self, tmp_path: Path):
        """The declared input resolves as a variable inside the sub-diagram."""
        diagram = _sub_diagram()
        # Replace the timestamp activity with one echoing the seeded input.
        diagram["nodes"][2] = {
            "id": "t",
            "data": {
                "blockData": {
                    "type": "activity",
                    "library": "Flow",
                    "activity": "Log Message",
                    "args": ["greeting"],
                    "output_variable": "echoed",
                }
            },
        }
        destination = build_activity_project(
            tmp_path,
            diagram=diagram,
            library_name="Echo",
            activity_name="Echo Greeting",
            contract=ActivityContract(
                inputs=[{"name": "greeting", "type": "string", "default": "hi"}],
                outputs=["echoed"],
            ),
        )
        sys.path.insert(0, str(destination / "src"))
        try:
            module = __import__("echo.library", fromlist=["Echo"])
            executor = ProcessExecutor()
            executor.register_library("Echo", module.Echo())
            runner = ProcessRunner(executor=executor)
            builder = ProcessBuilder("UseEcho")
            task = builder.add_task("Main")
            task.add_activity("Echo", "echo_greeting", "salut", output_variable="out")
            result = runner.run(builder.build())
            assert result.passed, result.message
            assert result.variables["out"]["echoed"] == "salut"
        finally:
            sys.path.remove(str(destination / "src"))
            sys.modules.pop("echo", None)
            sys.modules.pop("echo.library", None)


class TestCliBuildActivity:
    def test_cli_generates_project(self, tmp_path: Path, capsys: pytest.CaptureFixture):
        from rpaforge.cli import main

        diagram_path = tmp_path / "sub.process"
        diagram_path.write_text(json.dumps(_sub_diagram()), encoding="utf-8")
        out_dir = tmp_path / "dist"
        rc = main(
            [
                "build-activity",
                "--diagram",
                str(diagram_path),
                "--name",
                "Cli Pkg",
                "--activity",
                "Run Cli",
                "--input",
                "greeting:string=hello",
                "--output",
                "ts",
                "--out",
                str(out_dir),
            ]
        )
        assert rc == 0
        assert (out_dir / "cli_pkg/src/cli_pkg/library.py").is_file()
        assert "Activity project written to" in capsys.readouterr().out

    def test_cli_rejects_bad_input_spec(self, tmp_path: Path):
        from rpaforge.cli import main

        diagram_path = tmp_path / "sub.process"
        diagram_path.write_text(json.dumps(_sub_diagram()), encoding="utf-8")
        rc = main(
            [
                "build-activity",
                "--diagram",
                str(diagram_path),
                "--name",
                "X",
                "--activity",
                "Run",
                "--input",
                "greeting",
                "--out",
                str(tmp_path / "o"),
            ]
        )
        assert rc == 1
