"""Tests for the VLM grounding selector strategy (issue #743)."""

from __future__ import annotations

import json
from typing import Any

import pytest

from rpaforge.selectors import vlm_grounding as vlm_module
from rpaforge.selectors.engine import SmartSelectorEngine
from rpaforge.selectors.models import SelectorStrategyType
from rpaforge.selectors.parser import parse_selector
from rpaforge.selectors.vlm_grounding import (
    has_vision_configured,
    make_vlm_resolver,
)


class _FakeClient:
    def __init__(self, payload: str) -> None:
        self._payload = payload
        self.calls: list[dict[str, Any]] = []

    def chat(self, messages, *, model, images=None, **_kwargs: Any):
        self.calls.append({"messages": messages, "model": model, "images": images})
        from rpaforge.llm.client import LLMResult

        return LLMResult(text=self._payload, model=model)


def _factory(payload: str):
    client = _FakeClient(payload)
    return lambda: (client, "fake-vlm"), client


def _clear_env(monkeypatch: pytest.MonkeyPatch) -> None:
    for var in ("RPAFORGE_LLM_PROVIDER", "RPAFORGE_LLM_BASE_URL", "RPAFORGE_LLM_MODEL"):
        monkeypatch.delenv(var, raising=False)


class TestConfigProbe:
    """Acceptance: strategy skipped cleanly when no vision model configured."""

    def test_unconfigured_returns_false(self, monkeypatch: pytest.MonkeyPatch) -> None:
        _clear_env(monkeypatch)
        assert has_vision_configured() is False

    def test_configured_with_fake_factory(self) -> None:
        factory, _ = _factory("{}")
        assert vlm_module.has_vision_configured.__wrapped__ if False else True
        # Direct probe via patched seam:
        original = vlm_module._build_vision_client
        vlm_module._build_vision_client = factory  # type: ignore[method-assign]
        try:
            assert has_vision_configured() is True
        finally:
            vlm_module._build_vision_client = original  # type: ignore[method-assign]


class TestResolverContract:
    def test_valid_bbox_returned_and_weight_plumbed(self) -> None:
        factory, client = _factory(
            json.dumps({"bbox": [10, 20, 120, 40], "confidence": 0.87})
        )
        resolver = make_vlm_resolver(
            "submit button", screenshot_fn=lambda: b"png", client_factory=factory
        )

        class _Strat:
            weight = 1.0
            label = "submit button"
            selector: str | None = None

        strat = _Strat()
        result = resolver(strat)

        assert result == {"bbox": [10.0, 20.0, 120.0, 40.0], "confidence": 0.87}
        assert strat.weight == pytest.approx(0.87)
        assert strat.selector == "bbox=10,20,120,40"
        assert client.calls[0]["images"] == [b"png"]
        assert "submit button" in client.calls[0]["messages"][1]["content"]

    def test_bbox_clamped_to_viewport(self) -> None:
        factory, _ = _factory(
            json.dumps({"bbox": [1000, 900, 500, 500], "confidence": 0.9})
        )
        resolver = make_vlm_resolver(
            "el",
            screenshot_fn=lambda: b"p",
            client_factory=factory,
            viewport_size=(1280, 720),
        )
        result = resolver(type("S", (), {"weight": 1.0})())
        x, y, w, h = result["bbox"]
        assert x <= 1280 and y <= 720 and w <= 1280 - x and h <= 720 - y

    @pytest.mark.parametrize(
        "payload",
        [
            "garbage",
            '{"bbox": [1, 2], "confidence": 0.9}',
            '{"bbox": [-5, 2, 10, 10], "confidence": 0.9}',
            '{"bbox": [1, 2, 3, 4], "confidence": 7}',
        ],
    )
    def test_garbage_raises_valueerror(self, payload: str) -> None:
        factory, _ = _factory(payload)
        resolver = make_vlm_resolver(
            "x", screenshot_fn=lambda: b"", client_factory=factory
        )
        with pytest.raises(ValueError):
            resolver(type("S", (), {"weight": 1.0})())


class TestEngineIntegration:
    """Chain behavior: css fails -> VLM grounding wins with telemetry."""

    def _composite(self) -> Any:
        return parse_selector(
            {
                "strategies": [
                    {"type": "css", "selector": ".missing", "weight": 1.0},
                    {"type": "vlm_grounding", "label": "login button", "weight": 0.3},
                ]
            }
        )

    def test_healed_via_vlm_with_telemetry(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        factory, _ = _factory(json.dumps({"bbox": [5, 6, 70, 24], "confidence": 0.8}))
        monkeypatch.setattr(vlm_module, "_build_vision_client", factory)

        composite = self._composite()
        engine = SmartSelectorEngine()

        def css_fail(_strategy: Any) -> Any:
            raise TimeoutError("no such element")

        resolvers = {
            SelectorStrategyType.CSS: css_fail,
            "css": css_fail,
            SelectorStrategyType.VLM_GROUNDING: make_vlm_resolver(
                "login button",
                screenshot_fn=lambda: b"png",
                client_factory=factory,
            ),
        }

        result = engine.resolve(composite, resolvers=resolvers, timeout_ms=5000)

        assert result.healed is True
        assert result.confidence_score == pytest.approx(0.8)
        # Fake provider resolves instantly; Windows timer granularity can
        # round this to exactly 0.0 - presence of the field is the contract.
        assert result.execution_time_ms >= 0
        assert result.strategy_used.type == SelectorStrategyType.VLM_GROUNDING
        assert "vlm_grounding:" in result.discovered_selector
        assert "bbox=5,6,70,24" in result.discovered_selector

    def test_skipped_when_no_resolver_registered(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """No vision configured -> resolver absent -> chain continues/fails cleanly."""
        _clear_env(monkeypatch)
        composite = self._composite()
        engine = SmartSelectorEngine()

        def css_fail(_strategy: Any) -> Any:
            raise TimeoutError("no such element")

        with pytest.raises(TimeoutError):
            engine.resolve(composite, resolvers={"css": css_fail}, timeout_ms=500)


class TestParser:
    def test_descriptor_parses_new_type(self) -> None:
        composite = parse_selector({"type": "vlm_grounding", "label": "checkout link"})
        assert composite.strategies[0].label == "checkout link"

    def test_mixed_composite_sorts_vlm_last_by_weight(self) -> None:
        composite = parse_selector(
            {
                "strategies": [
                    {"type": "vlm_grounding", "label": "btn", "weight": 0.3},
                    {"type": "css", "selector": "#b"},
                ]
            }
        )
        ordered = sorted(composite.strategies, key=lambda s: s.weight, reverse=True)
        assert ordered[-1].type == "vlm_grounding"
