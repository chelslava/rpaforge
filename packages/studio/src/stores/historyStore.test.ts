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

  const get = () => useHistoryStore.getState();

  beforeEach(() => {
    get().clearHistory();
  });

  test('pushHistory adds snapshot to undoStack, clears redoStack', () => {
    get().pushHistory([mockNode], [mockEdge]);
    expect(get().undoStack).toHaveLength(1);
    expect(get().undoStack[0]).toEqual({ nodes: [mockNode], edges: [mockEdge] });
    expect(get().redoStack).toHaveLength(0);
  });

  test('undo returns previous snapshot and moves current to redoStack', () => {
    get().pushHistory([mockNode], [mockEdge]);
    const nextNode: Node = { ...mockNode, id: 'node-2' };
    get().pushHistory([nextNode], []);

    const result = get().undo([nextNode], []);

    expect(result).toEqual({ nodes: [mockNode], edges: [mockEdge] });
    expect(get().undoStack).toHaveLength(1);
    expect(get().redoStack).toHaveLength(1);
    expect(get().canUndo()).toBe(true);
    expect(get().canRedo()).toBe(true);
  });

  test('redo returns next snapshot and moves back to undoStack', () => {
    get().pushHistory([mockNode], [mockEdge]);
    const nextNode: Node = { ...mockNode, id: 'node-2' };
    get().pushHistory([nextNode], []);
    get().undo([nextNode], []);

    const result = get().redo([mockNode], [mockEdge]);

    expect(result).toEqual({ nodes: [nextNode], edges: [] });
    expect(get().undoStack).toHaveLength(2);
    expect(get().redoStack).toHaveLength(0);
    expect(get().canUndo()).toBe(true);
    expect(get().canRedo()).toBe(false);
  });

  test('canUndo returns true only when undoStack is non-empty', () => {
    expect(get().canUndo()).toBe(false);
    get().pushHistory([mockNode], [mockEdge]);
    expect(get().canUndo()).toBe(true);
  });

  test('canRedo returns true only when redoStack is non-empty', () => {
    expect(get().canRedo()).toBe(false);
    get().pushHistory([mockNode], [mockEdge]);
    const nextNode: Node = { ...mockNode, id: 'node-2' };
    get().pushHistory([nextNode], []);
    get().undo([nextNode], []);
    expect(get().canRedo()).toBe(true);
  });

  test('maxHistorySize is enforced (oldest entries dropped)', () => {
    const maxSize = get().maxHistorySize;

    for (let i = 0; i < maxSize + 2; i++) {
      get().pushHistory([{ ...mockNode, id: `node-${i}` }], []);
    }

    expect(get().undoStack).toHaveLength(maxSize);
    expect(get().undoStack[0].nodes[0].id).toBe(`node-2`);
  });

  test('undo on empty stack returns null', () => {
    const result = get().undo([mockNode], [mockEdge]);
    expect(result).toBeNull();
    expect(get().canUndo()).toBe(false);
  });

  test('redo on empty stack returns null', () => {
    const result = get().redo([mockNode], [mockEdge]);
    expect(result).toBeNull();
    expect(get().canRedo()).toBe(false);
  });

  test('clearHistory empties both stacks', () => {
    get().pushHistory([mockNode], [mockEdge]);
    const nextNode: Node = { ...mockNode, id: 'node-2' };
    get().pushHistory([nextNode], []);
    get().undo([nextNode], []);

    get().clearHistory();

    expect(get().undoStack).toHaveLength(0);
    expect(get().redoStack).toHaveLength(0);
    expect(get().canUndo()).toBe(false);
    expect(get().canRedo()).toBe(false);
  });
});
