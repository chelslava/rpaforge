# CI/CD Integration

Supported CI integration for RPAForge projects: validate diagrams, run
`rpaforge-test` specs with coverage gates and JUnit reports, and execute
processes — as reusable GitHub Action / GitLab CI templates instead of
hand-rolled scripts.

Introduced in v0.8.0 (issue #847). The in-repo smoke workflow
(`.github/workflows/action-smoke.yml`) dogfoods the action on
[examples/ci-sample](../../examples/ci-sample/README.md).

## GitHub Actions

This repository ships a composite action (`action.yml`) with three modes:

| Input | Values | Meaning |
|-------|--------|---------|
| `command` | `validate` \| `test` \| `run` | Mode to execute |
| `path` | path | Diagram/`.forge`/project (validate/run) or specs root (test) |
| `install` | `pypi` (default) \| `local` | PyPI release or the calling checkout's `packages/` |
| `python-version` | default `3.12` | Toolchain version |
| `core-version` / `libraries-version` | version spec | Pin when `install=pypi` |
| `extras` | e.g. `llm,otel` | rpaforge-core extras to install |
| `min-coverage` | percent | test mode: global coverage gate (exit 1 below) |
| `junit` | path | test mode: write JUnit XML |
| `junit-artifact` | `true`/`false` | Upload the JUnit report as an artifact |

### Example workflow

```yaml
name: RPA bots
on: [push]

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: chelslava/rpaforge@main
        with:
          command: validate
          path: processes/invoice.process

  test:
    runs-on: ubuntu-latest
    needs: validate
    steps:
      - uses: actions/checkout@v7
      - uses: chelslava/rpaforge@main
        with:
          command: test
          path: tests/diagrams
          min-coverage: "80"
          junit: test-results/junit.xml
          junit-artifact: "true"

  run:
    runs-on: ubuntu-latest
    needs: test
    steps:
      - uses: actions/checkout@v7
      - uses: chelslava/rpaforge@main
        with:
          command: run
          path: processes/invoice.process
```

Pin the action to a release tag (e.g. `chelslava/rpaforge@v0.8.0`) for
stable builds; `@main` follows the repository head.

## GitLab CI

Include the ready-made template
([docs/developer-guide/cicd-templates/gitlab-ci.yml](cicd-templates/gitlab-ci.yml))
and extend the hidden jobs:

```yaml
include:
  - project: 'your-group/rpaforge'
    file: 'docs/developer-guide/cicd-templates/gitlab-ci.yml'
    ref: main

validate-diagram:
  extends: .rpaforge-validate
  variables:
    RPAFORGE_DIAGRAM: processes/invoice.process

diagram-tests:
  extends: .rpaforge-test
  variables:
    RPAFORGE_SPECS: tests/diagrams
    RPAFORGE_MIN_COVERAGE: "80"
    RPAFORGE_JUNIT: rpaforge-junit.xml

run-process:
  extends: .rpaforge-run
  variables:
    RPAFORGE_DIAGRAM: processes/invoice.process
  environment: production
```

The `.rpaforge-test` job wires `RPAFORGE_JUNIT` into GitLab's native
`artifacts:reports:junit`, so spec failures show up in merge requests.

## Exit codes

- `rpaforge-runner validate` — `0` valid, `2` invalid diagram.
- `rpaforge-runner test` — `0` all specs passed, `1` test failure
  (assertion/coverage), `2` discovery/validation error.
- `rpaforge-runner run` — stable codes documented in
  [the headless runner guide](headless-runner.md) (`1` execution failure,
  `4` configuration error, ...).

## Notes

- `test` mode never executes unmocked activities — CI runs are safe by
  construction (see [testing diagrams](testing-diagrams.md)).
- `run` mode executes real activities; prefer queues/daemon (#817) with
  permission policies (#844) for unattended execution outside CI.
- The repository's internal CI does not route through the action (it needs
  the dev toolchain: uv, mypy, vitest); the action targets consumer
  repositories.
