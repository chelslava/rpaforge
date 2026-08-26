"""VLM grounding selector strategy (issue #743).

Last-resort strategy in the SmartSelectorEngine chain: captures a
screenshot, asks a vision-language model for the bounding box of the
element matching a natural-language description and returns actionable
coordinates.

Skips cleanly (``has_vision_configured() -> False``) when no
vision-capable model is configured so the strategy chain simply
continues without surfacing LLM errors.
"""

from __future__ import annotations

import contextlib
import json
import logging
import time
from collections.abc import Callable
from typing import Any

logger = logging.getLogger("rpaforge.selectors.vlm")

_VLM_SYSTEM_PROMPT = (
    "You locate UI elements in screenshots. Respond with ONLY a JSON "
    'object: {"bbox": [x, y, width, height], "confidence": 0..1} where '
    "bbox is the pixel region of the element matching the user's "
    "description. No markdown fences, no commentary."
)

__all__ = ["has_vision_configured", "make_vlm_resolver"]


def _build_vision_client() -> tuple[Any, str]:
    """Build the multimodal client (module-level test seam)."""
    from rpaforge.llm import create_client, resolve_llm_config, resolve_vision_model

    config = resolve_llm_config()
    model = resolve_vision_model(config.vision_model or config.model or None)
    return create_client(config), model


def has_vision_configured() -> bool:
    """Probe whether a vision-capable provider+model are configured."""
    try:
        _, model = _build_vision_client()
    except Exception:  # noqa: BLE001 - unconfigured provider is an expected skip
        return False
    return bool(model)


def make_vlm_resolver(
    description: str,
    screenshot_fn: Callable[[], bytes],
    client_factory: Callable[[], tuple[Any, str]] | None = None,
    viewport_size: tuple[int, int] | None = None,
) -> Callable[[Any], dict[str, Any]]:
    """Build a SmartSelectorEngine resolver callable for VLM grounding.

    The returned callable follows the engine contract: return a truthy
    result on success or raise - any exception makes the engine continue
    with remaining strategies.
    """
    factory = client_factory or _build_vision_client

    def resolve(strategy: Any) -> dict[str, Any]:
        started = time.monotonic()
        client, model = factory()
        image_bytes = screenshot_fn()
        result = client.chat(
            [
                {"role": "system", "content": _VLM_SYSTEM_PROMPT},
                {
                    "role": "user",
                    "content": f"Locate this element: {description or strategy.label or ''}",
                },
            ],
            model=model,
            images=[image_bytes],
            json_mode=True,
        )
        parsed = json.loads(result.text.strip())
        raw_bbox = parsed.get("bbox") if isinstance(parsed, dict) else None
        if not isinstance(raw_bbox, list):
            raise ValueError(
                "No element matching the description was located "
                f"(vision model returned bbox={raw_bbox!r})."
            )
        bbox = [float(v) for v in raw_bbox]
        confidence = float(parsed.get("confidence", 0.5))
        if len(bbox) != 4 or not all(v >= 0 for v in bbox):
            raise ValueError(f"Invalid bbox from VLM: {bbox}")
        if viewport_size is not None:
            bbox[0] = min(bbox[0], viewport_size[0])
            bbox[1] = min(bbox[1], viewport_size[1])
            bbox[2] = min(bbox[2], viewport_size[0] - bbox[0])
            bbox[3] = min(bbox[3], viewport_size[1] - bbox[1])
        if confidence < 0 or confidence > 1:
            raise ValueError(f"Confidence out of range: {confidence}")

        # Plumb model confidence into engine telemetry via strategy weight;
        # record discovered locator + latency on the strategy object.
        with contextlib.suppress(AttributeError):
            strategy.weight = confidence
            x, y, w, h = (int(round(v)) for v in bbox)
            strategy.selector = f"bbox={x},{y},{w},{h}"
        elapsed = time.monotonic() - started
        logger.debug(
            "VLM grounding '%s': bbox=%s conf=%.2f in %.0fms",
            description,
            bbox,
            confidence,
            elapsed * 1000,
        )
        return {"bbox": bbox, "confidence": confidence}

    return resolve
