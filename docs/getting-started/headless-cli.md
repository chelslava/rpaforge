# Headless CLI & Unattended Robot Runner

RPAForge provides two command-line tools for running workflows without the Electron Studio UI:
1. `rpaforge`: General-purpose CLI for running processes, linting, and inspecting diagrams.
2. `rpaforge-runner`: Dedicated unattended robot daemon and runner designed for Docker containers, Linux servers, Windows Task Scheduler, and CI/CD pipelines.

---

## 1. Running Workflows (`rpaforge run` & `rpaforge-runner run`)

Execute `.process` files, `.rpaforge` project archives, unpacked project folders, or `.forge` sealed packages:

```bash
# Run a process file
rpaforge-runner run ./processes/invoice.process

# Run a sealed package with JSON output
rpaforge-runner run ./invoice_automation.forge --json

# Run with input variables and bounded timeout
rpaforge-runner run ./project.rpaforge --var environment=production --var batch_size=50 --timeout 300
```

### Passing Input Variables & Secrets

- **Variables (`--var NAME=VALUE`)**: Automatically coerces JSON literals (`true`, `42`, `{"key": "value"}`) while preserving strings.
- **Environment Secrets (`--secret-env NAME=ENV_VAR`)**: Maps process secrets to environment variables without printing them to console or audit logs.

```bash
RPA_API_KEY="..." rpaforge-runner run ./invoice.process --secret-env api_key=RPA_API_KEY --json
```

### Exit Codes & Machine-Readable Output

Exit codes are deterministic:
- `0`: Success
- `1`: Execution failure (activity threw an unhandled exception)
- `2`: Validation failure (broken connection or missing parameters)
- `3`: Cancellation or timeout reached
- `4`: Configuration / input arguments error

With `--json`, stdout returns a structured JSON summary:
```json
{
  "run_id": "run-a1b2c3d4",
  "status": "success",
  "elapsed_sec": 4.12,
  "audit_path": "/var/log/rpaforge/runs/run-a1b2c3d4.jsonl",
  "output_variables": {
    "processed_count": 42
  }
}
```

---

## 2. HTTP Control Plane (`rpaforge-runner serve`)

Expose a small localhost REST surface for health probes, queue metrics and webhook-triggered runs. Triggered items are enqueued into the same SQLite work queue the daemon polls (`rpaforge-runner daemon --queue <name>`), so pair the two commands:

```bash
# Terminal 1: worker consuming the queue
rpaforge-runner daemon --queue jobs --db-path ./queue.db

# Terminal 2: control plane accepting triggers for the same queue
set RPAFORGE_SERVE_TOKEN=secret-bearer-token
rpaforge-runner serve --queue jobs --db-path ./queue.db --port 8765
```

The server binds to `127.0.0.1` by default (`--host`/`--port` to override). The trigger endpoint stays disabled until `RPAFORGE_SERVE_TOKEN` is set (fail-closed).

### Endpoints

- `GET /healthz` — liveness probe (unauthenticated): `{"status": "ok", "queue": "jobs", "uptime_sec": 12.5}`.
- `GET /metrics` — work-queue status counters (unauthenticated): `{"queue": "jobs", "stats": {"New": 2, "In Progress": 1, ...}}`.
- `POST /trigger` — enqueue a run; requires `Authorization: Bearer <token>` (or `X-Auth-Token`):

```bash
curl -X POST http://127.0.0.1:8765/trigger \
  -H "Authorization: Bearer $RPAFORGE_SERVE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"diagram_path": "processes/invoice.process", "variables": {"env": "prod"}, "reference": "INV-101", "priority": "High"}'
```

Returns `202 {"status": "queued", "item_id": "..."}`. The daemon picks the item up and executes the diagram; statuses are observable via `GET /metrics`. Errors: `400` invalid body, `401` bad token, `403` trigger disabled (no token configured), `404` unknown path, `405` wrong method, `413` body over 1 MB.

---

## 3. Cron-Scheduled Execution (`rpaforge-runner daemon --schedules`)

The worker daemon can also fire runs on cron schedules. Give it a JSON file of schedule entries — each cron slot enqueues the diagram into the daemon's work queue, and the daemon executes it like any other item:

```json
[
  {
    "name": "invoices-morning",
    "cron": "30 9 * * 1-5",
    "diagram_path": "processes/invoices.process",
    "variables": {"env": "prod"},
    "priority": "High",
    "reference": "morning-batch",
    "missed_run_policy": "catch_up"
  }
]
```

```bash
rpaforge-runner daemon --queue jobs --db-path ./queue.db \
  --schedules ./schedules.json
```

Fields: `name` (unique), `cron` (standard 5-field: minute hour day-of-month month day-of-week; `*`, lists, ranges and steps are supported; day-of-week accepts 0-6 with 7 as Sunday), `diagram_path`, optional `variables`, `reference`, `priority` (`High`/`Normal`/`Low`), and `missed_run_policy`.

Evaluation is wall-clock in the daemon's local timezone (ICU/zoneinfo aware). A slot that falls into a DST spring-forward gap does not fire that day; fall-back overlap fires once.

### Missed-Run Policy

What happens to occurrences missed while the daemon was down:

- `skip` *(default)* — enqueue only the latest due occurrence, once.
- `catch_up` — enqueue every missed occurrence since the last one.

Last-run positions are persisted to `<schedules>.state.json` (override with `--schedule-state`), so restarting the daemon neither double-fires nor loses the catch-up position. A freshly started daemon fires from the next cron slot onwards — it does not replay history.

---

## 4. Project Packaging (`rpaforge-runner pack`)

Bundle an entire automation project into a tamper-evident, portable `.forge` package:

```bash
rpaforge-runner pack ./my-project-dir --output ./dist/invoice_bot.forge
```

- Verifies diagram semantic validity via `ProcessValidator` before packing.
- Generates SHA-256 manifest and integrity signature.
- Produces a single deployable artifact ready for distribution.

---

## 5. Package Inspection (`rpaforge-runner inspect`)

Inspect metadata, entry-point diagrams, variable definitions, and signature of a `.forge` package:

```bash
rpaforge-runner inspect ./dist/invoice_bot.forge
```

---

## 6. Deployment Guides

### Docker Container

```dockerfile
FROM python:3.12-slim
WORKDIR /app

RUN pip install --no-cache-dir rpaforge-core rpaforge-libraries[web,dataframes]

COPY ./dist/invoice_bot.forge /app/workflow.forge

ENTRYPOINT ["rpaforge-runner", "run", "/app/workflow.forge", "--json"]
```

### Windows Task Scheduler / Cron

Configure the action to run `rpaforge-runner.exe run C:\Automations\workflow.forge --json` and inspect exit code `0` for success monitoring.
