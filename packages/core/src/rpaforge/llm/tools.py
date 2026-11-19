"""Provider-native tool-calling primitives (issue #900).

Typed tool contracts shared by the adapters and the agentic runtime:

- :class:`ToolSpec` — name/description/JSON-schema for one callable tool.
- :class:`ToolCall` — one parsed provider tool invocation.
- :func:`build_tool_specs` — JSON schemas built from the agentic tool
  catalog (``@param`` metadata for registry activities, ``params_schema``
  for MCP tools), replacing the loosely-typed MCP arg catalogue.
- :func:`validate_tool_arguments` — fail-closed validation against the
  spec schema before any dispatch.

Tool names follow the provider identifier grammar (``[a-zA-Z0-9_-]``,
max 64 chars): registry ids like ``Excel.Read Range`` are sanitized via
:func:`tool_name_for`, and the original id is carried in
:attr:`ToolSpec.registry_id` for dispatch.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any

from rpaforge.llm.client import LLMError

__all__ = [
    "ToolCall",
    "ToolSpec",
    "ToolValidationError",
    "build_tool_specs",
    "finish_tool_spec",
    "sanitize_tool_name",
    "tool_name_for",
    "validate_tool_arguments",
]

#: Max length of a provider tool name (OpenAI/Anthropic share the grammar).
_TOOL_NAME_MAX = 64

_TOOL_NAME_SAFE = re.compile(r"[^a-zA-Z0-9_-]")

#: Name of the synthetic finish tool offered in native tool-calling mode.
_FINISH_TOOL_NAME = "report_finish"

_PARAM_TYPE_MAP: dict[str, str] = {
    "string": "string",
    "secret": "string",
    "text": "string",
    "integer": "integer",
    "int": "integer",
    "number": "number",
    "float": "number",
    "boolean": "boolean",
    "bool": "boolean",
}


class ToolValidationError(LLMError):
    """Raised when tool-call arguments violate the tool's JSON schema."""


@dataclass(frozen=True)
class ToolSpec:
    """One callable tool advertised to the provider."""

    name: str
    description: str
    parameters: dict[str, Any] = field(
        default_factory=lambda: {"type": "object", "properties": {}}
    )
    #: Original registry id (``Library.activity_id``) for dispatch; equal
    #: to *name* for synthetic tools such as the finish reporter.
    registry_id: str = ""


@dataclass(frozen=True)
class ToolCall:
    """One tool invocation parsed from a provider response."""

    name: str
    arguments: dict[str, Any] = field(default_factory=dict)
    call_id: str = ""


def sanitize_tool_name(registry_id: str) -> str:
    """Project a registry id onto the provider tool-name grammar."""
    safe = _TOOL_NAME_SAFE.sub("_", registry_id)[:_TOOL_NAME_MAX].strip("_")
    return safe or "tool"


def tool_name_for(registry_id: str) -> str:
    """Public alias of :func:`sanitize_tool_name`."""
    return sanitize_tool_name(registry_id)


def _param_schema(param: dict[str, Any]) -> dict[str, Any]:
    """JSON schema fragment for one catalog param entry."""
    raw_type = str(param.get("type", "string")).lower()
    json_type = _PARAM_TYPE_MAP.get(raw_type, "string")
    return {"type": json_type}


def build_tool_specs(catalog: list[dict[str, Any]]) -> list[ToolSpec]:
    """Build provider tool specs from an agentic tool catalog.

    The catalog is the one produced by
    :func:`rpaforge.core.agentic.build_tool_catalog` — registry activities
    with ``@param`` metadata and MCP tools with ``params_schema`` keys.
    Every MCP argument becomes a typed schema property (``string`` unless
    declared otherwise), fixing the previously loose typing.
    """
    specs: list[ToolSpec] = []
    for entry in catalog:
        properties: dict[str, Any] = {}
        required: list[str] = []
        for param in entry.get("params", []):
            name = str(param.get("name", ""))
            if not name:
                continue
            properties[name] = _param_schema(param)
            if param.get("required"):
                required.append(name)
        specs.append(
            ToolSpec(
                name=sanitize_tool_name(str(entry.get("id", ""))),
                description=str(entry.get("description", "")),
                parameters={
                    "type": "object",
                    "properties": properties,
                    "required": required,
                    "additionalProperties": False,
                },
                registry_id=str(entry.get("id", "")),
            )
        )
    return specs


def finish_tool_spec() -> ToolSpec:
    """The synthetic finish tool closing a native tool-calling loop."""
    return ToolSpec(
        name=_FINISH_TOOL_NAME,
        description=(
            "Report the final answer for the goal and stop; call this "
            "instead of any activity when the goal is reached."
        ),
        parameters={
            "type": "object",
            "properties": {
                "result": {
                    "type": "string",
                    "description": "The final answer to the user's goal.",
                }
            },
            "required": ["result"],
            "additionalProperties": False,
        },
        registry_id=_FINISH_TOOL_NAME,
    )


def _check_type(value: Any, json_type: str) -> bool:
    """Whether *value* matches the JSON schema type (bool ≠ int)."""
    if json_type == "string":
        return isinstance(value, str)
    if json_type == "integer":
        return isinstance(value, int) and not isinstance(value, bool)
    if json_type == "number":
        return isinstance(value, (int, float)) and not isinstance(value, bool)
    if json_type == "boolean":
        return isinstance(value, bool)
    return True


def validate_tool_arguments(spec: ToolSpec, arguments: dict[str, Any]) -> None:
    """Fail-closed validation of tool-call arguments against *spec*.

    Unknown keys, missing required keys and mistyped values raise
    :class:`ToolValidationError` — callers must never dispatch unvalidated
    arguments (issue #900).
    """
    if not isinstance(arguments, dict):
        raise ToolValidationError(
            f"tool '{spec.name}' arguments must be an object, got "
            f"{type(arguments).__name__}"
        )
    schema = spec.parameters
    properties = schema.get("properties", {})
    allowed = set(properties)
    unknown = sorted(set(arguments) - allowed)
    if unknown:
        raise ToolValidationError(
            f"tool '{spec.name}' got unknown argument(s): {unknown}"
        )
    for required_key in schema.get("required", []):
        if required_key not in arguments:
            raise ToolValidationError(
                f"tool '{spec.name}' is missing required argument '{required_key}'"
            )
    for key, value in arguments.items():
        expected = properties.get(key, {}).get("type")
        if expected and not _check_type(value, expected):
            raise ToolValidationError(
                f"tool '{spec.name}' argument '{key}' must be {expected}, "
                f"got {type(value).__name__}"
            )
