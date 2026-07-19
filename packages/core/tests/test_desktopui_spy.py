"""Regression tests for Selector Spy timeout isolation."""

from __future__ import annotations

import time

import pytest

from rpaforge.bridge.handlers import BridgeHandlers
from rpaforge.bridge.handlers.desktopui_spy import setup_desktopui_spy_handlers
from rpaforge.bridge.protocol import JSONRPCError

setup_desktopui_spy_handlers(BridgeHandlers)


def _sleep_then_return(delay: float, value: str) -> str:
    time.sleep(delay)
    return value


def _return_value(value: str) -> str:
    return value


def test_capture_timeout_does_not_wait_for_stuck_worker() -> None:
    started = time.monotonic()
    handler = object.__new__(BridgeHandlers)

    with pytest.raises(JSONRPCError, match="timed out"):
        handler._run_in_executor(_sleep_then_return, 2.0, "late", timeout=0.05)

    assert time.monotonic() - started < 0.5


def test_capture_after_timeout_still_runs() -> None:
    handler = object.__new__(BridgeHandlers)

    with pytest.raises(JSONRPCError, match="timed out"):
        handler._run_in_executor(_sleep_then_return, 0.5, "late", timeout=0.05)

    assert handler._run_in_executor(_return_value, "ready", timeout=1.0) == "ready"
