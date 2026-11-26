"""Loader and renderer for the versioned prompt-template registry.

Templates live as JSON files under ``templates/`` (package data loaded
via :func:`importlib.resources` — no filesystem assumptions, zip-safe;
IDP schema precedent). Each file defines exactly one named template::

    {"id": "diagnosis.system", "version": 1,
     "description": "System prompt for run diagnosis",
     "variables": [], "template": "..."}

Placeholders use mustache-style ``{{name}}`` so JSON braces inside the
prompt prose never collide with substitution syntax. Everything is
fail-closed: unknown ids, malformed payloads, undeclared placeholders,
and missing or extra render variables all raise :class:`PromptError`
before any provider call is made.
"""

from __future__ import annotations

import hashlib
import json
import re
from dataclasses import dataclass
from importlib import resources
from typing import Any

_PACKAGE = "rpaforge.prompts"
_TEMPLATES_DIR = "templates"

_PLACEHOLDER_RE = re.compile(r"\{\{\s*([A-Za-z0-9_]+)\s*\}\}")


class PromptError(Exception):
    """Raised when a prompt template is missing, malformed or misrendered."""


@dataclass(frozen=True)
class PromptTemplate:
    """One named, versioned prompt template."""

    id: str
    version: int
    description: str
    variables: tuple[str, ...]
    template: str


@dataclass(frozen=True)
class RenderedPrompt:
    """Rendered prompt text plus its registry identity for telemetry."""

    text: str
    prompt_id: str
    prompt_version: int


_CACHE: dict[str, PromptTemplate] = {}


def _parse(prompt_id: str, payload: Any) -> PromptTemplate:
    """Validate one raw JSON payload into a :class:`PromptTemplate`."""
    if not isinstance(payload, dict):
        raise PromptError(f"Prompt '{prompt_id}' must be a JSON object")
    declared_id = payload.get("id")
    if declared_id != prompt_id:
        raise PromptError(f"Prompt file '{prompt_id}.json' declares id {declared_id!r}")
    version = payload.get("version")
    if not isinstance(version, int) or isinstance(version, bool) or version < 1:
        raise PromptError(f"Prompt '{prompt_id}' needs a positive integer version")
    template = payload.get("template")
    if not isinstance(template, str) or not template:
        raise PromptError(f"Prompt '{prompt_id}' needs a non-empty template string")
    variables = payload.get("variables")
    if not isinstance(variables, list) or not all(
        isinstance(name, str) and re.fullmatch(r"[A-Za-z0-9_]+", name)
        for name in variables
    ):
        raise PromptError(f"Prompt '{prompt_id}' variables must be a list of names")
    if len(set(variables)) != len(variables):
        raise PromptError(f"Prompt '{prompt_id}' declares duplicate variables")
    placeholders = set(_PLACEHOLDER_RE.findall(template))
    declared = set(variables)
    if placeholders != declared:
        raise PromptError(
            f"Prompt '{prompt_id}' placeholders {sorted(placeholders)} do not "
            f"match declared variables {sorted(declared)}"
        )
    description = payload.get("description", "")
    if not isinstance(description, str):
        raise PromptError(f"Prompt '{prompt_id}' description must be a string")
    return PromptTemplate(
        id=prompt_id,
        version=version,
        description=description,
        variables=tuple(variables),
        template=template,
    )


def _load(prompt_id: str) -> PromptTemplate:
    """Load and cache one template; fail-closed on any problem."""
    if prompt_id in _CACHE:
        return _CACHE[prompt_id]
    if not re.fullmatch(r"[a-z0-9_.]+", prompt_id):
        raise PromptError(f"Invalid prompt id {prompt_id!r}")
    resource = resources.files(_PACKAGE) / _TEMPLATES_DIR / f"{prompt_id}.json"
    if not resource.is_file():
        raise PromptError(f"Unknown prompt id '{prompt_id}'")
    try:
        payload = json.loads(resource.read_text(encoding="utf-8"))
    except ValueError as err:
        raise PromptError(f"Prompt '{prompt_id}' is not valid JSON: {err}") from err
    template = _parse(prompt_id, payload)
    _CACHE[prompt_id] = template
    return template


def get_template(prompt_id: str) -> PromptTemplate:
    """Return the current :class:`PromptTemplate` for *prompt_id*.

    :raises PromptError: When the id is unknown or its file is malformed.
    """
    return _load(prompt_id)


def template_ids() -> tuple[str, ...]:
    """Return all registered prompt ids, sorted."""
    root = resources.files(_PACKAGE) / _TEMPLATES_DIR
    return tuple(
        sorted(
            path.name[: -len(".json")]
            for path in root.iterdir()
            if path.name.endswith(".json")
        )
    )


def render_prompt(prompt_id: str, /, **variables: str) -> RenderedPrompt:
    """Render *prompt_id* with exactly its declared variables.

    :param prompt_id: Registry id of the template (``"<feature>.<purpose>"``).
    :param variables: String values for every declared template variable.
    :returns: :class:`RenderedPrompt` with text and telemetry identity.
    :raises PromptError: On unknown id, missing or extra variables.
    """
    template = _load(prompt_id)
    declared = set(template.variables)
    provided = set(variables)
    missing = sorted(declared - provided)
    extra = sorted(provided - declared)
    if missing or extra:
        details = []
        if missing:
            details.append(f"missing {missing}")
        if extra:
            details.append(f"unexpected {extra}")
        raise PromptError(f"Prompt '{prompt_id}' render: {'; '.join(details)}")
    values = {name: str(variables[name]) for name in template.variables}
    text = _PLACEHOLDER_RE.sub(lambda match: values[match.group(1)], template.template)
    return RenderedPrompt(
        text=text, prompt_id=template.id, prompt_version=template.version
    )


def template_digest(prompt_id: str) -> str:
    """Return the sha256 of the raw template text (prompt-CI gate).

    The eval harness pins these digests per version in its in-repo
    baseline so any template edit without a version bump fails CI.
    """
    template = _load(prompt_id)
    payload = template.template.encode("utf-8")
    return hashlib.sha256(payload).hexdigest()
