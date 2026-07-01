import { beforeEach, describe, expect, test } from 'vitest';
import type { Node, Edge } from '@xyflow/react';
import { useHistoryStore } from './historyStore';

describe('historyStore', () => {
  const mockNode: Node = {
    id: 'node-1',
    type: 'default',
    position: { x: 100, y: 100 },
    data: {},
  };
  const mockEdge: Edge = {
    id: 'edge-1',
    source: 'node-1',
    target: 'node-2',
    sourceHandle: 'out',
    targetHandle: 'in',
  };

  beforeEach(() => {
    useHistoryStore.getState().clearHistory();
  });

  test('pushHistory adds snapshot to undoStack, clears redoStack', () => {
    const store = useHistoryStore.getState();
    store.pushHistory([mockNode], [mockEdge]);

    expect(store.undoStack).toHaveLength(1);
    expect(store.undoStack[0]).toEqual({ nodes: [mockNode], edges: [mockEdge] });
    expect(store.redoStack).toHaveLength(0);
  });

  test('undo returns previous snapshot and moves current to redoStack', () => {
    const store = useHistoryStore.getState();
    store.pushHistory([mockNode], [mockEdge]);
    const nextNode: Node = { ...mockNode, id: 'node-2' };
    store.pushHistory([nextNode], []);

    const result = store.undo([nextNode], []);

    expect(result).toEqual({ nodes: [mockNode], edges: [mockEdge] });
    expect(store.undoStack).toHaveLength(1);
    expect(store.redoStack).toHaveLength(1);
    expect(store.canUndo()).toBe(true);
    expect(store.canRedo()).toBe(true);
  });

  test('redo returns next snapshot and moves back to undoStack', () => {
    const store = useHistoryStore.getState();
    store.pushHistory([mockNode], [mockEdge]);
    const nextNode: Node = { ...mockNode, id: 'node-2' };
    store.pushHistory([nextNode], []);
    store.undo([nextNode], []);

    const result = store.redo([mockNode], [mockEdge]);

    expect(result).toEqual({ nodes: [nextNode], edges: [] });
    expect(store.undoStack).toHaveLength(2);
    expect(store.redoStack).toHaveLength(0);
    expect(store.canUndo()).toBe(true);
    expect(store.canRedo()).toBe(false);
  });

  test('canUndo returns true only when undoStack is non-empty', () => {
    const store = useHistoryStore.getState();
    expect(store.canUndo()).toBe(false);

    store.pushHistory([mockNode], [mockEdge]);
    expect(store.canUndo()).toBe(true);
  });

  test('canRedo returns true only when redoStack is non-empty', () => {
    const store = useHistoryStore.getState();
    expect(store.canRedo()).toBe(false);

    store.pushHistory([mockNode], [mockEdge]);
    const nextNode: Node = { ...mockNode, id: 'node-2' };
    store.pushHistory([nextNode], []);
    store.undo([nextNode], []);

    expect(store.canRedo()).toBe(true);
  });

  test('maxHistorySize is enforced (oldest entries dropped)', () => {
    const store = useHistoryStore.getState();
    const maxSize = store.maxHistorySize;

    for (let i = 0; i < maxSize + 2; i++) {
      store.pushHistory([{ ...mockNode, id: `node-${i}` }], []);
    }

    expect(store.undoStack).toHaveLength(maxSize);
    expect(store.undoStack[0].nodes[0].id).toBe(`node-2`);
  });

  test('undo on empty stack returns null', () => {
    const store = useHistoryStore.getState();
    const result = store.undo([mockNode], [mockEdge]);
    expect(result).toBeNull();
    expect(store.canUndo()).toBe(false);
  });

  test('redo on empty stack returns null', () => {
    const store = useHistoryStore.getState();
    const result = store.redo([mockNode], [mockEdge]);
    expect(result).toBeNull();
    expect(store.canRedo()).toBe(false);
  });

  test('clearHistory empties both stacks', () => {
    const store = useHistoryStore.getState();
    store.pushHistory([mockNode], [mockEdge]);
    const nextNode: Node = { ...mockNode, id: 'node-2' };
    store.pushHistory([nextNode], []);
    store.undo([nextNode], []);

    store.clearHistory();

    expect(store.undoStack).toHaveLength(0);
    expect(store.redoStack).toHaveLength(0);
    expect(store.canUndo()).toBe(false);
    expect(store.canRedo()).toBe(false);
  });
});
