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

## 2. Unattended Server Daemon (`rpaforge-runner serve`)

Run RPAForge as a lightweight background daemon with HTTP REST health probes and webhook execution triggers:

```bash
rpaforge-runner serve --port 8080 --host 0.0.0.0 --auth-token "secret-bearer-token"
```

### Endpoints:
- `GET /health` / `GET /healthz`: Returns liveness and readiness status (`{"status": "ok", "version": "0.5.0"}`).
- `GET /status`: Returns active worker count, memory consumption, and supervisor status.
- `POST /run`: Accepts JSON payload `{ "package_path": "...", "variables": { ... } }` to trigger an isolated execution job.

---

## 3. Project Packaging (`rpaforge-runner pack`)

Bundle an entire automation project into a tamper-evident, portable `.forge` package:

```bash
rpaforge-runner pack ./my-project-dir --output ./dist/invoice_bot.forge
```

- Verifies diagram semantic validity via `ProcessValidator` before packing.
- Generates SHA-256 manifest and integrity signature.
- Produces a single deployable artifact ready for distribution.

---

## 4. Package Inspection (`rpaforge-runner inspect`)

Inspect metadata, entry-point diagrams, variable definitions, and signature of a `.forge` package:

```bash
rpaforge-runner inspect ./dist/invoice_bot.forge
```

---

## 5. Deployment Guides

### Docker Container

```dockerfile
FROM python:3.11-slim
WORKDIR /app

RUN pip install --no-cache-dir rpaforge-core rpaforge-libraries[web,dataframes]

COPY ./dist/invoice_bot.forge /app/workflow.forge

ENTRYPOINT ["rpaforge-runner", "run", "/app/workflow.forge", "--json"]
```

### Windows Task Scheduler / Cron

Configure the action to run `rpaforge-runner.exe run C:\Automations\workflow.forge --json` and inspect exit code `0` for success monitoring.
