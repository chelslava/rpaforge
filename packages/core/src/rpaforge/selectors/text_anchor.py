"""Spatial and text anchoring algorithms for Smart Selectors."""

from __future__ import annotations

import math
from typing import Any

from rpaforge.selectors.models import AnchorDirection, BoundingBox


def calculate_anchor_score(
    anchor_box: BoundingBox,
    candidate_box: BoundingBox,
    direction: AnchorDirection | str = AnchorDirection.RIGHT,
    max_distance: float = 500.0,
) -> float:
    """Calculate directional suitability score between an anchor and candidate box.

    Returns a score between 0.0 and 1.0 (higher is better).
    """
    dir_enum = (
        direction
        if isinstance(direction, AnchorDirection)
        else AnchorDirection(str(direction).lower())
    )

    dx = candidate_box.center_x - anchor_box.center_x
    dy = candidate_box.center_y - anchor_box.center_y
    euclidean_dist = math.hypot(dx, dy)

    if euclidean_dist > max_distance or euclidean_dist == 0:
        if dir_enum == AnchorDirection.EXACT and euclidean_dist == 0:
            return 1.0
        if euclidean_dist > max_distance:
            return 0.0

    # Distance factor (closer is better)
    dist_factor = max(0.0, 1.0 - (euclidean_dist / max_distance))

    if dir_enum == AnchorDirection.EXACT:
        # Overlapping or identical bounds
        overlap_x = max(
            0.0,
            min(anchor_box.right, candidate_box.right)
            - max(anchor_box.left, candidate_box.left),
        )
        overlap_y = max(
            0.0,
            min(anchor_box.bottom, candidate_box.bottom)
            - max(anchor_box.top, candidate_box.top),
        )
        overlap_area = overlap_x * overlap_y
        min_area = min(
            anchor_box.width * anchor_box.height,
            candidate_box.width * candidate_box.height,
        )
        return (overlap_area / min_area) if min_area > 0 else dist_factor

    if dir_enum == AnchorDirection.RIGHT:
        # Candidate is to the right of anchor (dx > 0) and vertically aligned (|dy| small)
        if candidate_box.left < anchor_box.left:
            return 0.0  # Behind anchor
        vertical_overlap = max(
            0.0,
            min(anchor_box.bottom, candidate_box.bottom)
            - max(anchor_box.top, candidate_box.top),
        )
        vertical_alignment = (
            vertical_overlap / min(anchor_box.height, candidate_box.height)
            if min(anchor_box.height, candidate_box.height) > 0
            else 0.0
        )
        return 0.6 * dist_factor + 0.4 * vertical_alignment

    if dir_enum == AnchorDirection.BELOW:
        # Candidate is below anchor (dy > 0) and horizontally aligned (|dx| small)
        if candidate_box.top < anchor_box.top:
            return 0.0  # Above anchor
        horizontal_overlap = max(
            0.0,
            min(anchor_box.right, candidate_box.right)
            - max(anchor_box.left, candidate_box.left),
        )
        horizontal_alignment = (
            horizontal_overlap / min(anchor_box.width, candidate_box.width)
            if min(anchor_box.width, candidate_box.width) > 0
            else 0.0
        )
        return 0.6 * dist_factor + 0.4 * horizontal_alignment

    if dir_enum == AnchorDirection.LEFT:
        if candidate_box.right > anchor_box.right:
            return 0.0
        return dist_factor

    if dir_enum == AnchorDirection.ABOVE:
        if candidate_box.bottom > anchor_box.bottom:
            return 0.0
        return dist_factor

    if dir_enum == AnchorDirection.NEAR:
        return dist_factor

    return dist_factor


def find_best_relative_candidate(
    anchor_box: BoundingBox,
    candidates: list[dict[str, Any]],
    direction: AnchorDirection | str = AnchorDirection.RIGHT,
    target_type: str | None = None,
    min_score: float = 0.3,
) -> tuple[dict[str, Any] | None, float]:
    """Find the best matching candidate element relative to an anchor bounding box.

    Each candidate in `candidates` should have a "rect" (or "bounding_box") and optional "tag"/"control_type".
    Returns (best_candidate, score).
    """
    best_candidate: dict[str, Any] | None = None
    best_score = 0.0

    for cand in candidates:
        rect = cand.get("rect") or cand.get("bounding_box")
        if not rect:
            continue

        if isinstance(rect, dict):
            cand_box = BoundingBox(
                x=float(rect.get("x", rect.get("left", 0))),
                y=float(rect.get("y", rect.get("top", 0))),
                width=float(rect.get("width", 0)),
                height=float(rect.get("height", 0)),
            )
        elif isinstance(rect, BoundingBox):
            cand_box = rect
        else:
            continue

        if cand_box.width <= 0 or cand_box.height <= 0:
            continue

        # Optional target type filtering (e.g. "input", "edit", "button")
        if target_type and target_type != "any":
            tag = (
                cand.get("tag") or cand.get("control_type") or cand.get("type") or ""
            ).lower()
            if target_type.lower() not in tag:
                continue

        score = calculate_anchor_score(
            anchor_box=anchor_box, candidate_box=cand_box, direction=direction
        )
        if score > best_score and score >= min_score:
            best_score = score
            best_candidate = cand

    return best_candidate, best_score
