# Test Spec: Designer SDK/Wiki Parity

Date: 2026-04-05
Companion plan: `.omx/plans/prd-designer-sdk-wiki-parity.md`

## Test Objectives

Prove that the Studio designer matches documented SDK/wiki behavior for:

1. Activity palette sourcing and rendering
2. Activity parameter editing
3. Connector semantics persistence
4. Single-Start invariant
5. Graph/codegen parity

## Test Matrix

### A. Bridge → UI contract tests

Target files:
- `packages/studio/src/types/engine.ts`
- `packages/core/src/rpaforge/bridge/handlers.py`

Cases:
- SDK payload with `params`, `ports`, `builtin`, `robotFramework` parses into Studio contract
- Activity with multiple outputs preserves output metadata
- Activity with non-default icon/category renders expected presentation values

### B. Palette and node creation tests

Target files:
- `packages/studio/src/components/Designer/ActivityPalette.tsx`
- `packages/studio/src/components/Designer/ProcessCanvas.tsx`

Cases:
- Palette is populated from bridge data, not hardcoded runtime activity arrays
- Drag/drop of an SDK activity preserves metadata needed for render/edit
- Start/End remain built-in Studio blocks and are not mixed into SDK activity lists

### C. Rendering tests

Target files:
- `packages/studio/src/components/Designer/Blocks/BaseBlock.tsx`
- `packages/studio/src/components/Designer/Blocks/ActivityBlock.tsx`

Cases:
- Start uses Start-specific visual styling
- End uses End-specific visual styling
- Conditional ports render separately from default output ports
- Multi-output activity renders all outputs
- Nested/container ports render in the correct positions if supported

### D. Property panel tests

Target files:
- `packages/studio/src/components/Designer/PropertyPanel.tsx`

Cases:
- SDK `params` generate editors by param type/default/required/options
- Builtin settings appear only when supported by activity type
- Robot Framework metadata is visible read-only

### E. Connector/store/serialization tests

Target files:
- `packages/studio/src/types/connections.ts`
- `packages/studio/src/components/Designer/ProcessCanvas.tsx`
- `packages/studio/src/stores/processStore.ts`
- `packages/studio/src/utils/fileUtils.ts`

Cases:
- Creating a connection stores `sourceHandle`, `targetHandle`, `type`, `data`, `style`
- Saving and loading a diagram preserves all typed edge semantics
- Invalid connections are rejected with user-visible feedback
- Parallel/error/conditional edge styles are reachable only where allowed

### F. Start invariant tests

Target files:
- `packages/studio/src/stores/processStore.ts`
- `packages/studio/src/hooks/useFileOperations.ts`
- `packages/core/src/rpaforge/codegen/generator.py`

Cases:
- New diagram starts with exactly one Start
- Adding a second Start is blocked
- Removing the only Start is blocked or auto-replaced
- Loading/importing a diagram with zero or multiple Start nodes fails validation
- Generator rejects invalid Start topology deterministically

### G. Codegen tests

Target files:
- `packages/core/src/rpaforge/codegen/generator.py`
- `packages/core/tests/test_codegen.py`

Cases:
- Branch handle semantics for `if` remain correct
- `switch` graphs either generate correctly or fail with explicit validation
- `parallel` and `try-catch` no longer degrade silently to placeholders when the graph claims richer semantics

## Verification Commands

### Studio
- `cd packages/studio && npm test`
- `cd packages/studio && npm run lint`

### Core
- `pytest packages/core/tests/test_codegen.py -v`
- `pytest packages/core/tests -v`

## Exit Criteria

The plan is considered implemented only when:

1. All acceptance criteria from the PRD are met.
2. No failing tests remain in the targeted Studio/core suites.
3. Save/load preserves connector semantics without field loss.
4. The designer cannot exist in a state with zero or multiple Start nodes.
5. The visible activity/connector behavior matches the documented wiki contract for the implemented scope.
