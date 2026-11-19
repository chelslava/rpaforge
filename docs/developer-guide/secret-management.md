# Secret Management — the `secret://` Contract

This page is the canonical contract for how secrets flow through RPAForge.
It is aimed at library authors, runner operators, and anyone wiring the
Studio to unattended executions.

## Lifecycle: refs at design time → values at run time

1. **Design time.** Secret values are never stored in process files. Studio
   keeps them in the OS-keychain-backed store (`safeStorage`, one encrypted
   blob under `userData/secret-variables.enc.json`) and diagrams reference
   them through opaque `secret://<variable-id>` refs.
2. **Run start.** References are resolved once, immediately before
   execution, into the ephemeral run payload. Refs do not outlive the run
   start; core never persists resolved values itself.
3. **Persistence boundaries.** Whatever a run writes — audit snapshots,
   checkpoints, HITL approval payloads, NDJSON run logs, serve logs — goes
   through the masking layers below before hitting disk or HTTP.

## Masking layers (what is redacted where)

| Surface | Layer | Mechanism |
|---------|-------|-----------|
| Audit snapshots, checkpoints (`redact` mode), HITL approvals | name-based + value-based | `rpaforge.core.audit.redact_value` — credential-ish key names are replaced wholesale; every occurrence of a value registered in the runtime registry is masked whatever the key (`core/secrets.py`, issue #912) |
| Runner console + NDJSON run logs + serve `GET /runs/{id}/logs` | choke point at `emit` | `EventLogger`/`TeeEventLogger` mask kwargs before any write (issue #907) |
| LLM provider logs | redaction helpers | `rpaforge.llm._redact` |

Values enter the runtime registry (and are therefore masked everywhere)
when they come from:

- `--secret-env NAME=ENV_VAR` on the runner CLI / daemon;
- the Credentials library (all providers forward lookups to the registry);
- environment declarations: `RPAFORGE_SECRET_*` plus the built-ins
  `RPAFORGE_LLM_API_KEY`, `RPAFORGE_SERVE_TOKEN`, `RPAFORGE_CHECKPOINT_KEY`.

Debugging escape hatch: `RPAFORGE_LOG_UNMASKED=1` disables the value-based
and pattern layers (a warning banner is printed once per process);
name-based audit redaction stays on. Never use it in production.

## Guidance for library authors

- **Never log activity params wholesale.** Emit only what an operator
  needs (`target`, `selector`, status); the log-path masker covers
  accidental leakage of registered values and common credential shapes
  (`Bearer`, `password=`, URL userinfo), but not logging values under
  innocuous keys before they are registered.
- **Accept secrets as `secret-ref` strings or plain values, resolve
  through the Credentials library** so lookups are registered
  automatically. Do not cache resolved values beyond the activity call.
- **Do not persist payloads containing secret-shaped fields** — use the
  audit/`redact_value` helpers before any custom file write.

## safeStorage store rotation (Studio)

The encrypted store is a single blob keyed by the OS-provided safeStorage
key. If that key changes (OS account migration, keychain reset), the
store becomes unreadable — decrypt failures surface the stable
`SECRET_STORE_SEALED_MESSAGE` error. The recovery flow
(`secret:inspect` / `secret:reset` / `secret:reencrypt` IPC, issue #912):

1. `inspect` — non-throwing health check; `decryptable: false` means the
   key changed.
2. `reset` — delete the sealed store (values are unrecoverable; no
   plaintext fallback file is ever written).
3. `reencrypt` (or per-variable `set`) — rebuild the store atomically from
   freshly entered values; only the safeStorage-encrypted blob lands on
   disk.

## Related

- [Permission policies](permission-policies.md) — sandbox manifest that
  gates what runs may touch.
- [Writing a library](writing-a-library.md) — library authoring guide.
- Runner guide: [headless CLI](../getting-started/headless-cli.md) —
  `--secret-env`, masked run logs, serve hardening.
