# MCP Integration (Model Context Protocol)

RPAForge agents can call tools exposed by external MCP servers. Tools are
registered as a synthetic `MCP:<server>` library on the executor, so the
standard dispatch path applies unchanged: whitelisting, permission
policies (#844), timeouts and step audit records.

Introduced in v0.8.0 (issue #853). Requires the `[mcp]` extra
(`pip install rpaforge-core[mcp]`, MCP Python SDK 2.x) — imported lazily,
nothing is loaded when no servers are declared.

## Declaring servers

Manifest JSON (example):

```json
{
  "servers": [
    {
      "name": "invoices",
      "transport": "stdio",
      "command": "uvx",
      "args": ["mcp-server-invoices"],
      "env": {"API_KEY_FILE": "~/.secrets/invoices"}
    },
    {
      "name": "search",
      "transport": "http",
      "url": "https://mcp.internal.corp/search/mcp",
      "headers": {"Authorization": "Bearer ${MCP_TOKEN}"}
    }
  ]
}
```

| Key | Meaning |
|-----|---------|
| `name` | `[A-Za-z0-9_-]+`; becomes the `MCP:<name>` library. |
| `transport` | `stdio` (spawn `command`+`args`) or `http` (streamable HTTP `url`). |
| `env` / `headers` | Per-server environment / HTTP headers. |

## Resolution order

1. `RPAFORGE_MCP_CONFIG` environment variable → manifest path,
2. `.rpaforge/mcp.json` next to the diagram/project file,
3. none — no MCP tools (the extra is never imported).

A **broken manifest or unreachable server fails the run** (fail-closed) —
a broken MCP setup never silently drops tools.

## Using MCP tools in the agentic-loop

Add `MCP:<server>.<tool_method>` ids to the agentic-loop's
`allowed_activities`. Tool method names are the tool name with
non-alphanumerics replaced by `_`, prefixed `tool_` (e.g. tool `get-invoice`
→ `MCP:invoices.tool_get_invoice`). The catalog given to the model includes
each tool's description and JSON-schema properties.

```robot
# agentic-loop block, allowed activities:
Flow.Set Variable
MCP:invoices.tool_get_invoice
MCP:search.tool_web_search
```

Tool results are unwrapped (single text block → parsed JSON when possible)
and fed back into the loop like activity outputs.

## Programmatic use (SDK)

```python
from rpaforge import StudioEngine

engine = StudioEngine()
registered = engine.register_mcp_servers("path/to/mcp.json")
# -> ["MCP:invoices"]
```

## Notes and limitations

- stdio servers are spawned with a minimal OS environment (`PATH`,
  `SYSTEMROOT`, `TEMP`, `HOME`); pass secrets via `env` references rather
  than the process environment.
- Permission policies apply: with a `process` policy, allowlist the MCP
  server executable; with a `network` policy, allowlist HTTP server hosts.
- The session lives on a background event loop per library; connections
  are closed with the engine.
- Studio configuration editor for `mcp.json` is a follow-up (the file can
  be authored in any editor today).
