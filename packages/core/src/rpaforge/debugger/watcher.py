"""
RPAForge Variable Watcher.

Monitors and tracks variable changes during execution.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass
class VariableChange:
    """Represents a change to a variable."""

    name: str
    old_value: Any
    new_value: Any
    timestamp: float
    scope: str  # 'local', 'test', 'suite', 'global'


class VariableWatcher:
    """Watches variables for changes during execution.

    This class tracks variable changes and provides
    the ability to set watch expressions.
    """

    def __init__(self):
        self._watches: set[str] = set()
        self._changes: list[VariableChange] = []
        self._previous_values: dict[str, Any] = {}
        self._max_changes: int = 1000

    def add_watch(self, name: str) -> None:
        """Add a variable to watch.

        :param name: Variable name (with or without ${}).
        """
        name = name.strip("${}")
        self._watches.add(name)

    def remove_watch(self, name: str) -> None:
        """Remove a variable watch.

        :param name: Variable name.
        """
        name = name.strip("${}")
        self._watches.discard(name)

    def get_watches(self) -> set[str]:
        """Get all watched variables.

        :returns: Set of watched variable names.
        """
        return self._watches.copy()

    def clear_watches(self) -> None:
        """Clear all variable watches."""
        self._watches.clear()

    def check(
        self,
        variables: dict[str, Any],
        scope: str = "local",
    ) -> list[VariableChange]:
        """Check for variable changes.

        :param variables: Current variable dictionary.
        :param scope: Current scope name.
        :returns: List of changes detected.
        """
        import time

        changes = []

        for name in self._watches:
            if name in variables:
                new_value = variables[name]
                old_value = self._previous_values.get(name)

                if old_value != new_value:
                    change = VariableChange(
                        name=name,
                        old_value=old_value,
                        new_value=new_value,
                        timestamp=time.time(),
                        scope=scope,
                    )
                    changes.append(change)
                    self._add_change(change)
                    self._previous_values[name] = new_value

        return changes

    def _add_change(self, change: VariableChange) -> None:
        """Add a change to the history.

        :param change: The change to add.
        """
        self._changes.append(change)
        if len(self._changes) > self._max_changes:
            self._changes = self._changes[-self._max_changes :]

    def get_changes(
        self,
        variable_name: str | None = None,
        since: float | None = None,
    ) -> list[VariableChange]:
        """Get variable changes.

        :param variable_name: Optional filter by variable name.
        :param since: Optional filter by timestamp.
        :returns: List of changes.
        """
        changes = self._changes

        if variable_name:
            variable_name = variable_name.strip("${}")
            changes = [c for c in changes if c.name == variable_name]

        if since is not None:
            changes = [c for c in changes if c.timestamp >= since]

        return changes

    def get_last_value(self, name: str) -> Any:
        """Get the last known value for a variable.

        :param name: Variable name.
        :returns: Last known value or None.
        """
        name = name.strip("${}")
        return self._previous_values.get(name)

    def clear_history(self) -> None:
        """Clear the change history."""
        self._changes.clear()

    def reset(self) -> None:
        """Reset the watcher to initial state."""
        self._watches.clear()
        self._changes.clear()
        self._previous_values.clear()
