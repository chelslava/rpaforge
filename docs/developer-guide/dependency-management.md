# Dependency management

RPAForge keeps the Python resolver state in the tracked `uv.lock` file and the
JavaScript workspace state in `pnpm-lock.yaml`.

Before opening a dependency or workflow change, run:

```bash
uv lock --check
pnpm install --frozen-lockfile
```

CI, CodeQL, security-audit, and release workflows use the frozen pnpm lockfile.
The Python CI jobs fail on drift with `uv lock --check`; regenerate `uv.lock`
intentionally with `uv lock`, review the resulting diff, and commit it together
with the manifest change. Do not reintroduce `package-lock.json` or ignore
`uv.lock`.
