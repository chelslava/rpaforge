# Agentic & HITL Guide

This guide covers the v0.6.0 agentic and human-in-the-loop capabilities:

- configuring LLM access for processes,
- the **LLM Decision** node for model-driven branching,
- the **Agentic Loop** node for bounded tool-using loops,
- **HITL approvals** (suspend a run until a human decides),
- **self-healing selectors** via `RPAFORGE_HEAL_MODE`.

---

## 1. LLM Configuration

The agentic nodes and the [AI library](../libraries/ai.md) share one LLM
configuration, set through environment variables:

```bash
set RPAFORGE_LLM_PROVIDER=anthropic          # or openai / openai-compatible / ollama / vllm / gemini
set RPAFORGE_LLM_MODEL=claude-sonnet-4-5
set RPAFORGE_LLM_API_KEY=...                 # not needed for local ollama/vllm
```

`RPAFORGE_LLM_BASE_URL` overrides the provider endpoint, `RPAFORGE_LLM_VISION_MODEL`
selects a multimodal model for image inputs. A local Ollama server
(`RPAFORGE_LLM_PROVIDER=ollama`) is enough for fully offline runs.

Agentic runs are exactly where transient LLM failures hurt most, so
non-streaming LLM calls retry automatically (issue #901): rate limits
(`429`) and gateway errors (`502`/`503`/`504`) back off exponentially with
jitter and honour the server's `Retry-After` header, while auth/validation
4xx errors fail fast. Tune the behavior with `RPAFORGE_LLM_MAX_ATTEMPTS`
(default `3`, `1` disables), `RPAFORGE_LLM_TIMEOUT_S` (per-attempt HTTP
timeout, default `120`) and `RPAFORGE_LLM_RETRY_BUDGET_S` (total budget,
default `300`). Retries surface as `attempts`/`retry_count` fields on
`llm_usage` events, and a run cancel (serve/daemon `cancel`) aborts
in-flight LLM calls promptly instead of burning the timeout. See the
[AI library docs](../libraries/ai.md) for the full picture, including the
Gemini provider quirks.

---

## 2. LLM Decision Node

The **LLM Decision** (`llm-decision`) canvas node asks the model to choose one of
N named options. Each option exposes an `option:<id>` output handle, so each
choice routes to its own branch on the canvas:

1. Add the node and fill in **question** and **options** (id + value).
2. Connect each `option:<id>` output handle to the branch that should run for
   that choice.
3. Optionally set **fallback_option** — the option id used when the model
   answers with something unparseable or outside the option set. Without a
   fallback, an invalid answer fails the task.

The chosen option id is emitted as an execution event, so decisions are
auditable in the run timeline.

---

## 3. Agentic Loop Node

The **Agentic Loop** (`agentic-loop`) node lets the model drive a bounded
tool-using loop. The loop repeatedly asks the LLM for the next step and
executes it, strictly inside a whitelist of activities you allow:

| Setting | Default | Purpose |
|---|---|---|
| `goal` | — | Natural-language objective for the loop. |
| `allowed_activities` | — | Whitelist of activities the model may call. Anything outside the catalog is refused. |
| `max_iterations` | 10 | Hard cap on loop iterations. |
| `max_total_tokens` | 100000 | Hard cap on cumulative token spend. |
| `step_timeout_ms` | — | Per-step timeout. |
| `model` | `RPAFORGE_LLM_MODEL` | Model override for this loop. |
| `output_variable` | — | Variable receiving the loop transcript/result. |

A **fallback** output handle routes the *aborted* path (whitelist violation,
budget exhaustion, canary failure) into its own branch, keeping the abort
handling inside the task. Every iteration is recorded in the transcript that
`output_variable` captures.

!!! warning "Budgets are safety rails, not suggestions"
    Always set `max_iterations`/`max_total_tokens` for unattended runs — the
    loop stops deterministically when either budget is spent.

### Native tool calling (issue #900)

The loop and the `llm-decision` node use **provider-native function
calling** when the adapter supports it (OpenAI-compatible, Anthropic,
Gemini via the OpenAI-compatible surface): tool schemas are built from
the same whitelisted catalog (`@param` metadata for registry activities,
typed `params_schema` for MCP tools), the model's `tool_calls` are
validated against those JSON schemas **before any dispatch**
(fail-closed — unknown tools, missing required arguments, mistyped
values or extra keys abort the loop), and a synthetic `report_finish`
tool closes the loop. Endpoints that reject the `tools=` payload
degrade automatically to the JSON-text protocol for the rest of the
run without spending an iteration; a model that answers with the JSON
protocol despite advertised tools keeps working.

---

## 4. Human-in-the-Loop Approvals

An **approval block** (`__hitl__.Request Approval`) suspends the process until
a human approves or rejects, or an optional TTL expires:

1. The engine persists an `ApprovalRequest` with an opaque UUID token and
   writes a suspension checkpoint tagged with that token.
2. The run blocks (emitting `approval_requested`) until a decision arrives.
3. On **approval**, `${approval_result}` becomes `approved` (and
   `${approval_comment}` carries the reviewer's comment). On **rejection or
   expiry**, `${approval_result}` becomes `rejected` and the block raises,
   routing execution to the error branch.

### End-to-end example

```python
from rpaforge.core.execution import ProcessBuilder
from rpaforge.core.runner import StudioEngine

builder = ProcessBuilder("Deploy with approval")
task = builder.add_task("Main")
task.add_activity(
    "__hitl__", "Request Approval",
    node_id="appr-1",
    question="Proceed with production deployment?",
    ttl_seconds=3600,
    output_variable="approval_token",
)
# ... deployment activities ...

engine = StudioEngine()
result = engine.run(builder.build())
```

While the run is suspended, decide from the terminal with `rpaforge-runner`:

```bash
# See pending requests (newest first) and grab the token
rpaforge-runner approvals list --status pending

# Approve (or reject) with an optional reviewer comment
rpaforge-runner approvals approve 8f0c... --comment "ship it"
rpaforge-runner approvals reject 8f0c... --comment "wrong window"
```

Requests live as one JSON file per token under the per-user application-data
directory (`<appdata>/approvals`); the CLI and the engine read the same store.

### Protecting checkpoint secrets

Suspension checkpoints can contain process variables — keep secrets out of
them with `RPAFORGE_CHECKPOINT_SECRET_MODE`:

| Mode | Behaviour |
|---|---|
| `redact` *(default)* | Secret-looking values are masked before the checkpoint is written. |
| `keep` | Values are stored as-is (only for trusted, access-controlled hosts). |
| `encrypt` | Payload is sealed with a Fernet key from `RPAFORGE_CHECKPOINT_KEY`. |

```bash
set RPAFORGE_CHECKPOINT_SECRET_MODE=encrypt
set RPAFORGE_CHECKPOINT_KEY=<fernet-key>
```

The written checkpoint is self-describing: `CheckpointManager.load()` decrypts
transparently when the key is provided.

---

## 5. Self-Healing Selectors (`RPAFORGE_HEAL_MODE`)

When a UI selector stops matching (the application changed), the selector
healing engine can propose — or automatically apply — a repaired selector:

| Mode | Behaviour |
|---|---|
| `propose` *(default)* | On failure, writes a repair proposal artifact (NDJSON) for review; the run still fails. |
| `apply` | Applies the healed selector automatically and continues. |
| `off` | Disables healing entirely. |

```bash
set RPAFORGE_HEAL_MODE=apply
```

Start with `propose` in unattended environments, review the proposed fixes,
then switch specific processes to `apply` once the proposals prove stable.
