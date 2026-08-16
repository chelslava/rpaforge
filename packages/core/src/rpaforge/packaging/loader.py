"""Loader and verifier for .forge distribution packages."""

from __future__ import annotations

import hashlib
import json
import zipfile
from pathlib import Path
from typing import Any

from rpaforge.cli.run import (
    LoadedDiagram,
    RunConfigurationError,
    RunValidationError,
    _document_from_value,
)
from rpaforge.packaging.models import ForgePackageManifest


def _compute_sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def verify_package(package_path: Path | str) -> tuple[bool, str | None]:
    """Verify package integrity, file signatures, and manifest schema."""
    path = Path(package_path).resolve()
    if not path.is_file():
        return False, f"Package file does not exist: {path}"

    if not zipfile.is_zipfile(path):
        return False, f"File is not a valid zip package: {path}"

    try:
        with zipfile.ZipFile(path, "r") as zf:
            namelist = set(zf.namelist())
            if "manifest.json" not in namelist:
                return False, "Package is missing manifest.json"
            if "checksum.sha256" not in namelist:
                return False, "Package is missing checksum.sha256 signature"

            manifest_bytes = zf.read("manifest.json")
            manifest_dict = json.loads(manifest_bytes.decode("utf-8"))
            manifest = ForgePackageManifest.from_dict(manifest_dict)

            stored_checksum = zf.read("checksum.sha256").decode("utf-8").strip()

            # Verify each file against manifest checksums
            for rel_path, expected_hash in manifest.file_checksums.items():
                if rel_path not in namelist:
                    return (
                        False,
                        f"Missing package entry recorded in manifest: '{rel_path}'",
                    )
                file_data = zf.read(rel_path)
                actual_hash = _compute_sha256(file_data)
                if actual_hash != expected_hash:
                    return (
                        False,
                        f"Integrity check failed for '{rel_path}': hash mismatch (tampered file)",
                    )

            # Verify root package checksum
            combined_hashes = "\n".join(
                f"{k}:{v}" for k, v in sorted(manifest.file_checksums.items())
            )
            expected_pkg_checksum = _compute_sha256(
                manifest_bytes + b"\n" + combined_hashes.encode("utf-8")
            )
            if stored_checksum != expected_pkg_checksum:
                return (
                    False,
                    "Root package signature checksum mismatch (tampered manifest or signature)",
                )

            return True, None
    except Exception as e:
        return False, f"Corrupt or unreadable package archive: {e}"


def load_forge_package(
    package_path: Path | str, selector: str | None = None
) -> LoadedDiagram:
    """Safely verify and load an entry diagram and variables from a .forge package."""
    path = Path(package_path).resolve()
    is_valid, error_msg = verify_package(path)
    if not is_valid:
        raise RunValidationError(
            f"Package verification failed for {path.name}: {error_msg}"
        )

    with zipfile.ZipFile(path, "r") as zf:
        manifest_data = json.loads(zf.read("manifest.json").decode("utf-8"))
        manifest = ForgePackageManifest.from_dict(manifest_data)

        # Determine diagram path
        target_diagram = selector or manifest.entry_diagram
        if not target_diagram.startswith("diagrams/") and not target_diagram.endswith(
            ".json"
        ):
            target_diagram = f"diagrams/{target_diagram}.json"
        elif not target_diagram.startswith("diagrams/"):
            target_diagram = f"diagrams/{target_diagram}"

        if target_diagram not in zf.namelist():
            # Try searching by name or exact basename
            candidates = [
                name for name in zf.namelist() if name.startswith("diagrams/")
            ]
            found = next(
                (c for c in candidates if Path(c).stem == selector or c == selector),
                None,
            )
            if found:
                target_diagram = found
            elif manifest.entry_diagram in zf.namelist():
                target_diagram = manifest.entry_diagram
            else:
                raise RunConfigurationError(
                    f"Selected diagram '{selector}' not found in package {path.name}"
                )

        diagram_bytes = zf.read(target_diagram)
        raw_doc = json.loads(diagram_bytes.decode("utf-8"))
        doc = _document_from_value(raw_doc)

        variables: list[dict[str, Any]] = []
        if "variables.json" in zf.namelist():
            try:
                vars_dict = json.loads(zf.read("variables.json").decode("utf-8"))
                if isinstance(vars_dict, list):
                    variables = vars_dict
                elif isinstance(vars_dict, dict):
                    # Could be dictionary of lists or namespace mapping
                    if "variables" in vars_dict and isinstance(
                        vars_dict["variables"], list
                    ):
                        variables = vars_dict["variables"]
                    elif isinstance(doc.get("variables"), list):
                        variables = doc["variables"]
            except Exception:
                pass

        if not variables and isinstance(doc.get("variables"), list):
            variables = doc["variables"]

        return LoadedDiagram(
            document=doc,
            variables=variables,
            source=path,
        )
