from __future__ import annotations

from typing import Any, Callable, Optional, Type

from .types import (
    ActivityType,
    ActivityMetadata,
    Port,
    PortType,
    Property,
    PropertyType,
    TimeoutConfig,
    RetryConfig,
)
from .base import BaseActivity


_activity_registry: dict[str, ActivityMetadata] = {}


def activity(
    type: ActivityType,
    name: str,
    category: str,
    icon: str = "⚙",
    description: str = "",
    version: str = "1.0.0",
    input_ports: Optional[list[Port]] = None,
    output_ports: Optional[list[Port]] = None,
    properties: Optional[list[Property]] = None,
    timeout_default: Optional[int] = None,
    retry_default: Optional[RetryConfig] = None,
    continue_on_error: bool = False,
    nested: bool = False,
    dynamic_ports: bool = False,
    rf_keyword: Optional[str] = None,
    rf_library: Optional[str] = None,
) -> Callable[[Type[BaseActivity]], Type[BaseActivity]]:
    def decorator(cls: Type[BaseActivity]) -> Type[BaseActivity]:
        activity_id = cls.__name__

        default_input = [Port(id="input", type=PortType.FLOW)]
        default_output = [Port(id="output", type=PortType.FLOW)]

        metadata = ActivityMetadata(
            id=activity_id,
            type=type,
            name=name,
            category=category,
            description=description,
            icon=icon,
            version=version,
            input_ports=input_ports if input_ports is not None else default_input,
            output_ports=output_ports if output_ports is not None else default_output,
            properties=properties or [],
            timeout=TimeoutConfig(duration=timeout_default)
            if timeout_default
            else None,
            retry=retry_default,
            continue_on_error=continue_on_error,
            nested=nested,
            dynamic_ports=dynamic_ports,
            robot_framework_keyword=rf_keyword,
            robot_framework_library=rf_library,
        )

        cls.metadata = metadata
        _activity_registry[activity_id] = metadata

        return cls

    return decorator


class ActivityRegistry:
    def __init__(self):
        self._activities: dict[str, ActivityMetadata] = {}
        self._activities.update(_activity_registry)

    def register(self, activity_class: Type[BaseActivity]) -> None:
        if hasattr(activity_class, "metadata") and activity_class.metadata:
            metadata = activity_class.metadata
            self._activities[metadata.id] = metadata

    def get_metadata(self, activity_id: str) -> Optional[ActivityMetadata]:
        return self._activities.get(activity_id)

    def get_all(self) -> list[ActivityMetadata]:
        return list(self._activities.values())

    def get_by_category(self, category: str) -> list[ActivityMetadata]:
        return [a for a in self._activities.values() if a.category == category]

    def get_categories(self) -> list[str]:
        return list(set(a.category for a in self._activities.values()))

    def get_by_type(self, activity_type: ActivityType) -> list[ActivityMetadata]:
        return [a for a in self._activities.values() if a.type == activity_type]

    def to_dict(self) -> dict[str, Any]:
        return {
            activity_id: metadata.to_dict()
            for activity_id, metadata in self._activities.items()
        }


def create_port(
    id: str,
    type: str = "flow",
    required: bool = True,
    label: Optional[str] = None,
    multiple: bool = False,
    data_type: Optional[str] = None,
) -> dict[str, Any]:
    port_type = PortType(type)
    return Port(
        id=id,
        type=port_type,
        required=required,
        label=label,
        multiple=multiple,
        data_type=data_type,
    ).to_dict()


def create_property(
    name: str,
    type: str = "string",
    required: bool = False,
    default: Any = None,
    description: Optional[str] = None,
    schema: Optional[dict] = None,
) -> dict[str, Any]:
    prop_type = PropertyType(type)
    return Property(
        name=name,
        type=prop_type,
        required=required,
        default=default,
        description=description,
        schema=schema,
    ).to_dict()
