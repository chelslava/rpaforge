# PRD: Designer SDK/Wiki Parity Implementation

Date: 2026-04-05
Status: Drafted from repository/wiki audit
Scope: Studio designer only; no production implementation in this planning artifact

## Requirements Summary

Bring the Studio designer into parity with the documented SDK/wiki contract for:

1. SDK-driven activity rendering and editing
2. Connector semantics and persistence
3. Single-Start diagram invariant
4. Codegen parity with typed graph semantics

## Evidence Baseline

- Wiki says Start/End are built into Studio, not SDK activities: `docs/wiki/Activity-Types-and-SDK.md:24`
- Wiki says every diagram must have exactly one Start block: `docs/wiki/Visual-Block-System.md:104`
- Wiki defines typed connection styles and nested/top-bottom ports: `docs/wiki/Visual-Block-System.md:394-405`
- SDK already exposes metadata payloads (`ports`, `params`, `builtin`, `robotFramework`): `packages/core/src/rpaforge/sdk/__init__.py:121-179`
- Bridge already returns SDK registry payloads via `getActivities`: `packages/core/src/rpaforge/bridge/handlers.py:446-460`
- Studio still uses hardcoded activity catalog: `packages/studio/src/hooks/useDesigner.ts:48-92`
- Activity palette still renders from local hardcoded categories: `packages/studio/src/components/Designer/ActivityPalette.tsx:21-34`, `packages/studio/src/components/Designer/ActivityPalette.tsx:246-270`
- Studio UI type expects `arguments`, not SDK `params`: `packages/studio/src/types/engine.ts:84-95`
- Generic activity node falls back to hardcoded block metadata: `packages/studio/src/components/Designer/Blocks/ActivityBlock.tsx:8-10`
- Generic block port config forces activity to single input/output: `packages/studio/src/types/blocks.ts:106-109`
- Connect flow creates a typed edge locally, then a second flattened edge in store: `packages/studio/src/components/Designer/ProcessCanvas.tsx:81-89`, `packages/studio/src/stores/processStore.ts:208-215`
- New diagrams are created without a Start node: `packages/studio/src/stores/processStore.ts:123-140`
- Code generator uses the first Start it finds and only preserves `if` branch handles: `packages/core/src/rpaforge/codegen/generator.py:66-72`, `packages/core/src/rpaforge/codegen/generator.py:165-176`

## Goals

### Goal 1 — SDK-driven activity UX
The designer must consume runtime metadata from the SDK instead of relying on hardcoded activity catalogs and generic activity rendering.

### Goal 2 — Graph correctness
The stored graph must preserve `sourceHandle`, `targetHandle`, edge type, edge data, and styling semantics through create/save/load/generate flows.

### Goal 3 — Diagram invariant enforcement
Every diagram must always contain exactly one Start node, and designer flows must enforce that invariant consistently.

### Goal 4 — Codegen parity
Code generation must consume the same typed graph semantics the designer renders and stores.

## Non-Goals

- Recorder/orchestrator work
- Non-designer library implementation work
- Full nested-diagram feature implementation beyond parity requirements already documented

## Acceptance Criteria

1. Activity palette content is loaded from bridge `getActivities`, not `useDesigner` hardcoded activity arrays.
2. Activity nodes render icon/category/color/ports from SDK metadata, including multi-output and non-flow ports where supported by the model.
3. Property panel renders SDK parameter editors from `params`, and shows builtin/Robot Framework metadata consistently.
4. Start node creation rules guarantee exactly one Start on new, loaded, and edited diagrams.
5. Edge persistence retains typed connection semantics across canvas state, store state, file save/load, and code generation.
6. `switch`, `parallel`, and error-aware connector semantics are either fully implemented or explicitly validated/restricted so the UI cannot create misleading graphs.
7. Code generator rejects invalid Start topology and consumes typed connection semantics deterministically.
8. Regression coverage exists for palette loading, multi-port rendering, edge persistence, and Start invariant enforcement.

## Implementation Plan

### Phase 1 — Canonical data contract
Files:
- `packages/studio/src/types/engine.ts`
- `packages/studio/src/hooks/useEngine.ts`
- `packages/core/src/rpaforge/sdk/__init__.py`
- `packages/core/src/rpaforge/bridge/handlers.py`

Tasks:
- Replace the Studio-side `Activity` contract that assumes `arguments` with a UI contract aligned to SDK `ActivityMeta.to_dict()`.
- Make the bridge response the canonical source for palette/node/property data.
- Explicitly map builtin settings and RF metadata needed by the property panel.

### Phase 2 — Palette and node creation
Files:
- `packages/studio/src/hooks/useDesigner.ts`
- `packages/studio/src/components/Designer/ActivityPalette.tsx`
- `packages/studio/src/components/Designer/ProcessCanvas.tsx`

Tasks:
- Remove hardcoded runtime activity catalog from `useDesigner`.
- Load palette data from bridge `getActivities`.
- Preserve SDK metadata when dropping an activity on the canvas so node creation does not collapse to a generic activity shape.

### Phase 3 — SDK-driven rendering and property editing
Files:
- `packages/studio/src/components/Designer/Blocks/ActivityBlock.tsx`
- `packages/studio/src/components/Designer/Blocks/BaseBlock.tsx`
- `packages/studio/src/types/blocks.ts`
- `packages/studio/src/components/Designer/PropertyPanel.tsx`

Tasks:
- Refactor activity node rendering to derive icon/category/ports from metadata instead of `createDefaultBlockData('activity')`.
- Separate Start/End visual styling from generic `flow-control`.
- Add support for conditional/multi-output/error/event/data/nested ports where allowed by the model.
- Replace generic `arguments` editing UI with metadata-driven parameter editors.

### Phase 4 — Connector semantics and Start invariant
Files:
- `packages/studio/src/types/connections.ts`
- `packages/studio/src/components/Designer/ProcessCanvas.tsx`
- `packages/studio/src/stores/processStore.ts`
- `packages/studio/src/utils/fileUtils.ts`

Tasks:
- Remove dual edge creation paths so the store owns the full typed edge object.
- Persist `sourceHandle`, `targetHandle`, edge `type`, `data`, and `style`.
- Enforce exactly one Start at create/add/remove/load/import time.
- Improve connection validation and user-facing errors for invalid link attempts.

### Phase 5 — Codegen and serialization parity
Files:
- `packages/core/src/rpaforge/codegen/generator.py`
- `packages/core/tests/test_codegen.py`
- `packages/studio/src/hooks/useFileOperations.ts`
- `packages/studio/src/utils/fileUtils.ts`

Tasks:
- Make generator validate Start topology instead of selecting the first Start silently.
- Expand generator graph traversal beyond current `if true/false` special-casing.
- Keep serialization/deserialization lossless for typed edges and node metadata.

### Phase 6 — Verification and hardening
Files:
- `packages/studio` test suite
- `packages/core/tests/test_codegen.py`

Tasks:
- Add regression tests for:
  - palette from bridge data
  - multi-port activity rendering
  - typed edge round-trip save/load
  - Start invariant enforcement
  - generator behavior with invalid/multiple/missing Start nodes

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| UI contract drift between Python and TypeScript | Palette/rendering regressions | Introduce one explicit shared mapping layer and regression fixtures from bridge payloads |
| Partial connector support creates misleading UX | Invalid diagrams still look valid | Gate unsupported connector types behind validation until fully implemented |
| Save/load migrations break older files | Existing diagrams may degrade | Add compatibility handling and fixture-based load tests |
| Codegen parity lags behind UI | Exported Robot code diverges from designer behavior | Treat graph semantics and generator changes as one verification lane |

## Verification Steps

1. Validate bridge payload shape against the updated Studio type contract.
2. Verify new diagram creation always includes one Start and prohibits duplicates.
3. Verify edge objects remain identical in semantic fields before save and after load.
4. Verify activity palette groups by SDK category and shows SDK icon/description.
5. Verify at least one multi-output activity and one non-default connector style render correctly.
6. Verify generator behavior for:
   - valid single-Start graph
   - missing Start
   - duplicate Start
   - typed branch handles beyond the current `if` happy path

## Related GitHub Issues

- #31 Activity Registry and Auto-Discovery
- #33 SDK Activity UI Parity in Designer
- #34 Connector semantics and single-Start invariant must match wiki/docs
- #27 Diagram to Robot Framework Code Generator
- #32 MVP Release Checklist
