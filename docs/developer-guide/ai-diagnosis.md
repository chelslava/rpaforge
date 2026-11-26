# AI Failure Diagnosis

When a run fails, "Diagnose with AI" turns the failure into a root-cause
hypothesis and typed fix proposals that render as a **diagram diff** and
apply through the designer with undo (issue #906).

Two surfaces share one contract:

| Surface | Where the LLM call lives | Trigger |
|---|---|---|
| Live (Studio debugger) | Electron main (`ai:diagnoseFailure` IPC) | "Diagnose with AI" on a failed run (run history / execution timeline) |
| Batch (unattended fleets) | Python core (`rpaforge.llm`) | `rpaforge-runner diagnose --item ID` or `POST /queues/{name}/items/{id}/diagnose` |

## The context bundle

The model never sees raw logs. `rpaforge.diagnosis.build_diagnosis_bundle`
assembles: the error, the failing audit step, the last ~15 audit steps, the
last ~20 NDJSON events, the current diagram and any selector-heal
proposals — then sweeps the whole bundle through the same masking layer
the run logs use (`core/secrets.py`). Studio additionally applies
`redactSensitive` in the main process before the provider call (defense
in depth). Registered secrets, secret-shaped tokens and
credential-named fields can never reach the provider.

## Fix proposals (typed, fail-closed)

The model answers with one JSON object:

```json
{
  "root_cause": "Download button selector is stale",
  "confidence": "high",
  "explanation": "…",
  "proposals": [
    { "type": "selector_update", "node_id": "click-download", "new_selector": "[data-testid=download]" }
  ]
}
```

Proposal types v1: `param_change`, `selector_update` (linked to an
existing heal proposal when one matches), `wrap_retry`, `wrap_trycatch`
(reusing the recorder's wrap semantics), `insert_precondition`.
Parsing is fail-closed: unknown types, missing fields or references to
node ids that do not exist in the diagram reject the answer; one retry
feeds the validation errors back to the model.

## Applying (live)

Proposals are applied **deterministically** by code, not by the model
(`diagnosisProposals.ts`): each proposal either produces an exact
document change or is skipped with a reason. The result is diffed with
`diffDiagrams` and rendered in `DiagramDiffViewer` (doc-pair mode — no
git involved). Confirming writes the change into the designer and pushes
an undo snapshot first.

Applying is gated behind the `diagnose` AI-consent feature
(`userData/ai-consent.json`, same versioned consent as generation);
local endpoints (Ollama on localhost) skip the dialog.

## Batch mode (dead-letter items)

```bash
# one item (writes <logs-dir>/diagnosis/<item-id>.json)
rpaforge-runner diagnose --item <item-id> --db-path queue.db --logs-dir ~/.rpaforge/runs/logs

# over the control plane (admin scope)
curl -X POST -H "Authorization: Bearer $TOKEN" \
  https://host:8765/queues/jobs/items/<item-id>/diagnose
```

The `POST` op requires the item to be in `DeadLetter` status, builds the
bundle from the item's run record + NDJSON log, and stores the diagnosis
artifact next to the run logs. `GET …/diagnosis` returns it read-only;
Control Tower's Queues tab surfaces it per dead-letter item. Diagnoses
are propose-only in batch mode — applying stays a human decision in
Studio (groundwork for dead-letter policies, issue #897).

## Configuration

The Python (batch) call resolves `RPAFORGE_LLM_*` environment variables
via `rpaforge.llm`; Studio uses the AI provider configured in Settings.
Prompts are module constants today; moving them into a versioned prompt
registry is tracked in issue #904.
