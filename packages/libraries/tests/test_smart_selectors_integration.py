"""Integration tests for Smart Selectors in DesktopUI and WebUI."""

from __future__ import annotations

from unittest.mock import MagicMock

import pytest

from rpaforge.selectors import SelectorHealedWarning
from rpaforge_libraries.DesktopUI.library import DesktopUI
from rpaforge_libraries.WebUI.library import WebUI


def test_desktop_ui_smart_selector_fallback():
    ui = DesktopUI()
    mock_win = MagicMock()
    ui._windows["win_test"] = mock_win
    ui._current_window_id = "win_test"

    # Primary ID fails, anchor returns element
    primary_ctrl = MagicMock()
    primary_ctrl.wait.side_effect = Exception("Not found")

    mock_win.child_window.return_value = primary_ctrl

    # Mock text anchor search
    anchor_ctrl = MagicMock()
    anchor_ctrl.window_text.return_value = "Submit Order"
    anchor_rect = MagicMock()
    anchor_rect.left = 100
    anchor_rect.top = 100
    anchor_rect.right = 200
    anchor_rect.bottom = 130
    anchor_ctrl.rectangle.return_value = anchor_rect
    anchor_ctrl.children.return_value = []

    mock_win.children.return_value = [anchor_ctrl]
    mock_win.window_text.return_value = "Main Window"
    mock_win.rectangle.return_value = None

    composite_selector = {
        "strategies": [
            {"type": "id", "selector": "broken_btn_id", "weight": 1.0},
            {
                "type": "text_anchor",
                "label": "Submit Order",
                "direction": "exact",
                "weight": 0.85,
            },
        ]
    }

    with pytest.warns(SelectorHealedWarning):
        elem = ui._find_element(composite_selector, timeout="1s")

    assert elem == anchor_ctrl


def test_web_ui_smart_selector_resolution():
    web = WebUI()
    mock_page = MagicMock()
    web._pages["page_test"] = mock_page
    web._current_page_id = "page_test"

    composite_selector = {
        "strategies": [
            {"type": "css", "selector": "#broken_id", "weight": 1.0},
            {
                "type": "text_anchor",
                "label": "Submit",
                "target_type": "button",
                "weight": 0.85,
            },
        ]
    }

    def mock_wait(sel, **kwargs):
        if sel == "#broken_id":
            raise Exception("Selector not attached")
        return MagicMock()

    mock_page.wait_for_selector.side_effect = mock_wait

    with pytest.warns(SelectorHealedWarning):
        loc = web._resolve_smart_locator(composite_selector, timeout_ms=1000)

    assert "button:has-text('Submit')" in loc or "text=Submit" in loc
