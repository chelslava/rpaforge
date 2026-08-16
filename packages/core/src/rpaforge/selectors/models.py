"""Models and data structures for RPAForge Smart Selectors."""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Any


class SelectorStrategyType(str, Enum):
    """Supported selector resolution strategy types."""

    NATIVE = "native"
    UIA = "uia"
    PLAYWRIGHT = "playwright"
    CSS = "css"
    XPATH = "xpath"
    ID = "id"
    NAME = "name"
    CLASS = "class"
    TEXT_ANCHOR = "text_anchor"
    VISUAL_TEMPLATE = "visual_template"
    OCR_ANCHOR = "ocr_anchor"
    COORDINATES = "coordinates"


class AnchorDirection(str, Enum):
    """Relative spatial direction for text and visual anchors."""

    EXACT = "exact"
    RIGHT = "right"
    BELOW = "below"
    LEFT = "left"
    ABOVE = "above"
    NEAR = "near"


@dataclass
class SelectorStrategy:
    """A single strategy within a composite multi-strategy selector."""

    type: str | SelectorStrategyType
    selector: str | None = None
    label: str | None = None
    direction: str | AnchorDirection = AnchorDirection.EXACT
    target_type: str | None = None  # e.g. "input", "button", "edit", "any"
    image_hash: str | None = None
    image_base64: str | None = None
    image_path: str | None = None
    similarity: float = 0.85
    weight: float = 1.0
    params: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        """Convert strategy to dictionary representation."""
        data: dict[str, Any] = {
            "type": self.type.value if isinstance(self.type, Enum) else str(self.type),
            "weight": self.weight,
        }
        if self.selector:
            data["selector"] = self.selector
        if self.label:
            data["label"] = self.label
        if self.direction:
            data["direction"] = (
                self.direction.value
                if isinstance(self.direction, Enum)
                else str(self.direction)
            )
        if self.target_type:
            data["target_type"] = self.target_type
        if self.image_hash:
            data["image_hash"] = self.image_hash
        if self.image_base64:
            data["image_base64"] = self.image_base64
        if self.image_path:
            data["image_path"] = self.image_path
        if self.similarity != 0.85:
            data["similarity"] = self.similarity
        if self.params:
            data["params"] = self.params
        return data


@dataclass
class CompositeSelector:
    """Multi-strategy selector container with hierarchical fallback configuration."""

    strategies: list[SelectorStrategy] = field(default_factory=list)
    timeout_ms: int = 10000
    confidence_threshold: float = 0.70
    original_query: str | None = None

    @property
    def primary_strategy(self) -> SelectorStrategy | None:
        """Return the primary (highest weight) strategy."""
        return self.strategies[0] if self.strategies else None

    def to_dict(self) -> dict[str, Any]:
        """Convert composite selector to dictionary."""
        return {
            "strategies": [s.to_dict() for s in self.strategies],
            "timeout_ms": self.timeout_ms,
            "confidence_threshold": self.confidence_threshold,
        }


@dataclass
class BoundingBox:
    """2D Bounding box for visual and anchor calculations."""

    x: float
    y: float
    width: float
    height: float

    @property
    def left(self) -> float:
        return self.x

    @property
    def top(self) -> float:
        return self.y

    @property
    def right(self) -> float:
        return self.x + self.width

    @property
    def bottom(self) -> float:
        return self.y + self.height

    @property
    def center_x(self) -> float:
        return self.x + (self.width / 2.0)

    @property
    def center_y(self) -> float:
        return self.y + (self.height / 2.0)

    def to_dict(self) -> dict[str, float]:
        return {
            "x": self.x,
            "y": self.y,
            "width": self.width,
            "height": self.height,
            "left": self.left,
            "top": self.top,
            "right": self.right,
            "bottom": self.bottom,
        }


@dataclass
class SelectorResolutionResult:
    """Result of resolving an element via SmartSelectorEngine."""

    element: Any
    strategy_used: SelectorStrategy
    confidence_score: float
    healed: bool = False
    discovered_selector: str | None = None
    execution_time_ms: float = 0.0
    bounding_box: BoundingBox | None = None
    metadata: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return {
            "strategy_used": self.strategy_used.to_dict(),
            "confidence_score": self.confidence_score,
            "healed": self.healed,
            "discovered_selector": self.discovered_selector,
            "execution_time_ms": self.execution_time_ms,
            "bounding_box": self.bounding_box.to_dict() if self.bounding_box else None,
            "metadata": self.metadata,
        }


class SelectorHealedWarning(UserWarning):
    """Warning emitted when an element is located via a fallback strategy instead of primary."""

    pass
