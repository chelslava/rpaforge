"""RPAForge Variables Library - Variable management operations."""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING, Any

from rpaforge.core.activity import activity, library, output, param, tags

if TYPE_CHECKING:
    pass

logger = logging.getLogger("rpaforge.variables")


@library(name="Variables", category="Data", icon="📦")
class Variables:
    """Variable management operations library."""

    def __init__(self):
        self._variables: dict[str, Any] = {}

    @activity(name="Set Variable", category="Variables")
    @tags("variable", "set")
    @output("The value that was set")
    @param("name", type="variable", description="Variable name to set")
    def set_variable(
        self,
        name: str,
        value: Any,
    ) -> Any:
        """Set a variable value.

        :param name: Variable name.
        :param value: Value to set.
        :returns: The value that was set.
        """
        self._variables[name] = value
        logger.info(f"Set variable: {name} = {value!r}")
        return value

    @activity(name="Get Variable", category="Variables")
    @tags("variable", "get")
    @output("Variable value or default")
    @param("name", type="variable", description="Variable name to get")
    def get_variable(
        self,
        name: str,
        default: Any | None = None,
    ) -> Any:
        """Get a variable value.

        :param name: Variable name.
        :param default: Default value if variable doesn't exist.
        :returns: Variable value or default.
        :raises KeyError: If variable doesn't exist and no default provided.
        """
        if name not in self._variables:
            if default is not None:
                return default
            raise KeyError(f"Variable '{name}' not found")
        return self._variables[name]

    @activity(name="Clear Variable", category="Variables")
    @tags("variable", "clear")
    @output("True if variable was cleared, False if it didn't exist")
    @param("name", type="variable", description="Variable name to clear")
    def clear_variable(
        self,
        name: str,
    ) -> bool:
        """Clear (delete) a variable.

        :param name: Variable name.
        :returns: True if variable was cleared, False if it didn't exist.
        """
        if name in self._variables:
            del self._variables[name]
            logger.info(f"Cleared variable: {name}")
            return True
        return False

    @activity(name="Variable Exists", category="Variables")
    @tags("variable", "check")
    @output("True if variable exists")
    @param("name", type="variable", description="Variable name to check")
    def variable_exists(
        self,
        name: str,
    ) -> bool:
        """Check if a variable exists.

        :param name: Variable name.
        :returns: True if variable exists.
        """
        return name in self._variables

    @activity(name="Clear All Variables", category="Variables")
    @tags("variable", "clear")
    @output("Number of variables that were cleared")
    def clear_all_variables(self) -> int:
        """Clear all variables.

        :returns: Number of variables that were cleared.
        """
        count = len(self._variables)
        self._variables.clear()
        logger.info(f"Cleared {count} variables")
        return count

    @activity(name="Get Variable Names", category="Variables")
    @tags("variable", "list")
    @output("List of variable names")
    def get_variable_names(self) -> list[str]:
        """Get all variable names.

        :returns: List of variable names.
        """
        return list(self._variables.keys())

    @activity(name="Get Variable Count", category="Variables")
    @tags("variable", "info")
    @output("Number of variables")
    def get_variable_count(self) -> int:
        """Get the number of variables.

        :returns: Number of variables.
        """
        return len(self._variables)

    @activity(name="Get All Variables", category="Variables")
    @tags("variable", "list")
    @output("Dictionary of all variables")
    def get_all_variables(self) -> dict[str, Any]:
        """Get all variables as a dictionary.

        :returns: Dictionary of all variables.
        """
        return dict(self._variables)

    @activity(name="Set Variables From Dict", category="Variables")
    @tags("variable", "set", "bulk")
    @output("Number of variables set")
    def set_variables_from_dict(
        self,
        variables: dict[str, Any],
        overwrite: bool = True,
    ) -> int:
        """Set multiple variables from a dictionary.

        :param variables: Dictionary of variable names and values.
        :param overwrite: Whether to overwrite existing variables.
        :returns: Number of variables set.
        """
        count = 0
        for name, value in variables.items():
            if overwrite or name not in self._variables:
                self._variables[name] = value
                count += 1
        logger.info(f"Set {count} variables from dict")
        return count

    @activity(name="Adjust Variable", category="Variables")
    @tags("variable", "math")
    @output("New value after operation")
    @param("name", type="variable", description="Variable name to adjust")
    @param(
        "operation",
        type="string",
        options=["increment", "decrement"],
        description="Operation to perform",
    )
    def adjust_variable(
        self,
        name: str,
        amount: int | float = 1,
        operation: str = "increment",
    ) -> int | float:
        """Increment or decrement a numeric variable.

        :param name: Variable name.
        :param amount: Amount to add or subtract (default: 1).
        :param operation: Operation - increment or decrement.
        :returns: New value after operation.
        :raises KeyError: If variable doesn't exist.
        :raises TypeError: If variable is not numeric.
        """
        if name not in self._variables:
            raise KeyError(f"Variable '{name}' not found")

        value = self._variables[name]
        if not isinstance(value, (int, float)):
            raise TypeError(f"Variable '{name}' is not numeric: {type(value).__name__}")

        if operation.lower() == "decrement":
            new_value = value - amount
        else:
            new_value = value + amount

        self._variables[name] = new_value
        return new_value

    @activity(name="Append To List Variable", category="Variables")
    @tags("variable", "list")
    @output("Updated list")
    @param("name", type="variable", description="List variable name")
    def append_to_list(
        self,
        name: str,
        value: Any,
    ) -> list[Any]:
        """Append a value to a list variable.

        :param name: Variable name.
        :param value: Value to append.
        :returns: Updated list.
        :raises KeyError: If variable doesn't exist.
        :raises TypeError: If variable is not a list.
        """
        if name not in self._variables:
            raise KeyError(f"Variable '{name}' not found")

        current = self._variables[name]
        if not isinstance(current, list):
            raise TypeError(
                f"Variable '{name}' is not a list: {type(current).__name__}"
            )

        current.append(value)
        return current

    @activity(name="Extend List Variable", category="Variables")
    @tags("variable", "list")
    @output("Updated list")
    @param("name", type="variable", description="List variable name")
    def extend_list(
        self,
        name: str,
        values: list[Any],
    ) -> list[Any]:
        """Extend a list variable with another list.

        :param name: Variable name.
        :param values: Values to append.
        :returns: Updated list.
        :raises KeyError: If variable doesn't exist.
        :raises TypeError: If variable is not a list.
        """
        if name not in self._variables:
            raise KeyError(f"Variable '{name}' not found")

        current = self._variables[name]
        if not isinstance(current, list):
            raise TypeError(
                f"Variable '{name}' is not a list: {type(current).__name__}"
            )

        current.extend(values)
        return current

    @activity(name="Get List Length", category="Variables")
    @tags("variable", "list")
    @output("Length of the list")
    @param("name", type="variable", description="List variable name")
    def get_list_length(
        self,
        name: str,
    ) -> int:
        """Get the length of a list variable.

        :param name: Variable name.
        :returns: Length of the list.
        :raises KeyError: If variable doesn't exist.
        :raises TypeError: If variable is not a list.
        """
        if name not in self._variables:
            raise KeyError(f"Variable '{name}' not found")

        value = self._variables[name]
        if not isinstance(value, list):
            raise TypeError(f"Variable '{name}' is not a list: {type(value).__name__}")

        return len(value)

    @activity(name="Get Dict Keys", category="Variables")
    @tags("variable", "dict")
    @output("List of keys")
    @param("name", type="variable", description="Dictionary variable name")
    def get_dict_keys(
        self,
        name: str,
    ) -> list[str]:
        """Get the keys of a dictionary variable.

        :param name: Variable name.
        :returns: List of keys.
        :raises KeyError: If variable doesn't exist.
        :raises TypeError: If variable is not a dict.
        """
        if name not in self._variables:
            raise KeyError(f"Variable '{name}' not found")

        value = self._variables[name]
        if not isinstance(value, dict):
            raise TypeError(f"Variable '{name}' is not a dict: {type(value).__name__}")

        return list(value.keys())

    @activity(name="Get Dict Value", category="Variables")
    @tags("variable", "dict")
    @output("Dictionary value or default")
    @param("name", type="variable", description="Dictionary variable name")
    def get_dict_value(
        self,
        name: str,
        key: str,
        default: Any | None = None,
    ) -> Any:
        """Get a value from a dictionary variable.

        :param name: Variable name.
        :param key: Dictionary key.
        :param default: Default value if key doesn't exist.
        :returns: Dictionary value or default.
        :raises KeyError: If variable doesn't exist.
        :raises TypeError: If variable is not a dict.
        """
        if name not in self._variables:
            raise KeyError(f"Variable '{name}' not found")

        value = self._variables[name]
        if not isinstance(value, dict):
            raise TypeError(f"Variable '{name}' is not a dict: {type(value).__name__}")

        return value.get(key, default)

    @activity(name="Set Dict Value", category="Variables")
    @tags("variable", "dict")
    @output("Updated dictionary")
    @param("name", type="variable", description="Dictionary variable name")
    def set_dict_value(
        self,
        name: str,
        key: str,
        value: Any,
    ) -> dict[str, Any]:
        """Set a value in a dictionary variable.

        :param name: Variable name.
        :param key: Dictionary key.
        :param value: Value to set.
        :returns: Updated dictionary.
        :raises KeyError: If variable doesn't exist.
        :raises TypeError: If variable is not a dict.
        """
        if name not in self._variables:
            raise KeyError(f"Variable '{name}' not found")

        current = self._variables[name]
        if not isinstance(current, dict):
            raise TypeError(
                f"Variable '{name}' is not a dict: {type(current).__name__}"
            )

        current[key] = value
        return current

    @activity(name="Convert Variable", category="Variables")
    @tags("variable", "convert")
    @output("Converted value")
    @param("name", type="variable", description="Variable name to convert")
    @param(
        "target_type",
        type="string",
        options=["string", "integer", "float", "boolean"],
        description="Target type",
    )
    def convert_variable(
        self,
        name: str,
        target_type: str = "string",
    ) -> str | int | float | bool:
        """Convert a variable value to a different type.

        :param name: Variable name.
        :param target_type: Target type - string, integer, float, or boolean.
        :returns: Converted value.
        :raises KeyError: If variable doesn't exist.
        :raises ValueError: If conversion fails.
        """
        if name not in self._variables:
            raise KeyError(f"Variable '{name}' not found")

        value = self._variables[name]
        target_type = target_type.lower()

        if target_type == "string":
            return str(value)
        elif target_type == "integer":
            return int(value)
        elif target_type == "float":
            return float(value)
        elif target_type == "boolean":
            return bool(value)
        return str(value)

    @activity(name="Get Variable Type", category="Variables")
    @tags("variable", "info")
    @output("Type name as string")
    @param("name", type="variable", description="Variable name to check")
    def get_variable_type(
        self,
        name: str,
    ) -> str:
        """Get the type of a variable.

        :param name: Variable name.
        :returns: Type name as string.
        :raises KeyError: If variable doesn't exist.
        """
        if name not in self._variables:
            raise KeyError(f"Variable '{name}' not found")
        return type(self._variables[name]).__name__
