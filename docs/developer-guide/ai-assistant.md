# AI Assistant Panel

The conversational assistant dock lives in the right sidebar (third tab,
lazy-loaded). Ask about the process, a selected node or the last failure —
or request changes and review them as a diagram diff before anything
touches the canvas (issue #903).

## Conversation contract

- **Transport**: `ai:assistantChat` IPC (renderer → main). All provider
  calls happen in the Electron main process behind the versioned
  `assistant` consent feature (local endpoints like Ollama skip the
  dialog). Payloads are Ajv-validated (`ipc-schemas.ts`); the renderer
  never sees provider keys (ADR-003.3).
- **Multi-turn**: the renderer keeps the session history and sends it
  with every request; main flattens it into a single user prompt with
  explicit `User:`/`Assistant:` turns (no provider accepts a messages
  array; flattening is consistent with the Gemini adapter's behavior).
- **Response shape**: one JSON object `{answer, edits}` — `jsonMode` +
  JSON schema, fail-closed validation (one retry with the validation
  errors fed back). Deltas stream to the panel over
  `ai:assistantProgress` while the raw JSON accumulates; the parsed
  answer replaces it on completion.
- **Per-message accounting**: token totals and the cost estimate from
  `estimateTokenCost` render under each assistant reply.

## What the provider sees

The panel sends a **value-free** diagram summary built by
`buildAssistantContext` (`src/utils/assistantContext.ts`): node ids,
labels, block types and param KEY names — never param values. On top of
that, main runs `redactSensitive` over the whole request and a kv-shaped
secret scrub (`api_key: …` inside prose → `[REDACTED]`, mirroring the
core kv pattern) over the history, the user message and the last error.
The selected node id and an optional last-run error are opt-in context
chips shown above the input.

## Applying edits

Assistant edits reuse the issue #906 pipeline exactly:

1. `applyProposals` (`src/utils/diagnosisProposals.ts`) applies the
   typed proposals deterministically — or skips them with reasons.
2. `diffDiagrams(current, proposed)` renders in `DiagramDiffViewer`
   (doc-pair mode — nothing is written to disk).
3. Confirm pushes an undo snapshot (`historyStore.pushHistory`) first,
   then writes the result into the designer (`blockStore`). Undo works.

The model never mutates the canvas directly; unknown node ids or params
are skipped with visible reasons.

## Error states

No provider configured, consent declined, transport failure or an
offline bridge each surface a localized message in the panel; nothing
is sent anywhere unless consent is granted or the provider is local.
