"""Tests for .forge project packaging, verification, and runner execution."""

from __future__ import annotations

import json
import zipfile
from pathlib import Path

import pytest

from rpaforge.cli.run import RunExitCode, RunValidationError
from rpaforge.packaging import (
    ForgePackageBuilder,
    load_forge_package,
    verify_package,
)
from rpaforge.runner.cli import main as runner_main


@pytest.fixture
def sample_project_dir(tmp_path: Path) -> Path:
    proj = tmp_path / "my_project"
    proj.mkdir()
    diagrams = proj / "diagrams"
    diagrams.mkdir()
    assets = proj / "assets"
    assets.mkdir()

    # Create valid main diagram
    main_doc = {
        "version": "1.1.0",
        "metadata": {"id": "main_process", "name": "Main Process"},
        "nodes": [
            {
                "id": "start",
                "type": "start",
                "label": "Start",
                "position": {"x": 0, "y": 0},
                "data": {"blockData": {"type": "start", "processName": "Main Process"}},
            }
        ],
        "edges": [],
        "variables": [
            {
                "name": "greeting",
                "type": "string",
                "default": "Hello from Forge Package!",
            }
        ],
    }
    (diagrams / "main.json").write_text(json.dumps(main_doc), encoding="utf-8")

    # Create asset
    (assets / "config.txt").write_text("env=production", encoding="utf-8")

    # Create project manifest
    manifest_doc = {
        "project": {
            "name": "My Sample Project",
            "version": "1.2.0",
            "author": "RPA Developer",
        },
        "diagrams": [
            {"id": "main_process", "name": "Main Process", "path": "diagrams/main.json"}
        ],
        "variables": {"main_process": [{"name": "greeting", "type": "string"}]},
    }
    (proj / "project.rpaforge").write_text(json.dumps(manifest_doc), encoding="utf-8")

    return proj


def test_package_builder_and_verification(sample_project_dir: Path, tmp_path: Path):
    output_forge = tmp_path / "dist" / "my_process.forge"
    builder = ForgePackageBuilder()
    pkg_path = builder.build_from_directory(sample_project_dir, output_forge)

    assert pkg_path.is_file()
    assert zipfile.is_zipfile(pkg_path)

    # Verify package passes verification
    is_valid, error = verify_package(pkg_path)
    assert is_valid is True
    assert error is None

    # Load and inspect diagram
    loaded = load_forge_package(pkg_path)
    assert loaded.document["metadata"]["name"] == "Main Process"
    assert loaded.source == pkg_path


def test_package_tamper_detection(sample_project_dir: Path, tmp_path: Path):
    output_forge = tmp_path / "tampered.forge"
    builder = ForgePackageBuilder()
    pkg_path = builder.build_from_directory(sample_project_dir, output_forge)

    # Tamper with archive by modifying a diagram inside
    with zipfile.ZipFile(pkg_path, "r") as z_in:
        items = {name: z_in.read(name) for name in z_in.namelist()}

    # Modify main.json content without updating checksums
    items["diagrams/main.json"] = items["diagrams/main.json"] + b" // tampered"

    with zipfile.ZipFile(pkg_path, "w") as z_out:
        for name, data in items.items():
            z_out.writestr(name, data)

    # Verification must fail
    is_valid, error = verify_package(pkg_path)
    assert is_valid is False
    assert "Integrity check failed" in error

    # Loading tampered package must raise RunValidationError
    with pytest.raises(RunValidationError):
        load_forge_package(pkg_path)


def test_runner_cli_pack_and_run(sample_project_dir: Path, tmp_path: Path, capsys):
    output_forge = tmp_path / "runner_test.forge"

    # Pack via rpaforge-runner CLI
    pack_exit = runner_main(
        ["pack", str(sample_project_dir), "-o", str(output_forge), "--json"]
    )
    assert pack_exit == 0
    assert output_forge.is_file()

    # Run packed .forge via rpaforge-runner
    run_exit = runner_main(["run", str(output_forge), "--json"])
    assert run_exit == RunExitCode.SUCCESS

    captured = capsys.readouterr()
    result = json.loads(captured.out.strip().splitlines()[-1])
    assert result["status"] in ("SUCCESS", "pass")
