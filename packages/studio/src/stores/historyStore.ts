import { create } from 'zustand';
import type { Edge, Node } from '@reactflow/core';
import { config } from '../config/app.config';

export interface HistorySnapshot {
  nodes: Node[];
  edges: Edge[];
}

interface HistoryState {
  undoStack: HistorySnapshot[];
  redoStack: HistorySnapshot[];
  maxHistorySize: number;

  pushHistory: (nodes: Node[], edges: Edge[]) => void;
  undo: (currentNodes: Node[], currentEdges: Edge[]) => HistorySnapshot | null;
  redo: (currentNodes: Node[], currentEdges: Edge[]) => HistorySnapshot | null;
  canUndo: () => boolean;
  canRedo: () => boolean;
  clearHistory: () => void;
}

export const useHistoryStore = create<HistoryState>((set, get) => ({
  undoStack: [],
  redoStack: [],
  maxHistorySize: config.history.maxSize,

  pushHistory: (nodes, edges) => {
    const snapshot: HistorySnapshot = {
      nodes,
      edges,
    };

    set((state) => ({
      undoStack: [...state.undoStack, snapshot].slice(-state.maxHistorySize),
      redoStack: [],
    }));
  },

  undo: (currentNodes, currentEdges) => {
    const { undoStack, redoStack } = get();
    if (undoStack.length === 0) return null;

    const currentSnapshot: HistorySnapshot = {
      nodes: currentNodes,
      edges: currentEdges,
    };

    const previousSnapshot = undoStack[undoStack.length - 1];

    set({
      undoStack: undoStack.slice(0, -1),
      redoStack: [...redoStack, currentSnapshot],
    });

    return previousSnapshot;
  },

  redo: (currentNodes, currentEdges) => {
    const { undoStack, redoStack } = get();
    if (redoStack.length === 0) return null;

    const currentSnapshot: HistorySnapshot = {
      nodes: currentNodes,
      edges: currentEdges,
    };

    const nextSnapshot = redoStack[redoStack.length - 1];

    set({
      redoStack: redoStack.slice(0, -1),
      undoStack: [...undoStack, currentSnapshot],
    });

    return nextSnapshot;
  },

  canUndo: () => get().undoStack.length > 0,

  canRedo: () => get().redoStack.length > 0,

  clearHistory: () =>
    set({
      undoStack: [],
      redoStack: [],
    }),
}));
