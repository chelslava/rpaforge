from __future__ import annotations

from enum import Enum
from typing import Any, Optional
from dataclasses import dataclass, field


class ActivityType(Enum):
    CONTROL = "control"
    LOOP = "loop"
    CONDITION = "condition"
    CONTAINER = "container"
    SYNC = "sync"
    ASYNC = "async"
    ERROR_HANDLER = "error_handler"
    SUBDIAGRAM = "subdiagram"


class PortType(Enum):
    FLOW = "flow"
    DATA = "data"
    EVENT = "event"
    ERROR = "error"


class PropertyType(Enum):
    STRING = "string"
    NUMBER = "number"
    BOOLEAN = "boolean"
    VARIABLE = "variable"
    EXPRESSION = "expression"
    ARRAY = "array"
    OBJECT = "object"
    SECRET = "secret"


@dataclass
class Port:
    id: str
    type: PortType
    required: bool = True
    label: Optional[str] = None
    multiple: bool = False
    data_type: Optional[str] = None
    position: str = "right"

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "type": self.type.value,
            "required": self.required,
            "label": self.label,
            "multiple": self.multiple,
            "dataType": self.data_type,
            "position": self.position,
        }


@dataclass
class Property:
    name: str
    type: PropertyType
    required: bool = False
    default: Any = None
    description: Optional[str] = None
    schema: Optional[dict[str, Any]] = None
    validation: Optional[dict[str, Any]] = None

    def to_dict(self) -> dict[str, Any]:
        result: dict[str, Any] = {
            "name": self.name,
            "type": self.type.value,
            "required": self.required,
        }
        if self.default is not None:
            result["default"] = self.default
        if self.description:
            result["description"] = self.description
        if self.schema:
            result["schema"] = self.schema
        if self.validation:
            result["validation"] = self.validation
        return result


@dataclass
class TimeoutConfig:
    enabled: bool = True
    duration: int = 30000
    on_timeout: str = "error"

    def to_dict(self) -> dict[str, Any]:
        return {
            "enabled": self.enabled,
            "duration": self.duration,
            "onTimeout": self.on_timeout,
        }


@dataclass
class RetryConfig:
    enabled: bool = False
    max_attempts: int = 3
    interval: int = 1000
    backoff: str = "none"
    retry_on: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "enabled": self.enabled,
            "maxAttempts": self.max_attempts,
            "interval": self.interval,
            "backoff": self.backoff,
            "retryOn": self.retry_on,
        }


@dataclass
class ActivityMetadata:
    id: str
    type: ActivityType
    name: str
    category: str
    description: str
    icon: str = "⚙"
    version: str = "1.0.0"
    input_ports: list[Port] = field(default_factory=list)
    output_ports: list[Port] = field(default_factory=list)
    properties: list[Property] = field(default_factory=list)
    timeout: Optional[TimeoutConfig] = None
    retry: Optional[RetryConfig] = None
    continue_on_error: bool = False
    nested: bool = False
    dynamic_ports: bool = False
    robot_framework_keyword: Optional[str] = None
    robot_framework_library: Optional[str] = None

    def to_dict(self) -> dict[str, Any]:
        result: dict[str, Any] = {
            "id": self.id,
            "type": self.type.value,
            "name": self.name,
            "category": self.category,
            "description": self.description,
            "icon": self.icon,
            "version": self.version,
            "ports": {
                "inputs": [p.to_dict() for p in self.input_ports],
                "outputs": [p.to_dict() for p in self.output_ports],
                "dynamic": self.dynamic_ports,
            },
            "properties": [p.to_dict() for p in self.properties],
            "execution": {
                "continueOnError": self.continue_on_error,
            },
            "nested": self.nested,
        }

        if self.timeout:
            result["execution"]["timeout"] = self.timeout.to_dict()
        if self.retry:
            result["execution"]["retry"] = self.retry.to_dict()
        if self.robot_framework_keyword:
            result["robotFramework"] = {
                "keyword": self.robot_framework_keyword,
                "library": self.robot_framework_library,
            }

        return result
