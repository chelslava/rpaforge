"""Tests for the RPAForge scaffolding CLI."""

from __future__ import annotations

import subprocess
import sys

from rpaforge.cli import create_library, main


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
            sys.executable,
            "-m",
            "pip",
            "install",
            "-e",
            ".",
            "--no-deps",
            "--no-build-isolation",
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
