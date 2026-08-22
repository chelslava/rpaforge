"""Pre-built extraction schemas (issue #741).

Validated JSON-Schema artifacts shipped as package data and loaded via
``importlib.resources`` (no filesystem assumptions, zip-safe). Pair them
with the AI library's ``Extract Structured Data`` activity for one-step
document parsing:

    schema = IDP().get_extraction_schema("invoice")
    result = ai.extract_structured_data(text, schema)
"""

from __future__ import annotations

import json
from importlib import resources
from typing import Any

from rpaforge_libraries.i18n import _

__all__ = ["SCHEMA_NAMES", "Schemas", "load_schema"]

SCHEMA_NAMES: tuple[str, ...] = ("invoice", "receipt", "purchase_order")

_CACHE: dict[str, dict[str, Any]] = {}


def load_schema(doc_type: str) -> dict[str, Any]:
    """Load one bundled schema by canonical name.

    :param doc_type: One of :data:`SCHEMA_NAMES` (case-insensitive; spaces
        or hyphens map to underscores).
    :raises KeyError: For unknown names, listing valid options.
    """
    key = doc_type.strip().lower().replace("-", "_").replace(" ", "_")
    if key in _CACHE:
        return _CACHE[key]
    if key not in SCHEMA_NAMES:
        raise KeyError(
            _(
                "Unknown document type '{doc_type}'. Available: {options}",
                doc_type=doc_type,
                options=", ".join(SCHEMA_NAMES),
            )
        )
    resource = resources.files("rpaforge_libraries.IDP") / "schemas" / f"{key}.json"
    schema = json.loads(resource.read_text(encoding="utf-8"))
    _CACHE[key] = schema
    return schema


class Schemas:
    """Namespace exposing bundled schemas as uppercase attributes.

    ``Schemas().INVOICE``, ``Schemas().RECEIPT`` and
    ``Schemas().PURCHASE_ORDER`` resolve through :func:`load_schema`,
    ready to pass straight into Extract Structured Data.
    """

    def __getattr__(self, name: str) -> dict[str, Any]:
        """Resolve UPPER_SNAKE attribute access to a bundled schema."""
        if name.isupper():
            try:
                return load_schema(name)
            except KeyError as err:
                raise AttributeError(str(err)) from err
        raise AttributeError(f"No schema attribute '{name}'.")
