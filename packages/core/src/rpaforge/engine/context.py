"""
RPAForge Studio Context.

Extended execution context with debugging and monitoring capabilities.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Any

from robot.running.context import EXECUTION_CONTEXTS

if TYPE_CHECKING:
    from robot.running import TestCase, TestSuite
    from robot.variables import Variables


@dataclass
class StudioContext:
    """Extended execution context for RPAForge.

    Provides access to the current execution state, variables,
    and debugging information.
    """

    suite: TestSuite | None = None
    test: TestCase | None = None
    variables: Variables | None = None
    step_index: int = 0
    is_debugging: bool = False
    breakpoints_hit: list[str] = field(default_factory=list)

    @classmethod
    def current(cls) -> StudioContext | None:
        """Get the current execution context.

        :returns: Current StudioContext or None if not executing.
        """
        robot_ctx = EXECUTION_CONTEXTS.current
        if robot_ctx is None:
            return None

        return cls(
            suite=robot_ctx.suite,
            test=robot_ctx.test,
            variables=robot_ctx.variables,
        )

    def get_variable(self, name: str, default: Any = None) -> Any:
        """Get a variable value from the current context.

        :param name: Variable name (with or without ${}).
        :param default: Default value if variable not found.
        :returns: Variable value or default.
        """
        if self.variables is None:
            return default

        name = name.strip("${}")
        try:
            return self.variables[name]
        except KeyError:
            return default

    def set_variable(self, name: str, value: Any) -> None:
        """Set a variable in the current context.

        :param name: Variable name (with or without ${}).
        :param value: Variable value.
        """
        if self.variables is None:
            return

        name = name.strip("${}")
        self.variables[name] = value

    def get_all_variables(self) -> dict[str, Any]:
        """Get all variables from the current context.

        :returns: Dictionary of variable names to values.
        """
        if self.variables is None:
            return {}
        return dict(self.variables)

    @property
    def suite_name(self) -> str | None:
        """Get the current suite name."""
        return self.suite.name if self.suite else None

    @property
    def test_name(self) -> str | None:
        """Get the current test/task name."""
        return self.test.name if self.test else None
