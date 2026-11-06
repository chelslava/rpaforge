# Parallel Demo

Minimal end-to-end example of the **parallel block** (issue #856): two
branches execute **concurrently**, then the process continues at the merge
node.

```
Start ──► Parallel ─┬─ branch-1 "Slow branch": Delay 2s ──► Log ──┐
                    │                                             ├─► Log merge ──► End
                    └─ branch-2 "Fast branch": Log ─► Delay 0.5s ─┘
```

Branch 2 finishes while branch 1 is still sleeping — the engine runs
branches in separate threads inside a `ParallelGroup` (fail-fast is enabled
by default; uncheck "Fail fast" in the Studio property panel to let all
branches finish).

## Run from the repository root

```bash
python examples/parallel-demo/script.py
```

Expected output: interleaved branch logs, then the merge line, then
`Status: ExecutionStatus.PASS`.

## What it demonstrates

- `parallel` diagram node → `ParallelGroup` conversion
  (`rpaforge.core.diagram_converter`)
- Branch handles (`branch-1`, `branch-2`, …) wired from the Studio canvas
- Merge-node continuation after the concurrent section
- Validation warnings for degenerate parallel wiring (0/1 branches,
  declared-but-unconnected branches)
