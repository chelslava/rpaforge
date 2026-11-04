# CI Sample

Minimal diagram + test spec consumed by the in-repo GitHub Action smoke
workflow (`.github/workflows/action-smoke.yml`) as dogfood for
[action.yml](../../action.yml).

- `ci-sample.process` — two `Flow.Log Message` activities (safe: console
  logging only).
- `ci-sample.test.json` — rpaforge-test spec allowing the real Flow
  activities (no side effects) and asserting full node coverage.

Run the same checks locally:

```bash
pip install ./packages/core ./packages/libraries
rpaforge-runner validate examples/ci-sample/ci-sample.process
rpaforge-runner test examples/ci-sample --min-coverage 100
rpaforge-runner run examples/ci-sample/ci-sample.process
```

See [docs/developer-guide/ci-cd.md](../../docs/developer-guide/ci-cd.md)
for the GitHub Action and GitLab CI usage.
