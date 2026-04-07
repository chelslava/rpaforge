## Summary

Implement the unified designer parity plan so Studio matches the documented SDK/wiki contract for activities, connectors, Start-node rules, and graph/codegen behavior.

This issue is the umbrella execution task for the planning artifacts created on 2026-04-05:
- `.omx/plans/prd-designer-sdk-wiki-parity.md`
- `.omx/plans/test-spec-designer-sdk-wiki-parity.md`

## Problem Statement

The current Studio shows activities and connections, but still diverges from the documented contract:
- activity palette and UI are not driven by SDK metadata
- typed connector semantics are partially lost in store/save/load flows
- the diagram invariant `exactly one Start per diagram` is not enforced
- code generation still lags behind typed graph semantics

## Scope

### 1. SDK-driven activity contract
- Align Studio activity types with bridge/SDK payloads (`ports`, `params`, `builtin`, `robotFramework`)
- Remove hardcoded runtime activity catalog usage in the editor
- Render activity nodes from SDK metadata
- Build property editors from SDK params

### 2. Connector semantics and Start invariant
- Preserve typed edge semantics in canvas, store, and serialization
- Enforce exactly one Start on create/load/edit/generate paths
- Improve connection validation and user-facing feedback

### 3. Codegen parity
- Validate Start topology explicitly
- Consume typed graph semantics deterministically
- Close the gap between designer graph and exported Robot code

## Execution Phases

1. Canonical contract: Python bridge payload -> TypeScript UI contract
2. Palette and node creation from SDK data
3. SDK-driven rendering and property editing
4. Connector/store/serialization cleanup + Start invariant enforcement
5. Codegen parity with typed graph semantics
6. Regression coverage and verification

## Dependency Graph

```text
#31 Activity Registry / SDK contract
   ↓
#33 SDK Activity UI Parity

#34 Connector semantics + single Start
   ↓
#27 Code Generator parity

#33 + #34 + #27
   ↓
#32 MVP checklist update/closure
```

## Recommended Delivery Order

1. #31
2. #34
3. #33
4. #27
5. #36 umbrella verification/closure
6. Update #32 based on completed blockers

## Milestones / Checkpoints

### Milestone A — Contract foundation
Primary issue: #31

Checkpoint:
- [ ] Studio has one canonical mapper/type contract for SDK activity payloads
- [ ] `arguments` vs `params` mismatch is resolved
- [ ] Bridge payload fixtures/tests exist for the new contract

Exit criteria:
- #33 can consume SDK activity data without introducing temporary compatibility hacks

### Milestone B — Graph integrity
Primary issue: #34

Checkpoint:
- [ ] New diagrams always start with exactly one Start node
- [ ] Second Start cannot be added through normal editor flows
- [ ] Edge semantics are stored once and preserved in the process store
- [ ] Save/load preserves typed edge metadata without loss

Exit criteria:
- #27 can generate code from a stable graph model instead of a partially flattened edge model

### Milestone C — Activity UI parity
Primary issue: #33
Depends on: Milestone A

Checkpoint:
- [ ] Palette is populated from SDK/bridge data
- [ ] Activity nodes render from SDK metadata
- [ ] Ports shown in the UI reflect actual SDK metadata
- [ ] Property panel editors are generated from SDK params

Exit criteria:
- The editor no longer depends on a hardcoded runtime activity catalog

### Milestone D — Codegen parity
Primary issue: #27
Depends on: Milestone B
Benefits from: Milestone C

Checkpoint:
- [ ] Generator validates Start topology explicitly
- [ ] Generator no longer silently chooses the first Start from an invalid graph
- [ ] Typed branch/edge semantics are either supported or explicitly rejected
- [ ] Codegen tests cover invalid Start topology and typed graph traversal

Exit criteria:
- Export behavior matches the graph semantics enforced by the editor

### Milestone E — Umbrella verification
Primary issues: #36 and #32
Depends on: Milestones A-D

Checkpoint:
- [ ] Acceptance criteria in #36 are all verified
- [ ] Studio and core verification commands are green
- [ ] #32 blocker status is updated
- [ ] Related implementation issues are linked/closed appropriately

Exit criteria:
- #36 can be closed as the umbrella execution tracker

## Execution Checklist

### Phase 1 — Canonical SDK/UI contract (#31)
- [ ] Align Studio activity types with the bridge payload returned from `ActivityMeta.to_dict()`
- [ ] Replace UI assumptions around `arguments` with SDK-driven `params`
- [ ] Explicitly support `ports.inputs`, `ports.outputs`, `builtin`, and `robotFramework`
- [ ] Add regression fixtures/tests for bridge payload parsing in Studio

### Phase 2 — Start invariant and connector/store model (#34)
- [ ] New diagrams are created with exactly one Start node
- [ ] Prevent adding a second Start from palette/canvas flows
- [ ] Prevent removing the last Start without replacement or validation
- [ ] Remove the dual edge-creation path between canvas and store
- [ ] Persist full edge semantics: `sourceHandle`, `targetHandle`, `type`, `data`, `style`
- [ ] Save/load round-trips preserve typed edge semantics without loss
- [ ] Invalid connections surface user-visible feedback instead of only console warnings

### Phase 3 — SDK-driven activity palette and rendering (#33)
- [ ] Populate the activity palette from bridge `getActivities`
- [ ] Remove hardcoded runtime activity catalog usage from the editor
- [ ] Render activity icon/color/category from SDK metadata
- [ ] Render actual SDK ports, including multi-output where supported
- [ ] Keep Start/End as built-in Studio nodes, not SDK-driven activities

### Phase 4 — SDK-driven property editing (#33)
- [ ] Generate property editors from SDK `params`
- [ ] Show builtin settings only when supported by the activity type
- [ ] Expose Robot Framework keyword/library metadata in the property panel
- [ ] Add regression coverage for multi-port and metadata-driven property behavior

### Phase 5 — Graph/codegen parity (#27, depends on #34)
- [ ] Generator validates Start topology explicitly
- [ ] Generator no longer silently picks the first Start from an invalid graph
- [ ] Typed branch semantics are consumed deterministically during generation
- [ ] `switch`, `parallel`, and error-aware graph cases are either supported or explicitly rejected with validation errors
- [ ] Add/expand codegen tests for invalid Start topology and typed graph traversal

### Phase 6 — Umbrella verification and closure (#36)
- [ ] Verify all acceptance criteria in this issue against the implemented behavior
- [ ] Run Studio verification: `cd packages/studio && npm test`
- [ ] Run Studio lint verification: `cd packages/studio && npm run lint`
- [ ] Run core codegen verification: `pytest packages/core/tests/test_codegen.py -v`
- [ ] Run targeted core regression verification: `pytest packages/core/tests -v`
- [ ] Update #32 with the final blocker status after #31/#33/#34/#27 land
- [ ] Close #36 only after all dependent tracks are complete and verified

## Acceptance Criteria

- Activity palette is sourced from bridge `getActivities`
- Activity icon/category/ports/params are SDK-driven
- Start/End remain built-in Studio blocks and match documented behavior
- Every diagram always has exactly one Start
- Edge semantics survive create/save/load/generate without loss
- Codegen does not silently pick the first Start from an invalid graph
- Regression tests cover palette, ports, connector persistence, and Start validation

## Verification

- `cd packages/studio && npm test`
- `cd packages/studio && npm run lint`
- `pytest packages/core/tests/test_codegen.py -v`
- `pytest packages/core/tests -v`

## Related Issues

- #31 Activity Registry and Auto-Discovery
- #33 SDK Activity UI Parity in Designer
- #34 Connector semantics and single-Start invariant must match wiki/docs
- #27 Diagram to Robot Framework Code Generator
- #32 MVP Release Checklist
