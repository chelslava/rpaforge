"""Builder for creating and validating .forge distribution packages."""

from __future__ import annotations

import hashlib
import json
import zipfile
from pathlib import Path
from typing import Any

from rpaforge.core.validator import ProcessValidator
from rpaforge.packaging.models import ForgePackageManifest


class ForgePackageValidationError(ValueError):
    """Raised when pre-flight validation fails during packaging."""


def _compute_sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


class ForgePackageBuilder:
    """Creates standardized .forge package archives from project directories or memory."""

    def __init__(self, validate_diagrams: bool = True) -> None:
        self._validate_diagrams = validate_diagrams

    def build_from_directory(
        self,
        project_dir: Path | str,
        output_path: Path | str,
        manifest_overrides: dict[str, Any] | None = None,
    ) -> Path:
        """Bundle a project folder into a .forge package archive."""
        root = Path(project_dir).resolve()
        if not root.is_dir():
            raise FileNotFoundError(f"Project directory does not exist: {root}")

        out = Path(output_path).resolve()
        out.parent.mkdir(parents=True, exist_ok=True)

        manifest_files = list(root.glob("*.rpaforge"))
        project_manifest: dict[str, Any] = {}
        if manifest_files:
            try:
                project_manifest = json.loads(
                    manifest_files[0].read_text(encoding="utf-8")
                )
            except Exception as e:
                raise ForgePackageValidationError(
                    f"Invalid project manifest: {e}"
                ) from e

        project_info = project_manifest.get("project", {})
        pkg_name = project_info.get("name", root.name)
        pkg_version = project_info.get("version", "1.0.0")

        # Collect diagrams and assets
        diagram_entries: dict[str, bytes] = {}
        asset_entries: dict[str, bytes] = {}
        variables_data: dict[str, Any] = project_manifest.get("variables", {})

        # Find diagrams
        diagrams_dir = root / "diagrams"
        if diagrams_dir.is_dir():
            for d_file in diagrams_dir.glob("*.json"):
                rel_name = f"diagrams/{d_file.name}"
                data = d_file.read_bytes()
                if self._validate_diagrams:
                    self._validate_diagram_content(data, str(d_file))
                diagram_entries[rel_name] = data
        else:
            # Check for standalone process files in root
            for p_file in root.glob("*.json"):
                if p_file.name not in ("package.json", "manifest.json"):
                    rel_name = f"diagrams/{p_file.name}"
                    data = p_file.read_bytes()
                    if self._validate_diagrams:
                        self._validate_diagram_content(data, str(p_file))
                    diagram_entries[rel_name] = data

        if not diagram_entries:
            raise ForgePackageValidationError("Project contains no diagrams to package")

        # Find assets
        assets_dir = root / "assets"
        if assets_dir.is_dir():
            for a_file in assets_dir.rglob("*"):
                if a_file.is_file():
                    rel_name = f"assets/{a_file.relative_to(assets_dir).as_posix()}"
                    asset_entries[rel_name] = a_file.read_bytes()

        # Determine entry diagram
        entry_diagram = "diagrams/main.json"
        if entry_diagram not in diagram_entries:
            entry_diagram = next(iter(diagram_entries.keys()))

        manifest = ForgePackageManifest(
            name=pkg_name,
            version=pkg_version,
            entry_diagram=entry_diagram,
            author=project_info.get("author", ""),
            description=project_info.get("description", ""),
            dependencies=project_info.get("dependencies", {}),
        )

        if manifest_overrides:
            for k, v in manifest_overrides.items():
                if hasattr(manifest, k):
                    setattr(manifest, k, v)

        return self.build_from_contents(
            output_path=out,
            manifest=manifest,
            diagrams=diagram_entries,
            assets=asset_entries,
            variables=variables_data,
        )

    def _normalize_diagram(self, doc: dict[str, Any]) -> dict[str, Any]:
        normalized = dict(doc)
        nodes = []
        for n in normalized.get("nodes", []):
            node = dict(n)
            if "data" not in node or not isinstance(node["data"], dict):
                node["data"] = {"blockData": {"type": node.get("type", "activity")}}
            elif "blockData" not in node["data"] or not isinstance(
                node["data"]["blockData"], dict
            ):
                node["data"]["blockData"] = {"type": node.get("type", "activity")}
            nodes.append(node)
        normalized["nodes"] = nodes
        return normalized

    def _validate_diagram_content(self, data: bytes, source_name: str) -> None:
        try:
            doc = json.loads(data.decode("utf-8"))
            if isinstance(doc.get("diagram"), dict):
                doc = doc["diagram"]
            doc = self._normalize_diagram(doc)
            validator = ProcessValidator()
            result = validator.validate_diagram(doc)
            if not result.is_valid:
                errors = "; ".join(
                    str(e.message if hasattr(e, "message") else e)
                    for e in result.errors
                )
                raise ForgePackageValidationError(
                    f"Diagram pre-flight validation failed for '{source_name}': {errors}"
                )
        except json.JSONDecodeError as e:
            raise ForgePackageValidationError(
                f"Diagram '{source_name}' is not valid JSON: {e}"
            ) from e

    def build_from_contents(
        self,
        output_path: Path | str,
        manifest: ForgePackageManifest,
        diagrams: dict[str, bytes],
        assets: dict[str, bytes] | None = None,
        variables: dict[str, Any] | None = None,
    ) -> Path:
        """Create package archive from memory content."""
        out = Path(output_path).resolve()
        out.parent.mkdir(parents=True, exist_ok=True)
        assets = assets or {}
        variables = variables or {}

        # Compute checksums for all files
        file_checksums: dict[str, str] = {}
        for path, content in diagrams.items():
            file_checksums[path] = _compute_sha256(content)
        for path, content in assets.items():
            file_checksums[path] = _compute_sha256(content)

        variables_bytes = json.dumps(variables, indent=2).encode("utf-8")
        file_checksums["variables.json"] = _compute_sha256(variables_bytes)

        manifest.file_checksums = file_checksums
        manifest_bytes = json.dumps(manifest.to_dict(), indent=2).encode("utf-8")

        # Root package checksum over sorted file checksums
        combined_hashes = "\n".join(
            f"{k}:{v}" for k, v in sorted(file_checksums.items())
        )
        package_checksum = _compute_sha256(
            manifest_bytes + b"\n" + combined_hashes.encode("utf-8")
        )

        with zipfile.ZipFile(out, "w", compression=zipfile.ZIP_DEFLATED) as zf:
            zf.writestr("manifest.json", manifest_bytes)
            zf.writestr("variables.json", variables_bytes)
            zf.writestr("checksum.sha256", package_checksum)
            for path, content in diagrams.items():
                zf.writestr(path, content)
            for path, content in assets.items():
                zf.writestr(path, content)

        return out
