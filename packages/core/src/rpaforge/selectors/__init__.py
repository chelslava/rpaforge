"""RPAForge Smart Selector Engine with Fallback & Visual Anchoring."""

from __future__ import annotations

from rpaforge.selectors.engine import SmartSelectorEngine
from rpaforge.selectors.models import (
    AnchorDirection,
    BoundingBox,
    CompositeSelector,
    SelectorHealedWarning,
    SelectorResolutionResult,
    SelectorStrategy,
    SelectorStrategyType,
)
from rpaforge.selectors.parser import parse_selector
from rpaforge.selectors.text_anchor import (
    calculate_anchor_score,
    find_best_relative_candidate,
)
from rpaforge.selectors.vision import compute_image_hash, match_template

__all__ = [
    "AnchorDirection",
    "BoundingBox",
    "CompositeSelector",
    "SelectorHealedWarning",
    "SelectorResolutionResult",
    "SelectorStrategy",
    "SelectorStrategyType",
    "SmartSelectorEngine",
    "calculate_anchor_score",
    "compute_image_hash",
    "find_best_relative_candidate",
    "match_template",
    "parse_selector",
]
