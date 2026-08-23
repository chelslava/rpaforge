"""Browser tests for NL element targeting activities (issue #744).

Requires Playwright browsers; the VLM provider is always mocked, so the
tests stay offline-deterministic.
"""

from __future__ import annotations

import json
from typing import Any

import pytest

playwright_api = pytest.importorskip(
    "playwright.sync_api", reason="playwright is required for WebUI browser tests"
)

from rpaforge_libraries.WebUI.library import WebUI  # noqa: E402

PAGE_HTML = """
<html><body>
  <button id="approve" onclick="document.title='clicked'">Approve</button>
</body></html>
"""


class _FakeVLM:
    """Scripted vision model returning a bbox for the fixture button."""

    def __init__(self) -> None:
        self.calls = 0

    def chat(self, *_a: Any, **_kw: Any):
        self.calls += 1
        from rpaforge.llm.client import LLMResult

        return LLMResult(
            text=json.dumps({"bbox": [10, 10, 100, 30], "confidence": 0.9}),
            model="fake-vlm",
        )


@pytest.fixture()
def webui_with_vlm(monkeypatch: pytest.MonkeyPatch):
    try:
        driver = playwright_api.sync_playwright().start()
        browser = driver.chromium.launch(headless=True)
    except Exception as exc:
        pytest.skip(f"Playwright browsers not available: {exc}")

    fake = _FakeVLM()
    import rpaforge.selectors.vlm_grounding as vlm_module

    monkeypatch.setattr(vlm_module, "_build_vision_client", lambda: (fake, "fake-vlm"))

    lib = WebUI(headless=True)
    page = browser.new_page(viewport={"width": 800, "height": 600})
    lib._pages["fixture"] = page
    lib._current_page_id = "fixture"
    page.set_content(PAGE_HTML)
    yield lib, fake
    browser.close()
    driver.stop()


class TestClickByDescription:
    def test_clicks_described_button(self, webui_with_vlm) -> None:
        lib, _fake = webui_with_vlm
        lib.click_element_by_description("the Approve button")
        assert lib._page.title() == "clicked"

    def test_second_invocation_uses_cache_not_vlm(self, webui_with_vlm) -> None:
        """Acceptance: resolved result cached; VLM called exactly once."""
        lib, fake = webui_with_vlm
        lib.click_element_by_description("the Approve button")
        assert fake.calls == 1
        lib.click_element_by_description("the Approve button")
        assert fake.calls == 1


class TestFindByDescription:
    def test_returns_bbox_and_reports_cached(self, webui_with_vlm) -> None:
        lib, fake = webui_with_vlm
        first = lib.find_element_by_description("the Approve button")
        assert first["bbox"] == [10, 10, 100, 30]
        assert first["cached"] is False
        second = lib.find_element_by_description("the Approve button")
        assert second["cached"] is True
        assert fake.calls == 1


class _NullVLM:
    def chat(self, *_a: Any, **_kw: Any):
        from rpaforge.llm.client import LLMResult

        return LLMResult(text=json.dumps({"bbox": None}), model="fake")


class TestNoSilentPass:
    def test_unmatched_description_raises_clear_error(
        self, webui_with_vlm, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        lib, _fake = webui_with_vlm
        import rpaforge.selectors.vlm_grounding as vlm_module

        monkeypatch.setattr(
            vlm_module,
            "_build_vision_client",
            lambda: (_NullVLM(), "fake"),
        )
        with pytest.raises((ValueError, TimeoutError)):
            lib.find_element_by_description("invisible unicorn")

    def test_no_vision_configured_raises_actionable_error(
        self, webui_with_vlm, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        for var in ("RPAFORGE_LLM_PROVIDER", "RPAFORGE_LLM_MODEL"):
            monkeypatch.delenv(var, raising=False)
        import rpaforge.selectors.vlm_grounding as vlm_module

        monkeypatch.setattr(vlm_module, "has_vision_configured", lambda: False)
        lib, _ = webui_with_vlm
        with pytest.raises(ValueError, match="[Nn]o vision-capable"):
            lib.click_element_by_description("anything")
