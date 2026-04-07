"""
Activity Registry - Auto-discovery from Robot Framework libraries.

Scans RF libraries for keywords and registers them as SDK activities.
"""

from __future__ import annotations

import importlib
import inspect
from typing import TYPE_CHECKING, Any

from rpaforge.sdk import (
    ActivityMeta,
    ActivityType,
    Param,
    ParamType,
    Port,
    PortType,
    _REGISTRY,
)

if TYPE_CHECKING:
    from collections.abc import Callable


def discover_library_keywords(
    library_class: type,
    library_name: str,
    category: str,
    icon: str = "⚙",
) -> list[ActivityMeta]:
    """Discover keywords from a Robot Framework library class.

    :param library_class: The library class to scan.
    :param library_name: Name of the library (e.g., "DesktopUI", "WebUI").
    :param category: Category for activities (e.g., "Desktop", "Web").
    :param icon: Default icon for activities.
    :returns: List of discovered ActivityMeta objects.
    """
    activities = []

    for name, method in inspect.getmembers(library_class, predicate=inspect.isfunction):
        if name.startswith("_"):
            continue

        keyword_name = _to_keyword_name(name)

        tags = []
        if hasattr(method, "robot_tags"):
            tags = method.robot_tags
        elif hasattr(method, "tags"):
            tags = getattr(method, "tags", [])

        doc = inspect.getdoc(method) or ""
        description = doc.split("\n\n")[0] if doc else ""

        params = _extract_params(method, library_class)

        activity_type = _determine_activity_type(tags, name)

        has_retry = "retry" in tags or "retry" in name.lower()
        has_timeout = "timeout" in tags or any(p.name == "timeout" for p in params)

        meta = ActivityMeta(
            id=f"{library_name}.{name}",
            name=keyword_name,
            type=activity_type,
            category=category,
            description=description,
            icon=icon,
            inputs=[Port("input", PortType.FLOW, "Input")],
            outputs=[Port("output", PortType.FLOW, "Output")],
            params=params,
            has_timeout=has_timeout,
            has_retry=has_retry,
            has_continue_on_error=False,
            rf_keyword=keyword_name,
            rf_library=f"RPAForge.{library_name}",
        )

        activities.append(meta)

    return activities


def _to_keyword_name(method_name: str) -> str:
    """Convert method name to Robot Framework keyword name.

    :param method_name: Python method name (snake_case).
    :returns: RF keyword name (Title Case with spaces).
    """
    return method_name.replace("_", " ").title()


def _extract_params(method: Callable, library_class: type) -> list[Param]:
    """Extract parameters from method signature.

    :param method: The method to extract parameters from.
    :param library_class: The library class (for self reference).
    :returns: List of Param objects.
    """
    params = []
    sig = inspect.signature(method)

    for param_name, param_info in sig.parameters.items():
        if param_name in ("self", "cls"):
            continue

        param_type = _infer_param_type(param_info.annotation, param_name)
        default = None
        required = param_info.default is inspect.Parameter.empty

        if param_info.default is not inspect.Parameter.empty:
            default = param_info.default

        param = Param(
            name=param_name,
            type=param_type,
            label=_to_label(param_name),
            description="",
            default=default,
            required=required,
        )
        params.append(param)

    return params


def _infer_param_type(annotation: Any, param_name: str) -> ParamType:
    """Infer parameter type from annotation or name.

    :param annotation: Type annotation.
    :param param_name: Parameter name.
    :returns: ParamType.
    """
    if annotation == bool:
        return ParamType.BOOLEAN
    if annotation == int:
        return ParamType.INTEGER
    if annotation == float:
        return ParamType.FLOAT
    if annotation == list:
        return ParamType.LIST
    if annotation == dict:
        return ParamType.DICT

    name_lower = param_name.lower()
    if "timeout" in name_lower:
        return ParamType.STRING
    if "selector" in name_lower or "locator" in name_lower:
        return ParamType.STRING
    if "text" in name_lower or "value" in name_lower:
        return ParamType.STRING
    if "path" in name_lower or "file" in name_lower:
        return ParamType.STRING
    if "url" in name_lower:
        return ParamType.STRING
    if "var" in name_lower or "variable" in name_lower:
        return ParamType.VARIABLE
    if "expr" in name_lower or "expression" in name_lower:
        return ParamType.EXPRESSION

    return ParamType.STRING


def _to_label(param_name: str) -> str:
    """Convert parameter name to display label.

    :param param_name: Parameter name.
    :returns: Display label.
    """
    return param_name.replace("_", " ").title()


def _determine_activity_type(tags: list[str], method_name: str) -> ActivityType:
    """Determine activity type from tags and method name.

    :param tags: Keyword tags.
    :param method_name: Method name.
    :returns: ActivityType.
    """
    tags_lower = [t.lower() for t in tags]
    name_lower = method_name.lower()

    if "loop" in tags_lower or "for" in name_lower or "while" in name_lower:
        return ActivityType.LOOP

    if "condition" in tags_lower or "if" in name_lower or "switch" in name_lower:
        return ActivityType.CONDITION

    if "error" in tags_lower or "try" in name_lower or "catch" in name_lower:
        return ActivityType.ERROR_HANDLER

    if "async" in tags_lower or "await" in name_lower:
        return ActivityType.ASYNC

    return ActivityType.SYNC


def register_library(
    library_path: str,
    library_name: str,
    category: str,
    icon: str = "⚙",
) -> list[ActivityMeta]:
    """Import and register a Robot Framework library.

    :param library_path: Import path (e.g., "rpaforge_libraries.DesktopUI").
    :param library_name: Short library name.
    :param category: Category for activities.
    :param icon: Default icon.
    :returns: List of registered activities.
    """
    try:
        module = importlib.import_module(library_path)
        library_class = getattr(module, library_name, None)

        if library_class is None:
            for attr_name in dir(module):
                attr = getattr(module, attr_name)
                if inspect.isclass(attr) and hasattr(attr, "ROBOT_LIBRARY_SCOPE"):
                    library_class = attr
                    break

        if library_class is None:
            return []

        activities = discover_library_keywords(
            library_class, library_name, category, icon
        )

        for activity in activities:
            _REGISTRY[activity.id] = activity

        return activities

    except ImportError:
        return []


def discover_all_libraries() -> dict[str, list[ActivityMeta]]:
    """Discover and register all known RPAForge libraries.

    :returns: Dict mapping library names to their activities.
    """
    libraries = {
        "DesktopUI": {
            "path": "rpaforge_libraries.DesktopUI",
            "category": "Desktop",
            "icon": "🖥",
        },
        "WebUI": {
            "path": "rpaforge_libraries.WebUI",
            "category": "Web",
            "icon": "🌐",
        },
        "OCR": {
            "path": "rpaforge_libraries.OCR",
            "category": "OCR",
            "icon": "📝",
        },
        "Excel": {
            "path": "rpaforge_libraries.Excel",
            "category": "Excel",
            "icon": "📊",
        },
        "Database": {
            "path": "rpaforge_libraries.Database",
            "category": "Database",
            "icon": "🗃",
        },
        "Credentials": {
            "path": "rpaforge_libraries.Credentials",
            "category": "Credentials",
            "icon": "🔐",
        },
    }

    discovered = {}

    for lib_name, config in libraries.items():
        activities = register_library(
            library_path=config["path"],
            library_name=lib_name,
            category=config["category"],
            icon=config["icon"],
        )
        if activities:
            discovered[lib_name] = activities

    return discovered


def get_registry_stats() -> dict[str, Any]:
    """Get statistics about the registry.

    :returns: Dict with stats.
    """
    activities = list(_REGISTRY.values())
    categories = {}
    types = {}
    libraries = {}

    for a in activities:
        categories[a.category] = categories.get(a.category, 0) + 1
        types[a.type.value] = types.get(a.type.value, 0) + 1

        lib = a.rf_library.replace("RPAForge.", "")
        libraries[lib] = libraries.get(lib, 0) + 1

    return {
        "total": len(activities),
        "categories": categories,
        "types": types,
        "libraries": libraries,
    }
