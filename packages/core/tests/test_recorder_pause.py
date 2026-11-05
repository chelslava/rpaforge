"""Tests for recorder session pause/resume (issue #848)."""

from __future__ import annotations

import asyncio
from typing import Any

import pytest

from rpaforge.bridge.handlers.recorder import setup_recorder_handlers
from rpaforge.bridge.protocol import JSONRPCError


class _FakeWebUI:
    """WebUI double exposing the pause/resume recording API."""

    def __init__(self) -> None:
        self.paused = False
        self.resumed = False

    def pause_recording(self) -> dict[str, Any]:
        self.paused = True
        return {"recording": True, "paused": True}

    def resume_recording(self) -> dict[str, Any]:
        self.resumed = True
        return {"recording": True, "paused": False}


class _FakeDesktopRecorder:
    def __init__(self) -> None:
        self.active = True
        self.paused_calls = 0
        self.resumed_calls = 0

    @property
    def is_active(self) -> bool:
        return self.active

    def pause(self) -> bool:
        self.paused_calls += 1
        return True

    def resume(self) -> bool:
        # Mirrors the real recorder: a detached (stopped) session has
        # nothing to re-attach.
        self.resumed_calls += 1
        return self.active


class _FakeBridge:
    """Minimal bridge double wired like the real handlers expect."""

    def __init__(self, webui: Any, desktop: Any) -> None:
        self.events: list[dict[str, Any]] = []
        self._webui = webui
        self._desktop = desktop
        self._engine = type(
            "E", (), {"executor": type("X", (), {"_libraries": {"WebUI": webui}})()}
        )()
        self._desktop_recorder = desktop
        setup_recorder_handlers(type(self))

    def _emit(self, event_dict: dict[str, Any]) -> None:
        self.events.append(event_dict)


def _last_state(events: list[dict[str, Any]]) -> str:
    states = [e.get("state") for e in events if e.get("type") == "recordingState"]
    return states[-1] if states else ""


class TestPauseResume:
    def test_pause_suspends_both_targets_and_emits_state(self) -> None:
        webui = _FakeWebUI()
        desktop = _FakeDesktopRecorder()
        bridge = _FakeBridge(webui, desktop)

        result = asyncio.run(bridge._handle_pause_recording({}))

        assert result == {
            "recording": True,
            "paused": True,
            "capabilities": {"web": True, "desktop": True},
        }
        assert webui.paused
        assert desktop.paused_calls == 1
        assert _last_state(bridge.events) == "paused"

    def test_resume_reattaches_and_emits_state(self) -> None:
        webui = _FakeWebUI()
        desktop = _FakeDesktopRecorder()
        bridge = _FakeBridge(webui, desktop)

        result = asyncio.run(bridge._handle_resume_recording({}))

        assert result["paused"] is False
        assert webui.resumed
        assert desktop.resumed_calls == 1
        assert _last_state(bridge.events) == "recording"

    def test_pause_without_any_recording_raises(self) -> None:
        bridge = _FakeBridge(None, _FakeDesktopRecorder())
        bridge._desktop_recorder.active = False

        with pytest.raises(JSONRPCError, match="No active recording"):
            asyncio.run(bridge._handle_pause_recording({}))

    def test_resume_without_paused_recording_raises(self) -> None:
        bridge = _FakeBridge(None, _FakeDesktopRecorder())
        bridge._desktop_recorder.active = False

        with pytest.raises(JSONRPCError, match="No paused recording"):
            asyncio.run(bridge._handle_resume_recording({}))

    def test_webui_without_pause_api_still_pauses_desktop(self) -> None:
        class _LegacyWebUI:
            """Old WebUI build without pause_recording."""

        webui = _LegacyWebUI()
        desktop = _FakeDesktopRecorder()
        bridge = _FakeBridge(webui, desktop)

        result = asyncio.run(bridge._handle_pause_recording({}))

        assert result["capabilities"] == {"web": False, "desktop": True}
        assert desktop.paused_calls == 1
