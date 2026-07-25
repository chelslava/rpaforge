# Studio renderer bundle budget

The renderer build is measured from the uncompressed files in `dist/assets`.
`pnpm build` runs `check:bundle` immediately after Vite produces the renderer,
so the Electron packaging job fails when a budget regresses.

Baseline on 2026-07-25 before lazy-loading secondary tools:

- Renderer entry: 4,065 KB
- Largest JavaScript chunk: 663 KB
- Largest stylesheet: 116 KB

Current limits:

- Renderer entry: 3,500 KB
- Largest JavaScript chunk: 1,500 KB
- Largest stylesheet: 140 KB

The entry budget protects startup evaluation. The chunk and stylesheet budgets
protect major interaction payloads without preventing intentional small chunks.
