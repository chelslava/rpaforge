# Diagram Diff & Graph-Level Merge

Visual workflow diff and graph-level merge tool for `.process` diagrams in
the Studio Source Control panel. Introduced in v0.8.0 (issue #850).

## Semantic diagram diff

`packages/studio/src/utils/diagramDiff.ts` parses both revisions of a
`.process` file into node/edge sets and reports:

- **added / removed / modified / moved nodes** — modifications are reported
  at flattened-field granularity (`label`, `condition`, `params.<key>`),
  independent of block type;
- **edge topology changes** — added/removed links (topology-keyed), plus
  retargeted links when an edge id survives with new endpoints;
- **structural hints** — node inserted between two existing nodes (edge
  split) and node deleted with edges rejoined are annotated explicitly;
- **sub-diagram reference changes** — `diagramId`/`diagramName` on
  `sub-diagram-call` nodes;
- **metadata and variable changes** — per key; variables are keyed by their
  `name` field (on-disk `variables` is an array).

Non-diagram content, unparseable revisions and new files fall back to the
existing Monaco text diff.

## Visual rendering

`DiagramDiffViewer` (Source Control → diff on a `.process` file) renders two
read-only panes — base (`HEAD`) and changed (working tree or `:0:` staged
blob) — with added=green / removed=red / modified=amber outlines, plus an
overlay mode (base as gray ghosts under the colored target) and a structured
change list.

**Large-diagram note (500+ nodes):** the render is a plain SVG canvas
(`DiagramMiniCanvas`), not a React Flow canvas — one `rect` + one `text`
element per node, no per-node React state, no effects, a single pure
transform of the document and status maps. The container scrolls instead of
zooming, so rendering cost is linear in node count and a 500-node diagram
stays within one paint frame.

## Graph-level merge

For conflicted `.process` files the Source Control panel shows a **Resolve**
button (`DiagramMergeView`). It loads the git conflict stages
(`gitService.conflictStages` → `:1:`/`:2:`/`:3:` blobs) and runs a 3-way
merge:

- node fields, positions, edges, metadata and variables are merged
  field-by-field; changes from only one side apply automatically;
- divergent changes produce typed conflicts (`node-field`, `node-add`,
  `node-delete` (delete-vs-modify), `edge`, `metadata`, `variable`) with
  per-conflict **keep ours / take theirs** resolution;
- the result is serialized with the standard exporter and validated by the
  standard importer (schema + migration machinery round-trip);
- **Apply & mark resolved** writes the resolved JSON inside the repo
  (`GIT_WRITE_WORKTREE_FILE`, repo-relative-path guarded) and stages the
  file, which clears the conflict.

Non-graph parts (metadata, variables) participate in the same field-level
3-way merge; files that cannot be parsed keep the plain text workflow.

## IPC surface (Electron main)

| Channel | Meaning |
|---------|---------|
| `git:showBlob` | Contents at a revision/`:<stage>:` spec (`null` when absent). |
| `git:readWorktreeFile` | Working-tree contents of a repo-relative path. |
| `git:writeWorktreeFile` | Repo-confined write for resolved merge results. |
| `git:conflictStages` | `{base, ours, theirs}` for an unmerged path. |

All paths are validated by `assertRepoRelativePath` (no absolute paths, no
`..` traversal); revisions must match `^(:[0-3]|[0-9A-Za-z][0-9A-Za-z._/-]{0,126})$`
so a revision can never inject git flags.
