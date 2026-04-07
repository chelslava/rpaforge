"""
RPAForge Activity SDK

Simple, clean SDK for creating RPA activities using Robot Framework.

All activities have:
- Built-in parameters: timeout, retry (optional), continueOnError (optional)
- Configurable parameters: defined by activity developer
- Base design: icon, color, ports
- Customizable design: optional

Activity types:
- LOOP: While, For Each - iteration
- CONDITION: If, Switch - branching
- CONTAINER: Scope, Application - grouping with context
- SYNC: Synchronous operations with timeout
- ASYNC: Asynchronous operations
- ERROR_HANDLER: Try Catch - exception handling
- CODE: Python code insertion
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Callable


class ActivityType(Enum):
    """Activity types - determines behavior and UI rendering."""

    LOOP = "loop"
    CONDITION = "condition"
    CONTAINER = "container"
    SYNC = "sync"
    ASYNC = "async"
    ERROR_HANDLER = "error_handler"
    CODE = "code"


class PortType(Enum):
    """Port types for connections."""

    FLOW = "flow"
    DATA = "data"
    ERROR = "error"


class ParamType(Enum):
    """Parameter types for activity properties."""

    STRING = "string"
    INTEGER = "integer"
    FLOAT = "float"
    BOOLEAN = "boolean"
    VARIABLE = "variable"
    EXPRESSION = "expression"
    SECRET = "secret"
    CODE = "code"
    LIST = "list"
    DICT = "dict"


@dataclass
class Port:
    """
    Connection port on activity.

    Activities can have multiple inputs/outputs.
    Example: If has 1 input, 2 outputs (true/false)
    """

    id: str
    type: PortType = PortType.FLOW
    label: str = ""
    required: bool = True

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "type": self.type.value,
            "label": self.label or self.id,
            "required": self.required,
        }


@dataclass
class Param:
    """
    Activity parameter - user-configurable property.

    Built-in parameters (always present):
    - timeout: Maximum execution time (ms)
    - retry: Retry configuration (optional per activity type)
    - continueOnError: Continue on failure (optional per activity type)

    Custom parameters are defined per activity.
    """

    name: str
    type: ParamType = ParamType.STRING
    label: str = ""
    description: str = ""
    default: Any = None
    required: bool = True
    options: list[str] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            "name": self.name,
            "type": self.type.value,
            "label": self.label or self.name,
            "description": self.description,
            "default": self.default,
            "required": self.required,
            "options": self.options,
        }


@dataclass
class ActivityMeta:
    """
    Activity metadata - complete definition.

    Every activity has:
    - Built-in settings (timeout, retry, continueOnError)
    - Configurable parameters (defined by developer)
    - Base design (icon, color from category)
    - Ports (inputs/outputs - can be multiple)
    """

    id: str
    name: str
    type: ActivityType
    category: str
    description: str = ""
    icon: str = "⚙"

    # Ports - can have multiple inputs/outputs
    inputs: list[Port] = field(default_factory=lambda: [Port("input")])
    outputs: list[Port] = field(default_factory=lambda: [Port("output")])

    # User-configurable parameters
    params: list[Param] = field(default_factory=list)

    # Built-in features (determined by activity type)
    has_timeout: bool = True
    has_retry: bool = False
    has_continue_on_error: bool = False
    has_nested: bool = False

    # Robot Framework integration
    rf_keyword: str = ""
    rf_library: str = "BuiltIn"

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "name": self.name,
            "type": self.type.value,
            "category": self.category,
            "description": self.description,
            "icon": self.icon,
            "ports": {
                "inputs": [p.to_dict() for p in self.inputs],
                "outputs": [p.to_dict() for p in self.outputs],
            },
            "params": [p.to_dict() for p in self.params],
            "builtin": {
                "timeout": self.has_timeout,
                "retry": self.has_retry,
                "continueOnError": self.has_continue_on_error,
                "nested": self.has_nested,
            },
            "robotFramework": {
                "keyword": self.rf_keyword,
                "library": self.rf_library,
            },
        }


# Global registry
_REGISTRY: dict[str, ActivityMeta] = {}


def activity(
    name: str,
    type: ActivityType,
    category: str,
    description: str = "",
    icon: str = "⚙",
    inputs: list[Port] | None = None,
    outputs: list[Port] | None = None,
    params: list[Param] | None = None,
    has_timeout: bool = True,
    has_retry: bool = False,
    has_continue_on_error: bool = False,
    has_nested: bool = False,
    rf_keyword: str = "",
    rf_library: str = "BuiltIn",
) -> Callable:
    """
    Decorator to define and register an activity.

    Usage:
        @activity(
            name="Click Element",
            type=ActivityType.SYNC,
            category="Web",
            description="Click on web element",
            icon="🖱",
            params=[
                Param("selector", ParamType.STRING, "CSS Selector", required=True),
                Param("wait", ParamType.INTEGER, "Wait time", default=5000),
            ],
            rf_keyword="Click Element",
            rf_library="SeleniumLibrary",
        )
        class ClickElement:
            def run(self, ctx):
                selector = ctx.get("selector")
                wait = ctx.get("wait", 5000)
                # Implementation
                return ctx.output("output", {"clicked": True})
    """

    def decorator(cls):
        meta = ActivityMeta(
            id=cls.__name__,
            name=name,
            type=type,
            category=category,
            description=description,
            icon=icon,
            inputs=inputs or [Port("input")],
            outputs=outputs or [Port("output")],
            params=params or [],
            has_timeout=has_timeout,
            has_retry=has_retry,
            has_continue_on_error=has_continue_on_error,
            has_nested=has_nested,
            rf_keyword=rf_keyword,
            rf_library=rf_library,
        )
        cls._meta = meta
        _REGISTRY[meta.id] = meta
        return cls

    return decorator


class ActivityContext:
    """
    Context passed to activity during execution.

    Provides access to:
    - Parameters (user-configured values)
    - Variables (process-level data)
    - Robot Framework keywords
    """

    def __init__(self, params: dict, variables: dict, builtin: dict | None = None):
        self._params = params
        self._variables = variables
        self._builtin = builtin or {}
        self._outputs: dict[str, Any] = {}

    def get(self, name: str, default: Any = None) -> Any:
        """Get parameter value."""
        return self._params.get(name, default)

    def get_var(self, name: str, default: Any = None) -> Any:
        """Get variable (${var} syntax supported)."""
        if name.startswith("${") and name.endswith("}"):
            name = name[2:-1]
        return self._variables.get(name, default)

    def set_var(self, name: str, value: Any) -> None:
        """Set variable (${var} syntax supported)."""
        if name.startswith("${") and name.endswith("}"):
            name = name[2:-1]
        self._variables[name] = value

    def get_timeout(self) -> int:
        """Get timeout in milliseconds."""
        return self._builtin.get("timeout", 30000)

    def get_retry(self) -> dict:
        """Get retry configuration."""
        return self._builtin.get("retry", {"enabled": False})

    def should_continue_on_error(self) -> bool:
        """Check if should continue on error."""
        return self._builtin.get("continueOnError", False)

    def output(self, port: str = "output", value: Any = None) -> dict:
        """Set output value."""
        self._outputs[port] = value
        return {"port": port, "value": value}

    def get_outputs(self) -> dict:
        """Get all outputs."""
        return self._outputs.copy()


# Registry functions
def get_activity(activity_id: str) -> ActivityMeta | None:
    """Get activity metadata by ID."""
    return _REGISTRY.get(activity_id)


def list_activities(category: str = "") -> list[ActivityMeta]:
    """List activities, optionally filtered by category."""
    activities = list(_REGISTRY.values())
    if category:
        activities = [a for a in activities if a.category == category]
    return activities


def list_categories() -> list[str]:
    """List all categories."""
    return sorted(set(a.category for a in _REGISTRY.values()))


# Helper functions
def port(id: str, type: PortType = PortType.FLOW, **kw) -> Port:
    """Create a port."""
    return Port(id, type=type, **kw)


def param(name: str, type: ParamType = ParamType.STRING, **kw) -> Param:
    """Create a parameter."""
    return Param(name, type=type, **kw)
