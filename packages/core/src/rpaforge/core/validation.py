from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from typing import Any


class ValidationError(Exception):
    """Raised when input validation fails."""

    pass


class LimitType(Enum):
    """Types of input limits."""

    STRING = "string"
    FILE_PATH = "file_path"
    EXPRESSION = "expression"
    VARIABLE_NAME = "variable_name"
    DIAGRAM_NODES = "diagram_nodes"


@dataclass
class LimitConfig:
    """Configuration for input limits."""

    max_string_length: int = 10240
    max_file_path_length: int = 4096
    max_expression_length: int = 1024
    max_variable_name_length: int = 100
    max_diagram_nodes: int = 10000


DEFAULT_LIMITS = LimitConfig()


def validate_string(value: str, limit: int = DEFAULT_LIMITS.max_string_length) -> str:
    """Validate string length.

    Args:
        value: String to validate
        limit: Maximum allowed length in bytes

    Returns:
        The validated string

    Raises:
        ValidationError: If string exceeds limit
    """
    if len(value) > limit:
        raise ValidationError(f"String length ({len(value)}) exceeds maximum ({limit})")
    return value


def validate_file_path(
    path: str, limit: int = DEFAULT_LIMITS.max_file_path_length
) -> str:
    """Validate file path length.

    Args:
        path: File path to validate
        limit: Maximum allowed length in bytes

    Returns:
        The validated file path

    Raises:
        ValidationError: If path exceeds limit
    """
    if len(path) > limit:
        raise ValidationError(
            f"File path length ({len(path)}) exceeds maximum ({limit})"
        )
    return path


def validate_expression(
    expr: str, limit: int = DEFAULT_LIMITS.max_expression_length
) -> str:
    """Validate expression length.

    Args:
        expr: Expression to validate
        limit: Maximum allowed length in bytes

    Returns:
        The validated expression

    Raises:
        ValidationError: If expression exceeds limit
    """
    if len(expr) > limit:
        raise ValidationError(
            f"Expression length ({len(expr)}) exceeds maximum ({limit})"
        )
    return expr


def validate_variable_name(
    name: str, limit: int = DEFAULT_LIMITS.max_variable_name_length
) -> str:
    """Validate variable name length and format.

    Args:
        name: Variable name to validate
        limit: Maximum allowed length

    Returns:
        The validated variable name

    Raises:
        ValidationError: If name exceeds limit or contains invalid characters
    """
    if len(name) > limit:
        raise ValidationError(
            f"Variable name length ({len(name)}) exceeds maximum ({limit})"
        )

    import re

    if not re.match(r"^[a-zA-Z_][a-zA-Z0-9_]*$", name):
        raise ValidationError(
            f"Variable name '{name}' contains invalid characters. "
            "Must start with letter or underscore and contain only alphanumeric and underscore."
        )
    return name


def validate_diagram_size(
    nodes: list[dict[str, Any]],
    edges: list[dict[str, Any]],
    limit: int = DEFAULT_LIMITS.max_diagram_nodes,
) -> None:
    """Validate diagram size.

    Args:
        nodes: List of diagram nodes
        edges: List of diagram edges
        limit: Maximum allowed number of nodes

    Raises:
        ValidationError: If diagram exceeds limits
    """
    if len(nodes) > limit:
        raise ValidationError(
            f"Diagram has {len(nodes)} nodes, exceeds maximum ({limit})"
        )


def validate_activity_params(params: dict[str, Any]) -> dict[str, Any]:
    """Validate activity parameters for length limits.

    Args:
        params: Activity parameters dictionary

    Returns:
        Validated parameters

    Raises:
        ValidationError: If any parameter exceeds limits
    """
    validated = {}
    for key, value in params.items():
        if isinstance(value, str):
            validate_string(value)
        validated[key] = value
    return validated


def sanitize_input(value: str) -> str:
    """Sanitize input by removing null bytes and controlling whitespace.

    Args:
        value: Input string to sanitize

    Returns:
        Sanitized string
    """
    sanitized = value.replace("\x00", "")
    if len(sanitized) > 10240:
        sanitized = sanitized[:10240]
    return sanitized
