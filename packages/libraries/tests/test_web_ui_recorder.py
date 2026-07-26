"""Tests for WebUI's in-memory recorder bridge."""

from __future__ import annotations

import json
from types import SimpleNamespace

import pytest

from rpaforge_libraries.WebUI import WebUI
from rpaforge_libraries.WebUI.library import _RECORDER_MARKER


class FakePage:
    """Small Playwright page double for recorder lifecycle tests."""

    def __init__(self) -> None:
        self.listeners: dict[str, object] = {}
        self.init_scripts: list[str] = []
        self.evaluated: list[str] = []
        self.main_frame = object()
        self.url = "https://example.test/form"

    def on(self, event: str, callback: object) -> None:
        self.listeners[event] = callback

    def add_init_script(self, *, script: str) -> None:
        self.init_scripts.append(script)

    def evaluate(self, script: str) -> None:
        self.evaluated.append(script)

    def remove_listener(self, event: str, callback: object) -> None:
        if self.listeners.get(event) is callback:
            del self.listeners[event]


class TestWebUIRecorder:
    """Verify recorder hooks stay session-only and parse bridge events safely."""

    def test_records_console_actions_and_detaches(self):
        webui = WebUI()
        page = FakePage()
        webui._pages["page-1"] = page
        webui._current_page_id = "page-1"
        events: list[dict] = []

        result = webui.start_recording(events.append)

        assert result == {
            "recording": True,
            "capabilities": {"web": True, "desktop": False},
        }
        assert _RECORDER_MARKER in page.init_scripts[0]
        console = page.listeners["console"]
        console(
            SimpleNamespace(
                text=_RECORDER_MARKER
                + json.dumps(
                    {
                        "id": "action-1",
                        "type": "click",
                        "selector": {"type": "id", "value": "#save", "reliability": 1},
                        "allCandidates": [],
                        "timestamp": 1,
                        "source": "web",
                    }
                )
            )
        )
        console(SimpleNamespace(text="unrelated console output"))
        console(SimpleNamespace(text=_RECORDER_MARKER + "not-json"))

        assert events[0]["id"] == "action-1"
        assert webui.stop_recording() == {
            "recording": False,
            "actionCount": 1,
            "capabilities": {"web": True, "desktop": False},
        }
        assert page.listeners == {}
        assert webui._recording_callback is None

    def test_requires_an_active_page(self):
        with pytest.raises(RuntimeError, match="Open a WebUI browser"):
            WebUI().start_recording(lambda _event: None)
