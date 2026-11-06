# MCP Server: trigger RPAForge from any AI agent

`rpaforge-runner mcp` speaks the [Model Context Protocol](https://modelcontextprotocol.io) so
external AI agents — Claude Desktop, Cursor, Copilot Studio, custom
LangGraph/OpenAI agents — can list, trigger and observe RPAForge
automations natively. Agents reason, RPAForge executes (issue #854).

Requires the `[mcp]` extra: `pip install rpaforge-core[mcp]`.

## Tools

| Tool | Purpose |
|------|---------|
| `list_processes` | Discover runnable processes under `--processes-dir` (`.process` documents and `.forge` packages; display name comes from `metadata.name`). |
| `run_process` | Enqueue one run. Typed args only: `process` (name or explicit file path), `variables` (object of JSON primitives), `priority` (`High`/`Normal`/`Low`), `policy_path` (permission-policy manifest, validated eagerly), `reference`. Returns the queue `item_id`. |
| `get_run_status` | Queue status of one run by `item_id` (`New` → `InProgress` → `Successful`/`Failed`/`Retried`/`DeadLetter`/`Cancelled`). |
| `list_runs` | Recent runs of the queue, newest first. |
| `cancel` | Cancel a queued run the daemon has not picked up yet. In-progress runs cannot be cancelled. |

Invalid arguments (unknown process, non-primitive variable, bad priority,
broken policy manifest) surface as MCP tool errors with the message — no
raw payload passthrough anywhere.

## Quick-start: Claude Desktop (stdio)

Stdio is the default transport — no network, the agent spawns the server
process itself:

```json
{
  "mcpServers": {
    "rpaforge": {
      "command": "rpaforge-runner",
      "args": [
        "mcp",
        "--queue", "agents",
        "--db-path", "C:/rpaforge/queue.db",
        "--processes-dir", "C:/rpaforge/processes"
      ]
    }
  }
}
```

Then ask the agent: *"List available RPAForge processes and run `Invoice
Bot` with customer ACME"* — it will call `list_processes` and
`run_process`.

## Quick-start: any MCP client (streamable HTTP)

For remote or multi-agent setups, expose streamable HTTP guarded by the
same bearer token as the serve API (`RPAFORGE_SERVE_TOKEN`, #817). The
server **refuses to start** in HTTP mode without a token (fail-closed):

```bash
export RPAFORGE_SERVE_TOKEN="long-random-secret"
rpaforge-runner mcp --transport http --host 127.0.0.1 --port 8766 \
  --queue agents --processes-dir /bots/processes
```

Endpoint: `http://127.0.0.1:8766/mcp` with
`Authorization: Bearer $RPAFORGE_SERVE_TOKEN`. Missing or wrong tokens get
`401` before reaching the MCP surface.

### curl sanity check

```bash
curl -X POST http://127.0.0.1:8766/mcp \
  -H "Authorization: Bearer $RPAFORGE_SERVE_TOKEN" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

## How runs execute

The MCP server only **enqueues** items into the same SQLite work queue the
daemon polls (`rpaforge-runner daemon --queue agents`, #818) — identical to
`POST /trigger` on the serve API (#817), so serve HTTP mode and MCP mode can
run independently, against the same queue or different queues. The daemon
loads the diagram, applies variables as overrides, enforces the run's
permission policy (#844 — a per-item `policy` payload entry, validated
eagerly by the MCP server) and writes run audit records. Results stay in
the queue: `get_run_status` reports `Successful`/`Failed` plus the runner's
error message for failures.

## Security notes

- **Local-first threat model**: run on a trusted host. The MCP surface is
  as powerful as the runner host permits — an agent can execute any process
  visible under `--processes-dir`.
- **Auth**: stdio inherits OS user permissions; HTTP requires the bearer
  token on every request (constant-time comparison). Keep
  `RPAFORGE_SERVE_TOKEN` secret and bind HTTP to `127.0.0.1` unless you
  front it with TLS.
- **Typed args only**: no payload passthrough; variables are restricted to
  JSON primitives; policy manifests are validated before enqueueing.
- **Policy enforcement**: pass `policy_path` to sandbox the spawned run
  (see [permission-policies.md](permission-policies.md)).

## Testing

End-to-end protocol compliance is covered by the SDK reference client
(`packages/core/tests/test_mcp_server.py::TestProtocolCompliance`): a real
`ClientSession` over stdio lists tools, triggers a demo process, observes
status and cancels it.
