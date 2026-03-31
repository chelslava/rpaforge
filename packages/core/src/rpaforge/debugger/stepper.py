"""
RPAForge Stepper Module.

Step execution control for debugging.
"""

from __future__ import annotations

from enum import Enum
from threading import Event


class StepMode(Enum):
    """Step execution mode."""

    CONTINUE = "continue"  # Run until breakpoint
    STEP_OVER = "step_over"  # Step over current keyword
    STEP_INTO = "step_into"  # Step into current keyword
    STEP_OUT = "step_out"  # Step out of current keyword


class Stepper:
    """Controls step-by-step execution for debugging.

    This class manages the stepping state and provides
    synchronization for pausing execution.
    """

    def __init__(self):
        self._mode = StepMode.CONTINUE
        self._pause_event = Event()
        self._pause_event.set()  # Start in running state
        self._step_depth = 0
        self._current_depth = 0
        self._steps_remaining = 0

    @property
    def mode(self) -> StepMode:
        """Get current step mode."""
        return self._mode

    @property
    def is_paused(self) -> bool:
        """Check if execution is paused."""
        return not self._pause_event.is_set()

    def pause(self) -> None:
        """Pause execution."""
        self._pause_event.clear()

    def resume(self) -> None:
        """Resume execution."""
        self._mode = StepMode.CONTINUE
        self._pause_event.set()

    def step_over(self) -> None:
        """Step over the current line/keyword."""
        self._mode = StepMode.STEP_OVER
        self._step_depth = self._current_depth
        self._pause_event.set()

    def step_into(self) -> None:
        """Step into the current keyword."""
        self._mode = StepMode.STEP_INTO
        self._pause_event.set()

    def step_out(self) -> None:
        """Step out of the current keyword."""
        self._mode = StepMode.STEP_OUT
        self._step_depth = self._current_depth - 1
        self._pause_event.set()

    def should_pause(
        self,
        depth: int,
        is_keyword_start: bool = False,
    ) -> bool:
        """Check if execution should pause at this point.

        :param depth: Current call depth.
        :param is_keyword_start: Whether this is the start of a keyword.
        :returns: True if execution should pause.
        """
        self._current_depth = depth

        if self._mode == StepMode.CONTINUE:
            return False

        if self._mode == StepMode.STEP_INTO:
            return is_keyword_start

        if self._mode == StepMode.STEP_OVER:
            return is_keyword_start and depth <= self._step_depth

        if self._mode == StepMode.STEP_OUT:
            return depth <= self._step_depth

        return False

    def wait_if_paused(self, timeout: float | None = None) -> bool:
        """Wait if execution is paused.

        :param timeout: Maximum time to wait (None = indefinitely).
        :returns: True if resumed, False if timeout.
        """
        return self._pause_event.wait(timeout)

    def on_keyword_start(self, depth: int) -> None:
        """Handle keyword start event.

        :param depth: Current call depth.
        """
        if self.should_pause(depth, is_keyword_start=True):
            self.pause()

    def on_keyword_end(self, depth: int) -> None:
        """Handle keyword end event.

        :param depth: Current call depth.
        """
        pass  # Currently not used, but available for future features

    def reset(self) -> None:
        """Reset stepper to initial state."""
        self._mode = StepMode.CONTINUE
        self._pause_event.set()
        self._step_depth = 0
        self._current_depth = 0
        self._steps_remaining = 0
