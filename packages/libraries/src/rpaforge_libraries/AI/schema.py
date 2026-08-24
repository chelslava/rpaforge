"""JSON Schema parsing, validation and optional pydantic coercion.

Supports the pragmatic subset of JSON Schema that matters for LLM
extraction prompts: ``type`` (with nested ``object``/``array`` recursion),
``properties``, ``required``, ``items``, ``enum``, ``minimum``/``maximum``
and ``minLength``/``maxLength``. Unknown keywords are ignored so schemas
authored for stricter validators still work.

Two layers:

1. :func:`validate_against_schema` - dependency-free structural check that
   returns human-readable error strings suitable for feeding back to the
   model as correction requests (the ``MAX_RETRIES`` loop from
   ``packages/studio/electron/ai/generateDiagram.ts``).
2. :func:`coerce_with_pydantic` - when the optional ``pydantic>=2``
   dependency is installed, builds an equivalent dynamic model and runs a
   lax ``model_validate`` pass so near-miss values (e.g. ``"42"`` for an
   integer property) are coerced instead of rejected.
"""

from __future__ import annotations

import json
from typing import Any

__all__ = [
    "parse_schema",
    "schema_to_prompt",
    "validate_against_schema",
    "coerce_with_pydantic",
]

_TYPE_NAMES: dict[type, str] = {
    str: "string",
    int: "integer",
    float: "number",
    bool: "boolean",
    dict: "object",
    list: "array",
    type(None): "null",
}


def parse_schema(raw: str | dict[str, Any]) -> dict[str, Any]:
    """Normalize *raw* into a schema dict.

    Accepts an already-built mapping or a JSON string; anything else (or
    JSON that is not an object with ``"type": "object"`` at the root) raises
    :class:`ValueError`.
    """
    if isinstance(raw, dict):
        schema = raw
    elif isinstance(raw, str):
        try:
            parsed = json.loads(raw)
        except ValueError as err:
            raise ValueError(f"json_schema is not valid JSON: {err}") from err
        if not isinstance(parsed, dict):
            raise ValueError("json_schema must decode to a JSON object.")
        schema = parsed
    else:
        raise ValueError(
            f"json_schema must be a dict or a JSON string, got {type(raw).__name__}."
        )
    if schema.get("type") != "object":
        raise ValueError('json_schema root must have "type": "object".')
    return schema


def _type_name(value: Any) -> str:
    return _TYPE_NAMES.get(type(value), type(value).__name__)


def validate_against_schema(
    data: Any, schema: dict[str, Any], path: str = ""
) -> list[str]:
    """Return human-readable validation errors (empty list when valid)."""
    expected = schema.get("type")
    label = path or "(root)"

    if enum := schema.get("enum"):
        if data not in enum:
            options = ", ".join(repr(item) for item in enum)
            return [f"{label}: value {data!r} is not one of [{options}]."]
        return []

    if expected == "object":
        if not isinstance(data, dict):
            return [f"{label}: expected object, got {_type_name(data)}."]
        errors: list[str] = []
        for key in schema.get("required", []):
            if key not in data:
                errors.append(f"{label}: missing required property '{key}'.")
        properties = schema.get("properties", {})
        for key, value in data.items():
            if key in properties:
                errors.extend(
                    validate_against_schema(
                        value, properties[key], f"{path}.{key}".lstrip(".")
                    )
                )
        return errors

    if expected == "array":
        if not isinstance(data, list):
            return [f"{label}: expected array, got {_type_name(data)}."]
        items = schema.get("items")
        if not isinstance(items, dict):
            return []
        return [
            error
            for index, element in enumerate(data)
            for error in validate_against_schema(element, items, f"{path}[{index}]")
        ]

    if expected == "string":
        if not isinstance(data, str):
            return [f"{label}: expected string, got {_type_name(data)}."]
        if len(data) < schema.get("minLength", 0):
            return [f"{label}: string shorter than minLength {schema['minLength']}."]
        max_length = schema.get("maxLength")
        if max_length is not None and len(data) > max_length:
            return [f"{label}: string longer than maxLength {max_length}."]
        return []

    if expected == "integer":
        if isinstance(data, bool) or not isinstance(data, int):
            return [f"{label}: expected integer, got {_type_name(data)}."]
    elif expected == "number":
        if isinstance(data, bool) or not isinstance(data, (int, float)):
            return [f"{label}: expected number, got {_type_name(data)}."]
    elif expected == "boolean":
        if not isinstance(data, bool):
            return [f"{label}: expected boolean, got {_type_name(data)}."]
    elif expected == "null":
        if data is not None:
            return [f"{label}: expected null, got {_type_name(data)}."]
    elif expected is not None:
        return [f"{label}: unsupported schema type '{expected}'."]

    if isinstance(data, bool) or not isinstance(data, (int, float)):
        return []
    minimum = schema.get("minimum")
    if minimum is not None and data < minimum:
        return [f"{label}: {data!r} is less than minimum {minimum}."]
    maximum = schema.get("maximum")
    if maximum is not None and data > maximum:
        return [f"{label}: {data!r} is greater than maximum {maximum}."]
    return []


def _pydantic_annotation(schema: dict[str, Any], name: str) -> Any:
    """Map a JSON-schema subschema to a Python annotation (or dynamic model)."""
    try:
        from typing import Literal
    except ImportError:  # pragma: no cover - Literal exists on all supported Pythons
        return Any

    if enum := schema.get("enum"):
        hashable = tuple(
            item for item in enum if isinstance(item, (str, int, float, bool))
        )
        if hashable:
            return Literal[hashable]  # type: ignore[valid-type]
        return Any

    expected = schema.get("type")
    if expected == "object":
        return _build_model(schema, name)
    if expected == "array":
        items = schema.get("items")
        if isinstance(items, dict):
            return list[_pydantic_annotation(items, f"{name}_item")]  # type: ignore[valid-type]
        return list[Any]
    if expected == "string":
        return str
    if expected == "integer":
        return int
    if expected == "number":
        return float
    if expected == "boolean":
        return bool
    if expected == "null":
        return type(None)
    return Any


def _build_model(schema: dict[str, Any], name: str) -> Any:
    """Build a dynamic pydantic model equivalent to an object schema."""
    from pydantic import Field, create_model

    properties: dict[str, Any] = schema.get("properties", {})
    required = set(schema.get("required", []))
    fields: dict[str, tuple[Any, Any]] = {}
    safe = "".join(
        part.capitalize() or "_" for part in name.replace("-", "_").split("_")
    )
    for key, subschema in properties.items():
        field_name = (
            "".join(part if part.isidentifier() else "_" for part in key.split()) or key
        )
        annotation = _pydantic_annotation(subschema, f"{safe}_{field_name}")
        description = subschema.get("description", "")
        if key in required:
            fields[field_name] = (
                annotation,
                Field(..., description=description) if description else ...,
            )
        else:
            fields[field_name] = (
                annotation,
                Field(None, description=description) if description else None,
            )
    return create_model(safe or "ExtractionModel", **fields)


def coerce_with_pydantic(
    data: Any, schema: dict[str, Any]
) -> tuple[Any | None, list[str]]:
    """Validate and coerce *data* through an equivalent pydantic model.

    Returns ``(coerced_data, errors)``. Coercion is lax by default, so
    numeric strings for integer properties are accepted and converted -
    the most common near-miss shape produced by LLM responses.

    Raises :class:`ImportError` when pydantic is not installed; callers are
    expected to feature-detect via :func:`has_pydantic`.
    """
    from pydantic import ValidationError

    model = _build_model(schema, "ExtractedData")
    try:
        validated = model.model_validate(data)
        # exclude_unset keeps properties the model omitted from coming back
        # as explicit nulls - extraction output should match the input's key set.
        dumped = validated.model_dump(exclude_unset=True)
    except ValidationError as err:
        errors = [
            f"{'.'.join(str(part) for part in error['loc']) or '(root)'}: {error['msg']}."
            for error in err.errors()
        ]
        return None, errors
    return dumped, []


def has_pydantic() -> bool:
    """Return whether the optional pydantic dependency is installed."""
    try:
        import pydantic  # noqa: F401
    except ImportError:
        return False
    return True


def schema_to_prompt(schema: dict[str, Any]) -> str:
    """Render *schema* as compact JSON for embedding into prompts."""
    return json.dumps(schema, ensure_ascii=False, separators=(",", ":"))
