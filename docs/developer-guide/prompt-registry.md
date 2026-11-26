# Prompt Registry

All LLM prompt templates live in a versioned registry (issue #904) —
never inline in module code. There are two registries with the same
conventions, one per stack:

| Stack | Registry | Templates |
|---|---|---|
| Python (core + libraries) | `packages/core/src/rpaforge/prompts/` | `rpaforge.prompts` package data, loaded via `importlib.resources` |
| Studio (Electron main) | `packages/studio/electron/ai/prompts/` | JSON files bundled via imports, no runtime filesystem access |

The two sets do not overlap: engine prompts (diagnosis, agentic loop,
llm-decision, VLM grounding, extraction, OCR) ship with the Python
packages; Studio feature prompts (diagram generation, suggestions,
param fill, failure diagnosis panel, assistant) ship with the app.

## Template format

One JSON file per template under `templates/`, file name == id:

```json
{
  "id": "diagnosis.system",
  "version": 1,
  "description": "System prompt for AI failure diagnosis.",
  "variables": [],
  "template": "You diagnose a failed RPA process run. ..."
}
```

- **Id**: `<feature>.<purpose>` (`diagram.system`, `ai_extract.correction`).
- **Version**: positive integer. Bump it on every text change.
- **Placeholders**: `{{name}}` (mustache-style) — JSON braces inside the
  prose never collide with substitution. Variable names may be
  lower_snake or camelCase; declared variables must exactly match the
  placeholders in the text.

Rendering is **fail-closed** in both stacks: unknown ids, malformed
payloads, undeclared placeholders, and missing or extra render variables
all raise (`PromptError`) before any provider call is made.

## Using the registry

Python:

```python
from rpaforge.prompts import render_prompt

system = render_prompt("diagnosis.system")
client.chat(
    [{"role": "system", "content": system.text}],
    model=model,
    json_mode=True,
    prompt_id=system.prompt_id,
    prompt_version=system.prompt_version,
)
```

TypeScript (Electron main process):

```ts
import { renderPrompt } from './prompts/registry';

const system = renderPrompt('diagram.system', { activityList, blockTypes });
// system.text -> provider call; system.promptId/promptVersion -> result
```

## Telemetry contract

- **Python**: `llm_usage` NDJSON events gain optional `prompt_id` /
  `prompt_version` fields whenever the caller passes them to
  `chat()`. Fields are omitted when unset, so existing consumers are
  unaffected.
- **Studio**: the AI result objects carry `prompt: {id, version}`;
  `aiHandlers.ts` annotates the security-audit events
  (`ai_generation`, `ai_diagnosis`, `ai_assistant`) with
  `promptId` / `promptVersion`.

The convention everywhere: **the system template of a call is the
recorded identity** (for single-template flows such as OCR transcription,
that one template is recorded).

## Changing a prompt ("prompt CI")

The offline evaluation harness runs on every push (and as a focused
[Prompts Eval](../.github/workflows/prompts-eval.yml) workflow on
prompt-path changes). Three gates:

1. **Version-bump gate** — committed baselines pin each template's
   sha256 at its version
   (`packages/core/tests/prompt_eval_fixtures/baseline.json`,
   `packages/studio/electron/ai/prompts/eval/baseline.json`). Editing a
   template without bumping its version fails CI with instructions.
   Refresh after an intentional change with
   `RPAFORGE_PROMPT_BASELINE_UPDATE=1` (Python gate); the Studio gate
   rewrites its own baseline under the same env var. Update the golden
   render fixtures in the same PR.
2. **Golden render hashes** — rendered v1 output is pinned byte-identically
   to the inline strings the registry replaced
   (`packages/core/tests/test_prompt_registry.py`, Studio
   `eval/golden-renders.json`).
3. **Golden replay** — recorded provider responses are replayed through
   the real flows (diagnosis/agentic/extraction in pytest,
   generateDiagram/diagnoseFailure/assistantChat in vitest), asserting
   parse rate, schema validity, self-correction retry budgets and the
   prompt identity in results.

To change a prompt: edit the JSON, bump `version`, update/refresh the
baselines and golden fixtures in the same PR, and update any tests that
pin the affected flow's behavior.
