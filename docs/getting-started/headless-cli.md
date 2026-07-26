# Headless CLI

Run a saved `.process`, exported `.rpaforge` project, or folder project without
starting Electron:

```bash
rpaforge run ./processes/invoice.process
rpaforge run ./project.rpaforge --diagram main --json
rpaforge run ./project-folder --var environment=ci
```

Use `--var NAME=VALUE` for ordinary parameters. Values that look like JSON are
typed (`true`, `42`, and `"text"`); other values remain strings. Read secrets
from the process environment with `--secret-env NAME=ENV`:

```bash
RPA_TOKEN="..." rpaforge run ./invoice.process --secret-env token=RPA_TOKEN --json
```

Secret values are not included in the result payload or audit metadata. The JSON
result includes `run_id`, `audit_path`, `status`, and elapsed time. Exit codes are
stable: `0` success, `1` execution failure, `2` validation failure, `3`
cancellation or timeout, and `4` configuration/input error.

Use `--timeout SECONDS` for a bounded run. `SIGINT` and `SIGTERM` request the
same cancellation path and clean up owned workers.

For CI:

```bash
rpaforge run ./project.rpaforge --json > run.json
test "$(python -c 'import json; print(json.load(open("run.json"))["status"])')" = success
```

For Windows Task Scheduler, point the action at the installed `rpaforge.exe`,
pass the process path and `--json`, and use the process exit code as the task
success condition. For cron, invoke the same command from the project directory
and redirect the JSON result to an immutable build artifact.
