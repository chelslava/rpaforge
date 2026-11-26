"""Versioned prompt-template registry (issue #904).

Single source of truth for every LLM prompt template shipped with
rpaforge-core and the first-party libraries: templates live as JSON
package data, are named (``"<feature>.<purpose>"``) and versioned, and
rendered through a fail-closed ``{{variable}}`` renderer. Prompt
identity (id + version) travels into ``llm_usage`` telemetry so prompt
regressions are attributable in production.

Conventions:

- One JSON file per template under ``templates/``, file name == id.
- The system template of a call is the prompt identity recorded in
  telemetry (``ocr.transcribe`` records itself when no system template
  exists).
- Migrations into the registry must be byte-identical: v1 templates
  render exactly the strings that existed inline before (pinned by the
  eval harness baseline).

Python 3.12+.
"""

from __future__ import annotations

from rpaforge.prompts.registry import (
    PromptError,
    PromptTemplate,
    RenderedPrompt,
    get_template,
    render_prompt,
    template_digest,
    template_ids,
)

__all__ = [
    "PromptError",
    "PromptTemplate",
    "RenderedPrompt",
    "get_template",
    "render_prompt",
    "template_digest",
    "template_ids",
]
