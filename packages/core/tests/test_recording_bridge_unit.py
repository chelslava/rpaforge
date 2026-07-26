"""Unit tests for optional desktop recording hooks."""

from __future__ import annotations

from types import SimpleNamespace

from rpaforge.bridge.handlers.recorder import _DesktopRecorder


class TestDesktopRecorder:
    """Verify desktop actions are filtered and normalized before emission."""

    def test_bridge_registers_recording_commands(self):
        from rpaforge.bridge.handlers import BridgeHandlers
        from rpaforge.bridge.handlers.recorder import setup_recorder_handlers

        setup_recorder_handlers(BridgeHandlers)
        assert callable(BridgeHandlers._handle_start_recording)
        assert callable(BridgeHandlers._handle_stop_recording)

    def test_emits_control_keys_only(self):
        events: list[dict] = []
        recorder = _DesktopRecorder(events.append)

        recorder._on_press(SimpleNamespace(name="enter"))
        recorder._on_press(SimpleNamespace(name="a"))

        assert len(events) == 1
        assert events[0]["type"] == "keypress"
        assert events[0]["source"] == "desktop"
        assert events[0]["value"] == "enter"
        assert events[0]["selector"]["value"] == ""

    def test_emits_ui_automation_selector(self, monkeypatch):
        events: list[dict] = []
        recorder = _DesktopRecorder(events.append)
        monkeypatch.setattr(
            "rpaforge_libraries.Spy.get_element_at_point_desktop",
            lambda _x, _y: {
                "reliableSelector": {
                    "type": "id",
                    "value": "id:save-button",
                    "reliability": 1.0,
                }
            },
        )

        recorder._on_click(10, 20, None, True)
        recorder._on_click(10, 20, None, False)

        assert len(events) == 1
        assert events[0]["type"] == "click"
        assert events[0]["selector"]["value"] == "id:save-button"
        assert events[0]["allCandidates"] == [events[0]["selector"]]
