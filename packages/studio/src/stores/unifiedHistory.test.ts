import { beforeEach, describe, expect, test } from 'vitest';
import { useHistoryStore } from './historyStore';
import { useBlockStore, type ProcessNode } from './blockStore';
import type { ProcessNodeData } from './processStore';

/**
 * #684 — Single source of truth for undo/redo.
 *
 * Before this refactor there were two divergent undo stacks:
 *   - processStore.undo/redo/pushHistory (removed)
 *   - useHistoryStore.undo/redo/pushHistory (the live one)
 *
 * The canvas (ProcessCanvas), the status bar, the property panel and the
 * toolbar now all read/write the SAME useHistoryStore stack, while node/edge
 * positions live in useBlockStore. These tests lock that contract in place and
 * model the exact toolbar "align nodes" flow (pushHistory(before) ->
 * updateNodePosition(after)) so a toolbar action is undoable across every
 * surface.
 */
describe('unified history (single source of truth)', () => {
  const history = () => useHistoryStore.getState();
  const block = () => useBlockStore.getState();

  const makeNode = (id: string, x: number, y: number): ProcessNode => ({
    id,
    type: 'activity',
    position: { x, y },
    data: { description: '', tags: [] } as ProcessNodeData,
  });

  beforeEach(() => {
    history().clearHistory();
    block().setNodes([]);
    block().setEdges([]);
  });

  test('canvas and toolbar share the same undo stack (one push, one entry)', () => {
    const a = makeNode('a', 0, 0);
    const b = makeNode('b', 100, 0);
    block().setNodes([a, b]);

    // Toolbar "align left": pushes current blockState BEFORE mutating,
    // then writes the new positions back through blockStore.
    history().pushHistory(block().nodes, block().edges);
    block().updateNodePosition('b', { x: 0, y: 0 });

    expect(history().undoStack).toHaveLength(1);
    expect(history().undoStack[0].nodes).toHaveLength(2);

    // The aligned position is visible in the live store.
    expect(block().nodes.find((n) => n.id === 'b')?.position).toEqual({ x: 0, y: 0 });
  });

  test('undo restores the pre-toolbar layout across the shared stack', () => {
    const a = makeNode('a', 0, 0);
    const b = makeNode('b', 100, 0);
    block().setNodes([a, b]);

    // Snapshot the pre-action state, then simulate the toolbar mutation.
    history().pushHistory(block().nodes, block().edges);
    block().updateNodePosition('b', { x: 12, y: 34 });

    const previous = history().undo(block().nodes, block().edges);
    expect(previous).not.toBeNull();
    expect(previous!.nodes.find((n) => n.id === 'b')?.position).toEqual({ x: 100, y: 0 });

    // Apply it back to the live store, as ProcessCanvas.applySnapshot does.
    previous!.nodes.forEach((n) => {
      if (n.position) block().updateNodePosition(n.id, n.position);
    });
    expect(block().nodes.find((n) => n.id === 'b')?.position).toEqual({ x: 100, y: 0 });

    // The undone entry moved into the redo stack on the same store.
    expect(history().redoStack).toHaveLength(1);
    expect(history().canUndo()).toBe(false);
    expect(history().canRedo()).toBe(true);
  });

  test('redo replays the toolbar action after undo', () => {
    const a = makeNode('a', 0, 0);
    const b = makeNode('b', 100, 0);
    block().setNodes([a, b]);

    history().pushHistory(block().nodes, block().edges);
    block().updateNodePosition('b', { x: 50, y: 50 });

    history().undo(block().nodes, block().edges);
    const next = history().redo(block().nodes, block().edges);
    expect(next).not.toBeNull();
    const redoNode = next!.nodes.find((n) => n.id === 'b');
    block().updateNodePosition('b', redoNode!.position!);
    expect(block().nodes.find((n) => n.id === 'b')?.position).toEqual({ x: 50, y: 50 });
  });

  test('every history surface reports the same canUndo/canRedo state', () => {
    // Status bar and toolbar both disable their buttons from the same stack.
    expect(history().canUndo()).toBe(false);
    expect(history().canRedo()).toBe(false);

    const a = makeNode('a', 0, 0);
    block().setNodes([a]);
    history().pushHistory(block().nodes, block().edges);
    expect(history().canUndo()).toBe(true);
    expect(history().canRedo()).toBe(false);

    history().undo(block().nodes, block().edges);
    expect(history().canUndo()).toBe(false);
    expect(history().canRedo()).toBe(true);

    history().redo(block().nodes, block().edges);
    expect(history().canUndo()).toBe(true);
    expect(history().canRedo()).toBe(false);
  });

  test('new action clears the redo branch on the single stack', () => {
    const a = makeNode('a', 0, 0);
    block().setNodes([a]);

    history().pushHistory(block().nodes, block().edges);
    history().undo(block().nodes, block().edges);
    expect(history().canRedo()).toBe(true);

    // A fresh action must reset the redo branch.
    history().pushHistory(block().nodes, block().edges);
    expect(history().canRedo()).toBe(false);
  });
});