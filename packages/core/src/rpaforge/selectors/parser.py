"""Selector parser for RPAForge Smart Selectors."""

from __future__ import annotations

import contextlib
import json
from typing import Any

from rpaforge.selectors.models import (
    AnchorDirection,
    CompositeSelector,
    SelectorStrategy,
    SelectorStrategyType,
)


def parse_selector(
    selector_input: str | dict[str, Any] | CompositeSelector,
) -> CompositeSelector:
    """Parse a string, dict, or CompositeSelector into a standardized CompositeSelector.

    Supports:
    1. Composite JSON string or dictionary:
       `{"strategies": [{"type": "id", "selector": "btn"}, {"type": "text_anchor", "label": "Submit"}]}`
    2. Prefixed single selector:
       `id:submit_button`, `name:Submit`, `css:.btn-primary`, `xpath://button`, `text:Submit Order`
    3. Plain string selector:
       `#login-btn`, `.form-input`
    """
    if isinstance(selector_input, CompositeSelector):
        return selector_input

    if isinstance(selector_input, dict):
        return _dict_to_composite(selector_input)

    raw_str = str(selector_input).strip()

    # Try parsing as JSON object
    if raw_str.startswith("{") and raw_str.endswith("}"):
        with contextlib.suppress(Exception):
            parsed_dict = json.loads(raw_str)
            if isinstance(parsed_dict, dict):
                composite = _dict_to_composite(parsed_dict)
                composite.original_query = raw_str
                return composite

    # Check for prefix like id:, name:, class:, css:, xpath:, uia:, text:, anchor:
    strategies: list[SelectorStrategy] = []

    if (
        ":" in raw_str
        and not raw_str.startswith("//")
        and not raw_str.startswith("http")
    ):
        prefix, value = raw_str.split(":", 1)
        prefix_lower = prefix.lower()

        if prefix_lower in ("id", "auto_id", "automationid"):
            strategies.append(
                SelectorStrategy(
                    type=SelectorStrategyType.ID, selector=value, weight=1.0
                )
            )
            # Automatic fallback to name/text anchor if possible
            if value and not value.startswith("#"):
                strategies.append(
                    SelectorStrategy(
                        type=SelectorStrategyType.TEXT_ANCHOR,
                        label=value.replace("_", " ").title(),
                        direction=AnchorDirection.EXACT,
                        weight=0.75,
                    )
                )
        elif prefix_lower in ("name", "title"):
            strategies.append(
                SelectorStrategy(
                    type=SelectorStrategyType.NAME, selector=value, weight=1.0
                )
            )
            strategies.append(
                SelectorStrategy(
                    type=SelectorStrategyType.TEXT_ANCHOR,
                    label=value,
                    direction=AnchorDirection.EXACT,
                    weight=0.85,
                )
            )
        elif prefix_lower in ("class", "class_name"):
            strategies.append(
                SelectorStrategy(
                    type=SelectorStrategyType.CLASS, selector=value, weight=0.8
                )
            )
        elif prefix_lower in ("uia", "automation"):
            strategies.append(
                SelectorStrategy(
                    type=SelectorStrategyType.UIA, selector=value, weight=1.0
                )
            )
        elif prefix_lower in ("css", "playwright"):
            strategies.append(
                SelectorStrategy(
                    type=SelectorStrategyType.CSS, selector=value, weight=1.0
                )
            )
        elif prefix_lower == "xpath":
            strategies.append(
                SelectorStrategy(
                    type=SelectorStrategyType.XPATH, selector=value, weight=1.0
                )
            )
        elif prefix_lower in ("text", "text_anchor", "anchor"):
            strategies.append(
                SelectorStrategy(
                    type=SelectorStrategyType.TEXT_ANCHOR,
                    label=value,
                    direction=AnchorDirection.EXACT,
                    weight=0.9,
                )
            )
        elif prefix_lower in ("image", "visual", "visual_template"):
            strategies.append(
                SelectorStrategy(
                    type=SelectorStrategyType.VISUAL_TEMPLATE,
                    image_path=value,
                    weight=0.85,
                )
            )
        else:
            strategies.append(
                SelectorStrategy(
                    type=SelectorStrategyType.NATIVE, selector=raw_str, weight=1.0
                )
            )
    else:
        # Generic native string (CSS, XPath, text, etc.)
        if raw_str.startswith("#"):
            strategies.append(
                SelectorStrategy(
                    type=SelectorStrategyType.ID, selector=raw_str[1:], weight=1.0
                )
            )
            strategies.append(
                SelectorStrategy(
                    type=SelectorStrategyType.CSS, selector=raw_str, weight=0.9
                )
            )
        elif raw_str.startswith("//") or raw_str.startswith("(//"):
            strategies.append(
                SelectorStrategy(
                    type=SelectorStrategyType.XPATH, selector=raw_str, weight=1.0
                )
            )
        else:
            strategies.append(
                SelectorStrategy(
                    type=SelectorStrategyType.NATIVE, selector=raw_str, weight=1.0
                )
            )

    return CompositeSelector(
        strategies=strategies,
        timeout_ms=10000,
        confidence_threshold=0.70,
        original_query=raw_str,
    )


def _dict_to_composite(data: dict[str, Any]) -> CompositeSelector:
    """Convert raw dictionary to CompositeSelector."""
    strategies_data = data.get("strategies", [])
    strategies: list[SelectorStrategy] = []

    if isinstance(strategies_data, list):
        for s in strategies_data:
            if isinstance(s, dict):
                strategies.append(
                    SelectorStrategy(
                        type=s.get("type", "native"),
                        selector=s.get("selector"),
                        label=s.get("label"),
                        direction=s.get("direction", AnchorDirection.EXACT),
                        target_type=s.get("target_type"),
                        image_hash=s.get("image_hash"),
                        image_base64=s.get("image_base64"),
                        image_path=s.get("image_path"),
                        similarity=float(s.get("similarity", 0.85)),
                        weight=float(s.get("weight", 1.0)),
                        params=s.get("params", {}),
                    )
                )

    # If no strategies list provided but dict has "type" or "selector"
    if not strategies and ("type" in data or "selector" in data or "label" in data):
        strategies.append(
            SelectorStrategy(
                type=data.get("type", "native"),
                selector=data.get("selector"),
                label=data.get("label"),
                direction=data.get("direction", AnchorDirection.EXACT),
                target_type=data.get("target_type"),
                image_hash=data.get("image_hash"),
                image_base64=data.get("image_base64"),
                image_path=data.get("image_path"),
                similarity=float(data.get("similarity", 0.85)),
                weight=float(data.get("weight", 1.0)),
                params=data.get("params", {}),
            )
        )

    return CompositeSelector(
        strategies=strategies,
        timeout_ms=int(data.get("timeout_ms", 10000)),
        confidence_threshold=float(data.get("confidence_threshold", 0.70)),
    )
