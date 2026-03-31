"""
RPAForge Studio Engine.

Main execution engine that wraps Robot Framework with extended capabilities.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

from robot.api import ExecutionResult, TestSuite
from robot.running import TestSuiteBuilder

if TYPE_CHECKING:
    from pathlib import Path

    from rpaforge.debugger import Debugger


class StudioEngine:
    """Main execution engine for RPAForge.

    This class wraps Robot Framework's execution capabilities and adds:
    - Debugging support (breakpoints, stepping, variable watching)
    - Recording support (capturing user actions)
    - IPC bridge for UI communication

    Example:
        >>> engine = StudioEngine()
        >>> result = engine.run_file("process.robot")
        >>> print(result.suite.status)
        PASS

        >>> # Or run inline Robot Framework code
        >>> result = engine.run_string('''
        ... *** Tasks ***
        ... My Task
        ...     Log    Hello World
        ... ''')
    """

    def __init__(
        self,
        debugger: Debugger | None = None,
        output_dir: str | Path | None = None,
    ):
        """Initialize the studio engine.

        :param debugger: Optional debugger instance for debugging support.
        :param output_dir: Directory for output files (logs, reports).
        """
        self._debugger = debugger
        self._output_dir = output_dir
        self._is_running = False
        self._current_suite: TestSuite | None = None

    @property
    def is_running(self) -> bool:
        """Check if the engine is currently executing a process."""
        return self._is_running

    @property
    def debugger(self) -> Debugger | None:
        """Get the debugger instance."""
        return self._debugger

    def create_process(self, name: str) -> ProcessBuilder:
        """Create a new process builder for programmatic process creation.

        :param name: Name of the process.
        :returns: A ProcessBuilder instance.

        Example:
            >>> builder = engine.create_process("My Process")
            >>> builder.add_task("Task 1", [
            ...     ("Log", ["Hello"]),
            ...     ("Set Variable", ["${name}", "World"]),
            ... ])
            >>> suite = builder.build()
            >>> result = engine.run(suite)
        """
        return ProcessBuilder(name)

    def run_file(
        self,
        path: str | Path,
        **options: Any,
    ) -> ExecutionResult:
        """Run a Robot Framework file.

        :param path: Path to the .robot file.
        :param options: Additional options passed to Robot Framework.
        :returns: Execution result.
        """
        builder = TestSuiteBuilder()
        suite = builder.build(str(path))
        return self.run(suite, **options)

    def run_string(
        self,
        source: str,
        **options: Any,
    ) -> ExecutionResult:
        """Run Robot Framework source from a string.

        :param source: Robot Framework source code.
        :param options: Additional options passed to Robot Framework.
        :returns: Execution result.

        Example:
            >>> result = engine.run_string('''
            ... *** Settings ***
            ... Library    BuiltIn
            ...
            ... *** Tasks ***
            ... Example
            ...     Log    Hello
            ... ''')
        """
        suite = TestSuite.from_string(source)
        return self.run(suite, **options)

    def run(
        self,
        suite: TestSuite,
        listener: Any = None,
        **options: Any,
    ) -> ExecutionResult:
        """Execute a test suite.

        :param suite: TestSuite to execute.
        :param listener: Optional listener for execution events.
        :param options: Additional execution options.
        :returns: Execution result.
        """
        self._is_running = True
        self._current_suite = suite

        try:
            if self._debugger:
                return self._run_with_debugger(suite, listener, **options)
            return suite.run(
                outputdir=self._output_dir,
                listener=listener,
                **options,
            )
        finally:
            self._is_running = False
            self._current_suite = None

    def _run_with_debugger(
        self,
        suite: TestSuite,
        listener: Any,
        **options: Any,
    ) -> ExecutionResult:
        """Run suite with debugger attached."""
        debugger_listener = self._debugger.create_listener()
        listeners = [debugger_listener]
        if listener:
            listeners.append(listener)

        return suite.run(
            outputdir=self._output_dir,
            listener=listeners,
            **options,
        )

    def stop(self) -> None:
        """Stop the current execution."""
        self._is_running = False

    def pause(self) -> None:
        """Pause the current execution (for debugging)."""
        if self._debugger:
            self._debugger.pause()

    def resume(self) -> None:
        """Resume a paused execution."""
        if self._debugger:
            self._debugger.resume()
