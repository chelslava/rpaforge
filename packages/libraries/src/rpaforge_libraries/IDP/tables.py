"""Table & line-item extraction over IDP documents (issue #740).

``extract_tables`` recovers tabular regions from document pages:

- ``strategy="alignment"`` (default): column-position clustering over OCR
  word boxes (``words`` entries produced by the hybrid OCR pipeline),
  producing rows plus per-cell confidence and low-confidence flags.
- ``strategy="whitespace"``: fallback for plain-text pages without
  coordinates - splits lines on runs of 2+ spaces.

``table_to_records`` converts one extracted table into a list of dicts
keyed by header names - ready for DataFrames/Excel consumers.
"""

from __future__ import annotations

import re
from statistics import median
from typing import Any

__all__ = ["extract_tables", "table_to_records"]

#: Minimum columns for a line group to count as part of a table region.
_MIN_TABLE_COLUMNS = 2

#: Relative tolerance when clustering word x-starts into column anchors.
_X_TOLERANCE_FACTOR = 0.6

#: Relative y-tolerance grouping words into one visual line.
_Y_TOLERANCE_FACTOR = 0.6


def _word_conf(word: dict[str, Any]) -> float:
    conf = word.get("conf", -1.0)
    try:
        value = float(conf)
    except (TypeError, ValueError):
        return 0.0
    return max(value, 0.0) / 100.0


def _cluster_x_anchors(xs: list[float]) -> list[float]:
    """Greedily cluster sorted x-starts into ascending column anchors."""
    if not xs:
        return []
    widths = sorted(xs)
    anchors: list[float] = [widths[0]]
    tolerance = max(12.0, _X_TOLERANCE_FACTOR * _median_gap(widths))
    for value in widths[1:]:
        if value - anchors[-1] > tolerance:
            anchors.append(value)
    return anchors


def _median_gap(sorted_values: list[float]) -> float:
    gaps = [b - a for a, b in zip(sorted_values, sorted_values[1:], strict=False)]
    return median(gaps) if gaps else 20.0


def _group_lines(words: list[dict[str, Any]]) -> list[list[dict[str, Any]]]:
    """Group words into visual lines by y proximity."""
    if not words:
        return []
    heights = [word.get("h", 10.0) or 10.0 for word in words]
    y_tolerance = max(4.0, _Y_TOLERANCE_FACTOR * median(heights))
    ordered = sorted(words, key=lambda w: (w.get("y", 0.0), w.get("x", 0.0)))
    lines: list[list[dict[str, Any]]] = [[ordered[0]]]
    line_y: float = ordered[0].get("y", 0.0)
    for word in ordered[1:]:
        y = word.get("y", 0.0)
        if abs(y - line_y) <= y_tolerance:
            lines[-1].append(word)
            line_y = min(line_y, y)
        else:
            lines.append([word])
            line_y = y
    for line in lines:
        line.sort(key=lambda w: w.get("x", 0.0))
    return lines


def _assign_to_anchor(x: float, anchors: list[float], tolerance: float) -> int | None:
    """Return nearest anchor index within tolerance, else None."""
    best_index: int | None = None
    best_distance = tolerance
    for index, anchor in enumerate(anchors):
        distance = abs(x - anchor)
        if distance <= best_distance:
            best_index = index
            best_distance = distance
    return best_index


def _extract_alignment_page(
    words: list[dict[str, Any]], page_number: Any
) -> list[dict[str, Any]]:
    """Column-alignment extraction over one page's OCR word boxes."""
    lines = _group_lines(words)
    all_xs = sorted(word.get("x", 0.0) for word in words)
    anchors = _cluster_x_anchors(all_xs)
    if len(anchors) < _MIN_TABLE_COLUMNS:
        return []

    anchor_tolerance = max(12.0, _X_TOLERANCE_FACTOR * _median_gap(all_xs))

    rows: list[dict[str, Any]] = []
    for line in lines:
        cells: list[dict[str, Any] | None] = [None] * len(anchors)
        for word in line:
            index = _assign_to_anchor(word.get("x", 0.0), anchors, anchor_tolerance)
            if index is None:
                # Word starts beyond the last anchor - extend the last column.
                index = len(anchors) - 1 if word.get("x", 0.0) > anchors[-1] else None
            if index is None:
                continue
            cell = cells[index]
            text = str(word.get("text", ""))
            confidence = _word_conf(word)
            if cell is None:
                cells[index] = {"text": text, "confidence": round(confidence, 3)}
            else:
                cell["text"] += f" {text}"
                cell["confidence"] = round(min(cell["confidence"], confidence), 3)
        if any(cell is not None for cell in cells):
            rows.append({"cells": cells})

    table_rows = [
        row for row in rows if sum(1 for c in row["cells"] if c) >= _MIN_TABLE_COLUMNS
    ]
    if len(table_rows) < 2:
        return []  # a real table needs header + at least one data row

    headers = [
        cell["text"] if cell else f"Col{i + 1}"
        for i, cell in enumerate(table_rows[0]["cells"])
    ]
    data_rows = table_rows[1:]

    low_confidence: list[list[int]] = []
    matrix: list[list[Any]] = []
    for row_index, row in enumerate(data_rows):
        conf_row: list[Any] = []
        for col_index, cell in enumerate(row["cells"]):
            if cell is None:
                conf_row.append(None)
                continue
            conf_row.append(cell["confidence"])
            if cell["confidence"] < 0.75:
                low_confidence.append([row_index, col_index])
        matrix.append(conf_row)

    return [
        {
            "page": page_number,
            "strategy": "alignment",
            "headers": headers,
            "rows": [
                [cell["text"] if cell else "" for cell in row["cells"]]
                for row in data_rows
            ],
            "confidence": matrix,
            "low_confidence_cells": low_confidence,
        }
    ]


def _extract_whitespace_page(text: str, page_number: Any) -> list[dict[str, Any]]:
    """Plain-text fallback: split lines on runs of 2+ spaces."""
    lines = [
        re.split(r"\s{2,}", raw.strip())
        for raw in text.splitlines()
        if raw.strip() and re.search(r"\s{2,}", raw)
    ]
    if len(lines) < 2:
        return []
    width = max(len(cells) for cells in lines)
    padded = [cells + [""] * (width - len(cells)) for cells in lines]
    headers = padded[0]
    rows = padded[1:]
    return [
        {
            "page": page_number,
            "strategy": "whitespace",
            "headers": [header or f"Col{i + 1}" for i, header in enumerate(headers)],
            "rows": rows,
            "confidence": None,
            "low_confidence_cells": [],
        }
    ]


def extract_tables(
    document: dict[str, Any], strategy: str = "alignment"
) -> list[dict[str, Any]]:
    """Extract tabular regions from an IDP pipeline document.

    :param document: Document produced by IDP parsers / the OCR pipeline.
    :param strategy: ``"alignment"`` uses per-word coordinates; pages
        without them fall back to ``"whitespace"`` automatically.
    :returns: List of table dicts with headers/rows/confidence.
    """
    tables: list[dict[str, Any]] = []
    for page in document.get("pages", []):
        page_number = page.get("number")
        words = page.get("words")
        if strategy == "alignment" and isinstance(words, list) and words:
            found = _extract_alignment_page(words, page_number)
            if found:
                tables.extend(found)
                continue
        text = page.get("text", "")
        if text:
            tables.extend(_extract_whitespace_page(str(text), page_number))
    return tables


def table_to_records(
    table: dict[str, Any],
    headers: list[str] | None = None,
    include_confidence: bool = False,
) -> list[dict[str, Any]]:
    """Convert one extracted table into DataFrame/Excel-ready dicts.

    :param table: Table dict from :func:`extract_tables`.
    :param headers: Optional override column names.
    :param include_confidence: Add per-cell confidence as
        ``"<column>_confidence"`` keys when the table carries a matrix.
    :returns: List of dicts, empty cells skipped (value kept as ``""``).
    """
    names = list(headers) if headers else list(table.get("headers", []))
    rows = table.get("rows", []) or []
    confidence_matrix = table.get("confidence") or None

    records: list[dict[str, Any]] = []
    for row_index, row in enumerate(rows):
        record: dict[str, Any] = {}
        has_value = False
        for col_index, value in enumerate(row):
            name = names[col_index] if col_index < len(names) else f"Col{col_index + 1}"
            record[name] = value
            if value != "":
                has_value = True
            if include_confidence and confidence_matrix is not None:
                conf_row = (
                    confidence_matrix[row_index]
                    if row_index < len(confidence_matrix)
                    else None
                )
                if conf_row is not None and col_index < len(conf_row):
                    record[f"{name}_confidence"] = conf_row[col_index]
        if has_value:
            records.append(record)
    return records
