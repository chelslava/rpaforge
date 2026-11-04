# Testing Diagrams (rpaforge-test)

Fast, side-effect-free unit tests for diagrams. A test spec loads a diagram,
overrides selected activities with mocks, skips everything unmocked (nothing
runs for real unless explicitly allow-listed), asserts the outcomes, and
measures node coverage. `rpaforge-runner test` executes specs locally or in
CI and emits a JUnit XML report.

Introduced in v0.8.0 (issue #845).

## Writing a spec

A spec is a JSON file named `*.test.json` (or `*.rpaforge-test.json`):

```json
{
  "name": "invoice total",
  "diagram": "process/invoice.process",
  "variables": {"tax_rate": 0.2},
  "mocks": [
    {"activity": "WebUI.Click Element", "return": {"ok": true}},
    {"activity": "HTTP.Fetch", "sequence": [{"status": 200}, {"error": "boom"}]},
    {"activity": "Database.Execute", "raise": "connection refused"}
  ],
  "allow_real": ["Flow.Log"],
  "assert": {
    "process_status": "pass",
    "variables": {"total": 42},
    "expressions": ["total == 42", "status != 'error'"],
    "node_status": {"n3": "pass"},
    "nodes_executed": ["n1", "n2"]
  },
  "min_coverage": 80
}
```

| Key | Meaning |
|-----|---------|
| `name` | Human-readable test name (used in output and JUnit). |
| `diagram` | Path to a `.process`/`.rpaforge`/`.forge` file or project directory (same inputs as `rpaforge-runner run`). Relative paths resolve **against the spec file's directory**. |
| `variables` | Initial variable values (JSON-typed) set before the run. |
| `mocks` | Activity overrides — see below. |
| `allow_real` | Activity patterns that may execute for real. Everything else unmocked is **skipped** (never executed). Patterns use `*`/`?` wildcards (`Rec.*`, `WebUI.Click *`). |
| `assert` | Expected outcomes (see below). |
| `min_coverage` | Per-spec node-coverage threshold in percent (0–100). |

### Mocks

Each mock targets one `Library.Activity` key (exact or wildcard pattern) and
must declare exactly **one** behavior:

- `return` — a fixed value returned on every call;
- `sequence` — a list of values returned in order; an exhausted sequence
  repeats its last value;
- `raise` — an error message; the activity fails, so failure branches can be
  tested deterministically.

Mocks are recorded in results with their disposition, output and call count.

### Assertions

- `process_status` — final run status: `"pass"` / `"fail"` / `"cancelled"`.
- `variables` — exact equality on final variable values.
- `expressions` — boolean expressions over the final variables, evaluated by
  the engine's safe expression evaluator (`total == 42`, `items != null`).
- `node_status` — expected lowercase status per node id
  (`"pass"`/`"fail"`/...); unvisited nodes fail.
- `nodes_executed` — every listed node id must have been reached by the run.

## Node coverage

`covered` = nodes actually exercised — mocked or really executed. Skipped
(reached but unmocked) nodes count as **not covered**: coverage answers
"how much of the diagram did this test really exercise?". The percentage is
`covered / all activity nodes`. A threshold (spec-level `min_coverage` or the
CLI `--min-coverage` global default) fails the spec below the limit (exit 1).

## Running

```bash
# One spec file or a directory scanned recursively for *.test.json
rpaforge-runner test tests/diagrams

# Coverage gate + JUnit report for CI
rpaforge-runner test . --min-coverage 80 --junit junit.xml
```

Exit codes: `0` all specs passed, `1` test failures (assertions, coverage),
`2` discovery/validation errors (no specs, broken spec JSON).

JUnit XML maps assertion failures to `<failure>` and spec load/conversion
errors to `<error>` — ready for Jenkins/GitLab/GitHub test reporters.

## Programmatic use (SDK)

```python
from rpaforge.testing import discover_specs, run_specs

results = run_specs(
    discover_specs("tests/diagrams"),
    min_coverage_default=80,
    register_libraries={"MyLib": MyLib()},  # instances for allow_real
)
```

`register_libraries` makes in-process instances available so
`allow_real` can exercise them without entry-point discovery.

## Semantics notes

- Skipped activities return `None`, complete as `pass`, and never touch the
  library registry — specs are safe by construction (no network, no files,
  no UI automation from unmocked nodes).
- Mocked `raise` participates in retry/error-branch semantics exactly like a
  real failure.
- A spec with no failures passes; an engine run that fails counts as a
  failure only when the spec asserts `process_status: "fail"` mismatch —
  asserting `"fail"` and getting it is a passing test.
- Studio spec authoring UI is a follow-up (out of scope of #845).
