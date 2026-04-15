"""
RPAForge Activity API.

Native decorators and registry for activities without Robot Framework.
"""

from __future__ import annotations

import logging
from collections.abc import Callable
from dataclasses import dataclass, field
from enum import Enum
from functools import wraps
from inspect import signature
from typing import Any

logger = logging.getLogger("rpaforge")


class ActivityType(Enum):
    """Activity execution types."""

    SYNC = "sync"
    ASYNC = "async"
    LOOP = "loop"
    CONDITION = "condition"
    CONTAINER = "container"
    ERROR_HANDLER = "error_handler"
    CODE = "code"


@dataclass
class ActivityMeta:
    """Metadata for an activity."""

    id: str
    name: str
    library: str
    category: str = "general"
    description: str = ""
    tags: list[str] = field(default_factory=list)
    activity_type: ActivityType = ActivityType.SYNC
    timeout_ms: int = 30000
    has_retry: bool = False
    has_continue_on_error: bool = False

    params: list[dict[str, Any]] = field(default_factory=list)

    has_output: bool = False
    output_description: str = ""

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "name": self.name,
            "library": self.library,
            "category": self.category,
            "description": self.description,
            "tags": self.tags,
            "type": self.activity_type.value,
            "timeout_ms": self.timeout_ms,
            "has_retry": self.has_retry,
            "has_continue_on_error": self.has_continue_on_error,
            "params": self.params,
            "has_output": self.has_output,
            "output_description": self.output_description,
        }


@dataclass
class LibraryMeta:
    """Metadata for a library."""

    name: str
    category: str = "general"
    description: str = ""
    icon: str = "⚙"
    scope: str = "GLOBAL"


ACTIVITY_REGISTRY: dict[str, ActivityMeta] = {}
LIBRARY_REGISTRY: dict[str, tuple[type, LibraryMeta]] = {}


def activity(
    name: str | None = None,
    category: str = "general",
    tags: list[str] | None = None,
    activity_type: ActivityType = ActivityType.SYNC,
    timeout_ms: int = 30000,
    has_retry: bool = False,
    has_continue_on_error: bool = False,
) -> Callable[[Callable], Callable]:
    """Decorator to register an activity."""

    def decorator(func: Callable) -> Callable:
        activity_name = name or func.__name__.replace("_", " ").title()
        activity_id = func.__name__

        func_tags = tags or []
        if hasattr(func, "_activity_tags"):
            func_tags = func._activity_tags + func_tags

        params = _extract_params(func)

        has_output = getattr(func, "_has_output", False)
        output_description = getattr(func, "_output_description", "")

        meta = ActivityMeta(
            id=activity_id,
            name=activity_name,
            library="",
            category=category,
            tags=func_tags,
            activity_type=activity_type,
            timeout_ms=timeout_ms,
            has_retry=has_retry,
            has_continue_on_error=has_continue_on_error,
            params=params,
            has_output=has_output,
            output_description=output_description,
        )

        func._activity_meta = meta

        if meta.library:
            full_id = f"{meta.library}.{activity_id}"
            ACTIVITY_REGISTRY[full_id] = meta
        else:
            ACTIVITY_REGISTRY[activity_id] = meta

        @wraps(func)
        def wrapper(*args: Any, **kwargs: Any) -> Any:
            logger.debug(f"Executing activity: {activity_name}")
            return func(*args, **kwargs)

        wrapper._activity_meta = meta
        return wrapper

    return decorator


def tags(*tag_list: str) -> Callable[[Callable], Callable]:
    """Decorator to add tags to an activity."""

    def decorator(func: Callable) -> Callable:
        func._activity_tags = list(tag_list)
        return func

    return decorator


def param(
    name: str,
    type: str = "string",
    label: str | None = None,
    description: str = "",
    options: list[str] | None = None,
) -> Callable[[Callable], Callable]:
    """Decorator to specify parameter metadata.

    :param name: Parameter name.
    :param type: Parameter type (string, integer, float, boolean, variable, expression, secret, code, list, dict).
    :param label: Display label (defaults to name).
    :param description: Parameter description.
    :param options: List of allowed values for enum-like parameters.
    """

    def decorator(func: Callable) -> Callable:
        if not hasattr(func, "_param_overrides"):
            func._param_overrides = {}
        func._param_overrides[name] = {
            "type": type,
            "label": label or name.replace("_", " ").title(),
            "description": description,
            "options": options or [],
        }
        return func

    return decorator


def output(
    description: str = "",
) -> Callable[[Callable], Callable]:
    """Decorator to mark that an activity returns a value that can be saved to a variable.

    :param description: Description of what the output represents.
    """

    def decorator(func: Callable) -> Callable:
        func._has_output = True
        func._output_description = description
        return func

    return decorator


def library(
    name: str | None = None,
    category: str = "general",
    description: str = "",
    icon: str = "⚙",
    scope: str = "GLOBAL",
) -> Callable[[type], type]:
    """Decorator to register a library class."""

    def decorator(cls: type) -> type:
        lib_name = name or cls.__name__
        meta = LibraryMeta(
            name=lib_name,
            category=category,
            description=description,
            icon=icon,
            scope=scope,
        )

        cls._library_meta = meta
        cls._library_name = lib_name
        LIBRARY_REGISTRY[lib_name] = (cls, meta)

        for attr_name in dir(cls):
            if attr_name.startswith("_"):
                continue
            attr = getattr(cls, attr_name)
            if callable(attr) and hasattr(attr, "_activity_meta"):
                base_meta = attr._activity_meta
                activity_id = base_meta.id
                full_id = f"{lib_name}.{activity_id}"
                if full_id in ACTIVITY_REGISTRY:
                    continue
                if activity_id in ACTIVITY_REGISTRY:
                    del ACTIVITY_REGISTRY[activity_id]
                library_meta = ActivityMeta(
                    id=activity_id,
                    name=base_meta.name,
                    library=lib_name,
                    category=base_meta.category,
                    description=base_meta.description,
                    tags=base_meta.tags.copy(),
                    activity_type=base_meta.activity_type,
                    timeout_ms=base_meta.timeout_ms,
                    has_retry=base_meta.has_retry,
                    has_continue_on_error=base_meta.has_continue_on_error,
                    params=base_meta.params.copy() if base_meta.params else [],
                    has_output=base_meta.has_output,
                    output_description=base_meta.output_description,
                )
                attr._activity_meta = library_meta
                ACTIVITY_REGISTRY[full_id] = library_meta

        return cls

    return decorator


def _extract_params(func: Callable) -> list[dict[str, Any]]:
    """Extract parameter info from function signature."""
    params = []
    sig = signature(func)
    param_overrides = getattr(func, "_param_overrides", {})

    for param_name, param_info in sig.parameters.items():
        if param_name in ("self", "cls"):
            continue

        required = param_info.default is param_info.empty
        default = None if required else param_info.default

        override = param_overrides.get(param_name, {})

        if "type" in override:
            param_type = override["type"]
        else:
            param_type = "string"
            if param_info.annotation is bool:
                param_type = "boolean"
            elif param_info.annotation is int:
                param_type = "integer"
            elif param_info.annotation is float:
                param_type = "float"
            elif param_info.annotation is list:
                param_type = "list"
            elif param_info.annotation is dict:
                param_type = "dict"

        params.append(
            {
                "name": param_name,
                "type": param_type,
                "label": override.get("label", param_name.replace("_", " ").title()),
                "description": override.get("description", ""),
                "required": required,
                "default": default,
                "options": override.get("options", []),
            }
        )

    return params


def _get_library_name(func: Callable) -> str:
    """Get library name from function's class if available."""
    if hasattr(func, "__self__"):
        cls = func.__self__.__class__
        if hasattr(cls, "_library_name"):
            return cls._library_name
    for lib_name, (cls, _) in LIBRARY_REGISTRY.items():
        if hasattr(cls, func.__name__):
            method = getattr(cls, func.__name__)
            if method.__name__ == func.__name__:
                return lib_name
    return ""


def get_activity(activity_id: str) -> ActivityMeta | None:
    """Get activity metadata by ID."""
    return ACTIVITY_REGISTRY.get(activity_id)


def list_activities(library: str = "") -> list[ActivityMeta]:
    """List all activities, optionally filtered by library."""
    activities = list(ACTIVITY_REGISTRY.values())
    if library:
        activities = [a for a in activities if a.library == library]
    return activities


def list_libraries() -> list[LibraryMeta]:
    """List all registered libraries."""
    return [meta for _, meta in LIBRARY_REGISTRY.values()]


def register_library_instance(name: str, instance: Any) -> None:
    """Register a library instance for execution."""
    if hasattr(instance, "_library_meta"):
        LIBRARY_REGISTRY[name] = (instance.__class__, instance._library_meta)


def get_registry_stats() -> dict[str, Any]:
    """Get statistics about the activity registry."""
    libraries = {}
    categories = {}

    for activity in ACTIVITY_REGISTRY.values():
        libraries[activity.library] = libraries.get(activity.library, 0) + 1
        categories[activity.category] = categories.get(activity.category, 0) + 1

    return {
        "total_activities": len(ACTIVITY_REGISTRY),
        "total_libraries": len(LIBRARY_REGISTRY),
        "by_library": libraries,
        "by_category": categories,
    }
