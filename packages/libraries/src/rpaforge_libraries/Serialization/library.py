"""RPAForge Serialization Library - JSON, XML, CSV and archive operations.

Pure stdlib: ``json``, ``xml.etree.ElementTree``, ``csv``, ``zipfile``.
Archive extraction is hardenened against path traversal (issue #821):
absolute member paths, ``..`` segments (including backslash variants) and
drive-letter targets are rejected before anything touches the disk.
"""

from __future__ import annotations

import csv
import json
import logging
import zipfile
from pathlib import Path, PurePosixPath
from typing import Any
from xml.etree import ElementTree

from rpaforge.core.activity import activity, library, output, param, tags
from rpaforge_libraries.i18n import _

logger = logging.getLogger("rpaforge.serialization")


class SerializationError(Exception):
    """Raised for malformed documents and unsafe archive members."""


def _load_json_file(path: str | Path) -> Any:
    file_path = Path(path)
    if not file_path.is_file():
        raise SerializationError(_("JSON file not found: {path}", path=str(file_path)))
    try:
        return json.loads(file_path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError) as exc:
        raise SerializationError(
            _(
                "Failed to read JSON file {path}: {error}",
                path=str(file_path),
                error=str(exc),
            )
        ) from exc


def _json_path_get(data: Any, dotted_path: str) -> Any:
    """Walk a dot path ('a.b.0.c') through dicts and lists."""
    current = data
    for segment in dotted_path.split("."):
        if isinstance(current, dict):
            if segment not in current:
                raise KeyError(segment)
            current = current[segment]
        elif isinstance(current, list):
            index = int(segment)
            current = current[index]
        else:
            raise KeyError(segment)
    return current


def _json_path_set(data: Any, dotted_path: str, value: Any) -> Any:
    """Return a copy of ``data`` with ``dotted_path`` set to ``value``.

    Missing intermediate dict keys are created; list indices must exist.
    """
    segments = dotted_path.split(".")
    if isinstance(data, dict):
        result: dict[str, Any] = json.loads(json.dumps(data))  # deep copy
    elif isinstance(data, list):
        result = json.loads(json.dumps(data))
    else:
        result = {}

    node: Any = result
    for segment in segments[:-1]:
        if isinstance(node, dict):
            node = node.setdefault(segment, {})
        elif isinstance(node, list):
            node = node[int(segment)]
        else:
            raise SerializationError(
                _(
                    "Cannot descend into scalar at '{segment}' for path '{path}'",
                    segment=segment,
                    path=dotted_path,
                )
            )
    last = segments[-1]
    if isinstance(node, dict):
        node[last] = value
    elif isinstance(node, list):
        node[int(last)] = value
    else:
        raise SerializationError(
            _("Cannot set value on a scalar for path '{path}'", path=dotted_path)
        )
    return result


def _element_to_dict(element: ElementTree.Element) -> Any:
    """Convert an XML element following the ``@attr`` / ``#text`` convention."""
    result: dict[str, Any] = {f"@{key}": value for key, value in element.attrib.items()}
    children = list(element)
    if not children:
        text = (element.text or "").strip()
        if not result:
            return text
        if text:
            result["#text"] = text
        return result
    for child in children:
        converted = _element_to_dict(child)
        if child.tag in result:
            existing = result[child.tag]
            if isinstance(existing, list):
                existing.append(converted)
            else:
                result[child.tag] = [existing, converted]
        else:
            result[child.tag] = converted
    return result


def _dict_to_element(tag: str, data: Any) -> ElementTree.Element:
    """Inverse of :func:`_element_to_dict` (``@attr``, ``#text``, lists)."""
    element = ElementTree.Element(tag)
    if not isinstance(data, dict):
        element.text = "" if data is None else str(data)
        return element
    for key, value in data.items():
        if key.startswith("@"):
            element.set(key[1:], str(value))
        elif key == "#text":
            element.text = str(value)
        elif isinstance(value, list):
            for item in value:
                element.append(_dict_to_element(key, item))
        else:
            element.append(_dict_to_element(key, value))
    return element


def _validate_zip_member(member_name: str) -> str | None:
    """Normalize an archive member path; ``None`` marks it unsafe.

    Rejects absolute paths, ``..`` segments (also backslash variants),
    drive-letter targets and Windows reserved separators before extraction.
    """
    normalized = member_name.replace("\\", "/")
    pure = PurePosixPath(normalized)
    if pure.is_absolute() or member_name.startswith(("/", "\\")):
        return None
    if len(normalized) > 1 and normalized[1] == ":":
        return None
    parts = [part for part in pure.parts if part not in ("/", "")]
    if any(part == ".." for part in parts):
        return None
    if not parts:
        return None  # bare directory entry
    return "/".join(parts)


@library(name="Serialization", category="Data", icon="🔁")
class Serialization:
    """JSON, XML, CSV and ZIP helpers for structured data plumbing."""

    @activity(name="Read JSON", category="Serialization")
    @tags("json", "read", "parse", "file")
    @output("Parsed JSON content (dict, list or scalar)")
    @param("path", type="string", description="Path to the JSON file.")
    def read_json(self, path: str) -> Any:
        """Read and parse a JSON file."""
        data = _load_json_file(path)
        logger.info(_("Read JSON file {path}", path=str(path)))
        return data

    @activity(name="Write JSON", category="Serialization")
    @tags("json", "write", "file")
    @output("The written file path")
    @param("path", type="string", description="Destination JSON file path.")
    @param("data", type="dict", description="Serializable value to write.")
    @param("indent", type="integer", description="Indent width; 0 writes compact JSON.")
    def write_json(self, path: str, data: dict | list, indent: int = 2) -> str:
        """Serialize ``data`` to a JSON file (UTF-8)."""
        destination = Path(path)
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_text(
            json.dumps(data, ensure_ascii=False, indent=indent or None) + "\n",
            encoding="utf-8",
        )
        logger.info(_("Wrote JSON file {path}", path=str(destination)))
        return str(destination)

    @activity(name="Get JSON Value", category="Serialization")
    @tags("json", "path", "query")
    @output("The value at the path")
    @param("data", type="dict", description="JSON data to query.")
    @param("path", type="string", description="Dot path, e.g. 'users.0.email'.")
    @param(
        "default", type="string", description="Fallback value when the path is missing."
    )
    def get_json_value(self, data: dict | list, path: str, default: Any = None) -> Any:
        """Read one value from JSON data by a dot path."""
        try:
            return _json_path_get(data, path)
        except (KeyError, ValueError, IndexError, TypeError):
            return default

    @activity(name="Set JSON Value", category="Serialization")
    @tags("json", "path", "mutate")
    @output("A copy of the data with the value set")
    @param("data", type="dict", description="JSON data to modify.")
    @param("path", type="string", description="Dot path, e.g. 'users.0.email'.")
    @param("value", type="string", description="Value to assign at the path.")
    def set_json_value(self, data: dict | list, path: str, value: Any) -> Any:
        """Return a copy of ``data`` with ``path`` assigned to ``value``.

        The input is never mutated; intermediate dict keys are created on
        demand, list indices must already exist.
        """
        try:
            return _json_path_set(data, path, value)
        except (IndexError, ValueError) as exc:
            raise SerializationError(
                _(
                    "Failed to set JSON path '{path}': {error}",
                    path=path,
                    error=str(exc),
                )
            ) from exc

    @activity(name="XML to Dict", category="Serialization")
    @tags("xml", "parse", "file")
    @output("Dictionary representation of the XML document")
    @param("path", type="string", description="Path to the XML file.")
    def xml_to_dict(self, path: str) -> dict[str, Any]:
        """Parse an XML file into a dict (attributes as ``@name``, text as ``#text``)."""
        file_path = Path(path)
        if not file_path.is_file():
            raise SerializationError(
                _("XML file not found: {path}", path=str(file_path))
            )
        try:
            root = ElementTree.parse(file_path).getroot()
        except ElementTree.ParseError as exc:
            raise SerializationError(
                _("Invalid XML in {path}: {error}", path=str(file_path), error=str(exc))
            ) from exc
        result = {root.tag: _element_to_dict(root)}
        logger.info(_("Parsed XML file {path}", path=str(file_path)))
        return result

    @activity(name="Dict to XML", category="Serialization")
    @tags("xml", "write", "file")
    @output("The written file path")
    @param("data", type="dict", description="Document dict ({'root': {...}}).")
    @param("path", type="string", description="Destination XML file path.")
    def dict_to_xml(self, data: dict, path: str) -> str:
        """Serialize a dict back to XML using the ``@attr`` / ``#text`` convention."""
        if len(data) != 1:
            raise SerializationError(
                _(
                    "Dict to XML expects exactly one root key, got {count}",
                    count=len(data),
                )
            )
        tag, payload = next(iter(data.items()))
        root = _dict_to_element(tag, payload)
        destination = Path(path)
        destination.parent.mkdir(parents=True, exist_ok=True)
        ElementTree.ElementTree(root).write(
            destination, encoding="utf-8", xml_declaration=True
        )
        logger.info(_("Wrote XML file {path}", path=str(destination)))
        return str(destination)

    @activity(name="Write CSV", category="Serialization")
    @tags("csv", "write", "file", "rows")
    @output("The written file path")
    @param("path", type="string", description="Destination CSV file path.")
    @param("rows", type="list", description="Rows as a list of dicts (uniform keys).")
    @param("delimiter", type="string", description="Field delimiter character.")
    @param(
        "include_headers",
        type="boolean",
        description="Write a header row from the first row's keys.",
    )
    def write_csv(
        self,
        path: str,
        rows: list[dict],
        delimiter: str = ",",
        include_headers: bool = True,
    ) -> str:
        """Write a list of dicts as CSV (UTF-8)."""
        if not rows:
            raise SerializationError(_("Write CSV requires at least one row"))
        fieldnames = list(rows[0].keys())
        destination = Path(path)
        destination.parent.mkdir(parents=True, exist_ok=True)
        with destination.open("w", encoding="utf-8", newline="") as handle:
            writer = csv.DictWriter(
                handle,
                fieldnames=fieldnames,
                delimiter=delimiter or ",",
            )
            if include_headers:
                writer.writeheader()
            writer.writerows(rows)
        logger.info(
            _(
                "Wrote CSV file {path} ({rows} rows)",
                path=str(destination),
                rows=len(rows),
            )
        )
        return str(destination)

    @activity(name="Zip Files", category="Serialization")
    @tags("zip", "archive", "compress")
    @output("The created archive path")
    @param("paths", type="list", description="File paths to archive.")
    @param("archive_path", type="string", description="Destination .zip path.")
    def zip_files(self, paths: list[str], archive_path: str) -> str:
        """Archive the given files into a ZIP archive."""
        destination = Path(archive_path)
        destination.parent.mkdir(parents=True, exist_ok=True)
        archived = 0
        with zipfile.ZipFile(
            destination, "w", compression=zipfile.ZIP_DEFLATED
        ) as archive:
            for raw in paths:
                file_path = Path(raw)
                if not file_path.is_file():
                    raise SerializationError(
                        _("File to archive not found: {path}", path=str(file_path))
                    )
                archive.write(file_path, arcname=file_path.name)
                archived += 1
        logger.info(
            _(
                "Archived {count} files into {path}",
                count=archived,
                path=str(destination),
            )
        )
        return str(destination)

    @activity(name="Unzip Archive", category="Serialization")
    @tags("zip", "extract", "archive", "security")
    @output("The extraction directory path")
    @param("archive_path", type="string", description="Source .zip path.")
    @param(
        "dest_dir",
        type="string",
        description="Directory to extract into (created if missing).",
    )
    def unzip_archive(self, archive_path: str, dest_dir: str) -> str:
        """Extract a ZIP archive with path-traversal protection.

        Members with absolute paths, ``..`` segments (including ``..\\``
        variants) or drive-letter targets are rejected before extraction.
        """
        source = Path(archive_path)
        if not source.is_file():
            raise SerializationError(_("Archive not found: {path}", path=str(source)))
        destination_root = Path(dest_dir).resolve()
        destination_root.mkdir(parents=True, exist_ok=True)

        with zipfile.ZipFile(source, "r") as archive:
            for member in archive.infolist():
                normalized = _validate_zip_member(member.filename)
                if normalized is None:
                    raise SerializationError(
                        _(
                            "Archive {archive} contains an unsafe member path: {member}",
                            archive=str(source.name),
                            member=member.filename,
                        )
                    )
                target = (destination_root / normalized).resolve()
                if not target.is_relative_to(destination_root):
                    raise SerializationError(
                        _(
                            "Archive {archive} member '{member}' escapes the destination directory",
                            archive=str(source.name),
                            member=member.filename,
                        )
                    )
            archive.extractall(destination_root)

        logger.info(
            _(
                "Extracted archive {path} to {dest}",
                path=str(source),
                dest=str(destination_root),
            )
        )
        return str(destination_root)
