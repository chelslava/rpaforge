"""Tests for RPAForge Smart Selector Engine, Hierarchical Fallbacks, and Anchors."""

from __future__ import annotations

import warnings

import pytest

from rpaforge.selectors.engine import SmartSelectorEngine
from rpaforge.selectors.models import (
    AnchorDirection,
    BoundingBox,
    CompositeSelector,
    SelectorHealedWarning,
    SelectorStrategy,
    SelectorStrategyType,
)
from rpaforge.selectors.parser import parse_selector
from rpaforge.selectors.text_anchor import (
    calculate_anchor_score,
    find_best_relative_candidate,
)
from rpaforge.selectors.vision import compute_image_hash


def test_composite_selector_serialization():
    strat1 = SelectorStrategy(
        type=SelectorStrategyType.UIA, selector="AutomationId:btn_submit", weight=1.0
    )
    strat2 = SelectorStrategy(
        type=SelectorStrategyType.TEXT_ANCHOR,
        label="Submit Order",
        direction=AnchorDirection.EXACT,
        weight=0.85,
    )
    strat3 = SelectorStrategy(
        type=SelectorStrategyType.VISUAL_TEMPLATE,
        image_hash="a1b2c3d4",
        similarity=0.90,
        weight=0.70,
    )

    composite = CompositeSelector(
        strategies=[strat1, strat2, strat3],
        timeout_ms=5000,
        confidence_threshold=0.75,
    )

    data = composite.to_dict()
    assert len(data["strategies"]) == 3
    assert data["strategies"][0]["type"] == "uia"
    assert data["strategies"][1]["label"] == "Submit Order"
    assert data["strategies"][2]["image_hash"] == "a1b2c3d4"
    assert data["timeout_ms"] == 5000


def test_parse_selector_prefixes():
    # ID prefix
    c1 = parse_selector("id:submit_btn")
    assert c1.primary_strategy is not None
    assert c1.primary_strategy.type == SelectorStrategyType.ID
    assert c1.primary_strategy.selector == "submit_btn"
    assert len(c1.strategies) >= 2  # Has auto text anchor fallback

    # Name prefix
    c2 = parse_selector("name:Login Window")
    assert c2.primary_strategy.type == SelectorStrategyType.NAME
    assert c2.primary_strategy.selector == "Login Window"

    # Text anchor prefix
    c3 = parse_selector("text:Invoice Total")
    assert c3.primary_strategy.type == SelectorStrategyType.TEXT_ANCHOR
    assert c3.primary_strategy.label == "Invoice Total"

    # CSS / XPath
    c4 = parse_selector("#username")
    assert c4.primary_strategy.type == SelectorStrategyType.ID
    c5 = parse_selector("//button[@type='submit']")
    assert c5.primary_strategy.type == SelectorStrategyType.XPATH


def test_parse_composite_json_string():
    json_str = """
    {
      "strategies": [
        {"type": "uia", "selector": "AutomationId:btn_submit", "weight": 1.0},
        {"type": "text_anchor", "label": "Submit Order", "direction": "exact", "weight": 0.85},
        {"type": "visual_template", "image_hash": "a1b2c3d4", "similarity": 0.90, "weight": 0.70}
      ],
      "timeout_ms": 8000,
      "confidence_threshold": 0.75
    }
    """
    comp = parse_selector(json_str)
    assert len(comp.strategies) == 3
    assert comp.strategies[0].type == "uia"
    assert comp.strategies[1].label == "Submit Order"
    assert comp.timeout_ms == 8000
    assert comp.confidence_threshold == 0.75


def test_spatial_anchor_calculations():
    # Label "Invoice Number" at (100, 100, 100, 30)
    anchor = BoundingBox(x=100, y=100, width=100, height=30)

    # Input directly to the right at (210, 100, 150, 30)
    input_right = BoundingBox(x=210, y=100, width=150, height=30)
    score_right = calculate_anchor_score(
        anchor, input_right, direction=AnchorDirection.RIGHT
    )
    assert score_right > 0.8

    # Input below at (100, 140, 150, 30)
    input_below = BoundingBox(x=100, y=140, width=150, height=30)
    score_below = calculate_anchor_score(
        anchor, input_below, direction=AnchorDirection.BELOW
    )
    assert score_below > 0.8

    # Irrelevant input far away at (800, 800, 100, 30)
    input_far = BoundingBox(x=800, y=800, width=100, height=30)
    score_far = calculate_anchor_score(
        anchor, input_far, direction=AnchorDirection.RIGHT
    )
    assert score_far < 0.2


def test_find_best_relative_candidate():
    label_box = BoundingBox(x=50, y=100, width=80, height=25)

    candidates = [
        {
            "id": "btn_cancel",
            "rect": {"x": 500, "y": 500, "width": 80, "height": 30},
            "tag": "button",
        },
        {
            "id": "txt_field",
            "rect": {"x": 140, "y": 100, "width": 120, "height": 25},
            "tag": "input",
        },
        {
            "id": "lbl_other",
            "rect": {"x": 50, "y": 200, "width": 80, "height": 25},
            "tag": "text",
        },
    ]

    best, score = find_best_relative_candidate(
        anchor_box=label_box,
        candidates=candidates,
        direction=AnchorDirection.RIGHT,
        target_type="input",
    )
    assert best is not None
    assert best["id"] == "txt_field"
    assert score > 0.8


def test_smart_selector_engine_primary_success():
    engine = SmartSelectorEngine(default_timeout_ms=2000)

    composite = CompositeSelector(
        strategies=[
            SelectorStrategy(type="id", selector="btn_1", weight=1.0),
            SelectorStrategy(type="text_anchor", label="Submit", weight=0.8),
        ]
    )

    resolvers = {
        "id": lambda _s: "found_by_id",
        "text_anchor": lambda _s: "found_by_anchor",
    }

    with warnings.catch_warnings():
        warnings.simplefilter("error", SelectorHealedWarning)
        res = engine.resolve(composite, resolvers=resolvers)

    assert res.element == "found_by_id"
    assert res.healed is False
    assert res.confidence_score == 1.0


def test_smart_selector_engine_heals_with_fallback():
    engine = SmartSelectorEngine(default_timeout_ms=2000)

    # Primary ID altered -> fails
    # Fallback text_anchor -> succeeds
    composite = CompositeSelector(
        strategies=[
            SelectorStrategy(type="id", selector="altered_broken_id", weight=1.0),
            SelectorStrategy(type="text_anchor", label="Submit Order", weight=0.85),
        ]
    )

    def resolve_id(_s):
        raise ValueError("Element with ID not found in DOM")

    def resolve_anchor(_s):
        return {"control": "Button", "text": "Submit Order"}

    resolvers = {
        "id": resolve_id,
        "text_anchor": resolve_anchor,
    }

    with pytest.warns(SelectorHealedWarning) as record:
        res = engine.resolve(composite, resolvers=resolvers)

    assert res.element == {"control": "Button", "text": "Submit Order"}
    assert res.healed is True
    assert res.strategy_used.type == "text_anchor"
    assert res.confidence_score == 0.85
    assert len(record) == 1
    assert "SelectorHealedWarning" in str(record[0].message)


def test_smart_selector_engine_all_fail_raises_timeout():
    engine = SmartSelectorEngine(default_timeout_ms=500)

    composite = CompositeSelector(
        strategies=[
            SelectorStrategy(type="id", selector="missing1", weight=1.0),
            SelectorStrategy(type="text_anchor", label="missing2", weight=0.8),
        ]
    )

    resolvers = {
        "id": lambda _s: None,
        "text_anchor": lambda _s: None,
    }

    with pytest.raises(TimeoutError) as exc_info:
        engine.resolve(composite, resolvers=resolvers)

    assert "could not be resolved" in str(exc_info.value)


def test_vision_image_hashing():
    data1 = b"sample_image_bytes_123"
    data2 = b"sample_image_bytes_123"
    data3 = b"other_image_bytes_456"

    h1 = compute_image_hash(data1)
    h2 = compute_image_hash(data2)
    h3 = compute_image_hash(data3)

    assert h1 == h2
    assert h1 != h3
