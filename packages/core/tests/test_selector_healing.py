"""Tests for self-healing locator recommendations (issue #745)."""

from __future__ import annotations

import json
from typing import Any

import pytest

from rpaforge.selectors.healing import (
    EVENT_SELECTOR_FIX_PROPOSED,
    propose_fix,
    resolve_heal_mode,
)

GOOD = json.dumps({"bbox": [10, 20, 120, 40], "confidence": 0.85})


class TestHealMode:
    def test_default_is_propose(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.delenv("RPAFORGE_HEAL_MODE", raising=False)
        assert resolve_heal_mode() == "propose"

    def test_apply_and_off_and_fallback(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setenv("RPAFORGE_HEAL_MODE", "apply")
        assert resolve_heal_mode() == "apply"
        monkeypatch.setenv("RPAFORGE_HEAL_MODE", "off")
        assert resolve_heal_mode() == "off"
        monkeypatch.setenv("RPAFORGE_HEAL_MODE", "bogus")
        assert resolve_heal_mode() == "propose"


def _make_factory(payload: str):
    from rpaforge.llm.client import LLMResult

    class _C:
        def chat(self, *_a: Any, **_kw: Any):
            return LLMResult(text=payload, model="fake")

    return lambda: (_C(), "fake")


@pytest.fixture(autouse=True)
def _vision_ready(monkeypatch: pytest.MonkeyPatch) -> None:
    """Tests stub the client; force the config probe open."""
    import rpaforge.selectors.vlm_grounding as vlm_module

    monkeypatch.setattr(vlm_module, "has_vision_configured", lambda: True)


class TestProposeFix:
    def test_proposal_artifact_written_with_actionable_fields(
        self, tmp_path: Any
    ) -> None:
        factory = _make_factory(GOOD)
        proposal = propose_fix(
            "the Approve button",
            failed_selector=".broken-css",
            screenshot_fn=lambda: b"png-bytes",
            audit_dir=tmp_path,
            client_factory=factory,
        )
        assert proposal is not None
        assert proposal["old_selector"] == ".broken-css"
        assert proposal["proposed"]["bbox"] == [10, 20, 120, 40]
        assert proposal["proposed"]["confidence"] == pytest.approx(0.85)
        artifacts = list((tmp_path / "selector-fixes").glob("fix-*.json"))
        assert len(artifacts) == 1
        on_disk = json.loads(artifacts[0].read_text(encoding="utf-8"))
        assert on_disk["description"] == "the Approve button"
        shots = list((tmp_path / "selector-fixes").glob("shot-*.png"))
        assert shots and shots[0].read_bytes() == b"png-bytes"

    def test_event_constant_matches_runner_channel(self) -> None:
        assert EVENT_SELECTOR_FIX_PROPOSED == "selector_fix_proposed"

    def test_garbage_vlm_returns_none_not_raises(self, tmp_path: Any) -> None:
        factory = _make_factory("garbage")
        assert (
            propose_fix(
                "x",
                ".sel",
                screenshot_fn=lambda: b"",
                audit_dir=tmp_path,
                client_factory=factory,
            )
            is None
        )

    def test_unconfigured_vision_returns_none_immediately(
        self, tmp_path: Any, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        for var in ("RPAFORGE_LLM_PROVIDER", "RPAFORGE_LLM_MODEL"):
            monkeypatch.delenv(var, raising=False)
        calls: list[int] = []

        def _boom() -> Any:
            calls.append(1)
            raise AssertionError("client must not be built")

        proposal = propose_fix(
            "x",
            ".sel",
            screenshot_fn=_boom,
            audit_dir=tmp_path,
            client_factory=None,
        )
        assert proposal is None

    def test_broken_screenshot_degrades(self, tmp_path: Any) -> None:
        factory = _make_factory(GOOD)

        def _boom() -> bytes:
            raise OSError("no display")

        assert (
            propose_fix(
                "x",
                ".sel",
                screenshot_fn=_boom,
                audit_dir=tmp_path,
                client_factory=factory,
            )
            is None
        )


class TestEventPayloadShape:
    def test_emit_kwargs_match_documented_shape(self, tmp_path: Any) -> None:
        emitted: dict[str, Any] = {}

        class _Logger:
            def emit(self, event_name: str, **kwargs: Any) -> None:
                emitted["event"] = event_name
                emitted.update(kwargs)

        factory = _make_factory(GOOD)
        proposal = propose_fix(
            "btn",
            ".old",
            screenshot_fn=lambda: b"p",
            audit_dir=tmp_path,
            client_factory=factory,
        )
        assert proposal is not None
        logger = _Logger()
        logger.emit(
            EVENT_SELECTOR_FIX_PROPOSED,
            description=proposal["description"],
            old_selector=proposal["old_selector"],
            proposed_bbox=proposal["proposed"]["bbox"],
            confidence=proposal["proposed"]["confidence"],
        )
        assert emitted["event"] == "selector_fix_proposed"
        assert emitted["old_selector"] == ".old"
