# Robot Permission Policies

Declarative security policies restrict what a running process MAY touch: the
filesystem, network egress, subprocess spawns, and the environment variables
passed to spawned processes. Without a policy a process runs with the full
permissions of the invoking user (the engine logs a warning in unattended
mode); with a policy, out-of-policy access fails **closed** with a typed
`PolicyViolationError` surfaced in audit events.

Introduced in v0.8.0 (issue #844).

## Manifest format

A policy manifest is a JSON file (YAML is also accepted when PyYAML is
installed). Every section is optional; an absent section means that boundary
is not restricted.

```json
{
  "filesystem": {
    "read": ["C:/data/in/**"],
    "write": ["C:/data/out/**/*.xlsx"],
    "deny_by_default": true
  },
  "network": {
    "egress": ["api.example.com", "*.internal.corp"],
    "deny_by_default": true
  },
  "process": {
    "allow": ["python.exe", "notepad.exe"],
    "deny": ["powershell.exe"]
  },
  "environment": {
    "allow": ["PATH", "TEMP", "SYSTEMROOT"]
  }
}
```

| Section | Keys | Semantics |
|---------|------|-----------|
| `filesystem` | `read`, `write`, `deny_by_default` | Glob allowlists for read and write access. `*` matches within one path segment, `**` crosses segments. Matching is case-insensitive on Windows. |
| `network` | `egress`, `deny_by_default` | Host allowlist for outbound connections. An entry matches the connect host exactly or as a subdomain suffix (`example.com` allows `api.example.com`); `*` allows every host. |
| `process` | `allow`, `deny`, `deny_by_default` | Executable-basename control for spawned subprocesses. The deny-list always wins over the allow-list. |
| `environment` | `allow` | Environment variable names a spawned subprocess may receive (its effective env — inherited or explicit). |

`deny_by_default` defaults to `true` when a section is present (fail-closed).
Set it to `false` for an observe-first rollout: violations are allowed but
still reported. When no section is present the boundary is unrestricted.

## Resolution order

The effective policy for a run resolves as:

1. `rpaforge-runner run --policy <path>` — explicit flag,
2. `RPAFORGE_POLICY` environment variable — deployment default,
3. no policy — current behavior; the runner logs a WARNING (`No permission
   policy configured`).

The Studio follows the same fail-closed contract: when a run is started from
the designer, it looks for `.rpaforge/policy.json` in the project root and
passes it to the engine (see below).

For queue-driven unattended runs (`rpaforge-runner daemon`) the daemon-level
`--policy` flag is the default; a queue item may carry its own
`"policy": "<path>"` payload entry (see the serve section below) which wins
for that item. Broken manifests fail the item immediately (fail-closed).

## Enforcement points

- **Subprocess workers** (`timeout_ms > 0` dispatches) receive the policy
  through executor state and enforce it inside the worker process — the hard
  boundary for timeout-isolated activity calls.
- **In-process dispatches** (built-in libraries, `timeout_ms == 0`) are
  wrapped in a policy activation window around each activity call.
- **Threaded timeout fallback** propagates the active policy into its worker
  thread, so in-process dispatches with timeouts are covered too.

Under the hood enforcement uses a Python audit hook
(`sys.addaudithook`) covering `open`, `os.remove`/`os.rename`/`os.mkdir`/...,
`shutil.copyfile`, `socket.connect`, `subprocess.Popen`, `os.system`,
`os.exec`/`os.spawn`. The hook is installed lazily at first policy use and is
a pass-through whenever no policy is active — default behavior and
performance are unchanged. Python module imports are *not* restricted by the
filesystem section (third-party library import control is the separate
library-source sandbox).

### Notes and limitations

- File operations performed by the engine itself (run audit records,
  checkpoints, logs) happen outside activity dispatch windows and are not
  restricted; logging performed *inside* an activity counts as activity
  I/O and is subject to the policy.
- Network checks match the connect host string; DNS-level rebinding
  protection for webhook transports is the separate SSRF guard and remains
  independent.
- Environment enforcement applies to the effective environment of a spawn;
  with a strict allowlist, inherited variables (e.g. `PATH`, `SYSTEMROOT`)
  must be listed explicitly.

## Triggering runs with a policy (serve API)

`rpaforge-runner serve` accepts an optional `X-RPAForge-Policy` header on
`POST /trigger` naming a policy manifest path on the runner host. The path is
validated eagerly (a broken manifest returns `400`) and forwarded to the
daemon through the queue item payload:

```bash
curl -X POST http://127.0.0.1:8765/trigger \
  -H "Authorization: Bearer $RPAFORGE_SERVE_TOKEN" \
  -H "X-RPAForge-Policy: /etc/rpaforge/policies/invoice.json" \
  -d '{"diagram_path": "/bots/invoice.process"}'
```

## Violations

An out-of-policy access raises a typed `PolicyViolationError` carrying
`kind` (`filesystem` / `network` / `process` / `environment`), `resource`
(path, host, executable or env var names) and `rule`. The activity fails,
the step record and run result carry the violation, and the runner emits a
`policy_violation` NDJSON event:

```json
{"event": "policy_violation", "error": "PolicyViolationError",
 "kind": "filesystem", "resource": "C:/secret.txt", "rule": "read allowlist"}
```

A run that loads a policy emits `policy_loaded` (path + active sections);
runs without a policy emit a WARNING `log_message` instead.

## Studio integration

When you press **Run** in the designer, the Studio reads
`.rpaforge/policy.json` from the project root and sends it with the run
request (`runDiagram` → the `runDiagram` bridge handler). The handler
validates the manifest through `Policy.from_dict` before the run starts; an
invalid manifest fails the run immediately with an `INVALID_PARAMS` error —
a broken policy never silently degrades to "no policy" (fail-closed).

Violations that occur during a Studio run are persisted with the run record
(`policy_violations` in `~/.rpaforge/runs/<run>.json`, with secret-looking
values redacted by the audit redaction filter). The **Security → Security
Audit** dialog aggregates all runs that recorded violations in a dedicated
section above the security event log, so a policy breach is visible without
digging through run files.

## Programmatic use (SDK)

```python
from rpaforge import StudioEngine
from rpaforge.core.policy import load_policy_file

engine = StudioEngine(policy=load_policy_file("policy.json"))
```

`StudioEngine`, `ProcessRunner`, `ProcessExecutor`, `SubprocessExecutor` and
`LibraryRunner` all accept a `policy=` argument; `ProcessExecutor.set_policy`
updates an existing executor.
