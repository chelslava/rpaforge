/**
 * RPAForge Process Store
 *
 * Manages process state for the visual designer.
 * Supports both standalone and orchestrator modes.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Node, Edge } from '@reactflow/core';
import type { Activity } from '../types/engine';
import type { BlockData } from '../types/blocks';

export type ExecutionMode = 'standalone' | 'orchestrator';

export type ExecutionState = 'idle' | 'running' | 'paused' | 'stopped';

export interface ProcessNodeData {
  activity?: Activity;
  blockData?: BlockData;
  arguments: NodeArgument[];
  description?: string;
  timeout?: number;
  continueOnError?: boolean;
  tags?: string[];
}

export interface NodeArgument {
  name: string;
  type: 'string' | 'variable' | 'expression' | 'number' | 'boolean';
  value: string | number | boolean;
}

export interface ProcessMetadata {
  id: string;
  name: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
  orchestratorId?: string;
}

export interface UndoState {
  nodes: Node<ProcessNodeData>[];
  edges: Edge[];
}

interface ProcessState {
  mode: ExecutionMode;
  orchestratorUrl: string | null;
  isConnected: boolean;

  metadata: ProcessMetadata | null;
  nodes: Node<ProcessNodeData>[];
  edges: Edge[];
  selectedNodeId: string | null;

  executionState: ExecutionState;
  executionProgress: number;
  currentExecutingNodeId: string | null;

  undoStack: UndoState[];
  redoStack: UndoState[];
  maxHistorySize: number;

  setMode: (mode: ExecutionMode) => void;
  setOrchestratorUrl: (url: string | null) => void;
  setConnected: (connected: boolean) => void;

  createProcess: (name: string, description?: string) => void;
  loadProcess: (metadata: ProcessMetadata, nodes: Node<ProcessNodeData>[], edges: Edge[]) => void;
  saveProcess: () => { metadata: ProcessMetadata | null; nodes: Node<ProcessNodeData>[]; edges: Edge[] };

  addNode: (node: Node<ProcessNodeData>) => void;
  removeNode: (id: string) => void;
  updateNode: (id: string, data: Partial<ProcessNodeData>) => void;
  updateNodePosition: (id: string, position: { x: number; y: number }) => void;
  setSelectedNode: (id: string | null) => void;

  addEdge: (edge: Edge) => void;
  removeEdge: (id: string) => void;
  connectNodes: (sourceId: string, targetId: string) => void;

  clearProcess: () => void;

  setExecutionState: (state: ExecutionState) => void;
  setExecutionProgress: (progress: number) => void;
  setCurrentExecutingNode: (id: string | null) => void;

  undo: () => void;
  redo: () => void;
  pushHistory: () => void;
}

const generateId = () => `node_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

export const useProcessStore = create<ProcessState>()(
  persist(
    (set, get) => ({
      mode: 'standalone',
      orchestratorUrl: null,
      isConnected: false,

      metadata: null,
      nodes: [],
      edges: [],
      selectedNodeId: null,

      executionState: 'idle',
      executionProgress: 0,
      currentExecutingNodeId: null,

      undoStack: [],
      redoStack: [],
      maxHistorySize: 50,

      setMode: (mode) => set({ mode }),

      setOrchestratorUrl: (url) => set({ orchestratorUrl: url }),

      setConnected: (connected) => set({ isConnected: connected }),

      createProcess: (name, description) => {
        const metadata: ProcessMetadata = {
          id: generateId(),
          name,
          description,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        set({
          metadata,
          nodes: [],
          edges: [],
          selectedNodeId: null,
          executionState: 'idle',
          undoStack: [],
          redoStack: [],
        });
      },

      loadProcess: (metadata, nodes, edges) => {
        set({
          metadata,
          nodes,
          edges,
          selectedNodeId: null,
          executionState: 'idle',
          undoStack: [],
          redoStack: [],
        });
      },

      saveProcess: () => {
        const { metadata, nodes, edges } = get();
        return { metadata, nodes, edges };
      },

      addNode: (node) => {
        get().pushHistory();
        set((state) => ({
          nodes: [...state.nodes, node],
        }));
      },

      removeNode: (id) => {
        get().pushHistory();
        set((state) => ({
          nodes: state.nodes.filter((n) => n.id !== id),
          edges: state.edges.filter((e) => e.source !== id && e.target !== id),
          selectedNodeId: state.selectedNodeId === id ? null : state.selectedNodeId,
        }));
      },

      updateNode: (id, data) => {
        set((state) => ({
          nodes: state.nodes.map((node) =>
            node.id === id
              ? { ...node, data: { ...node.data, ...data } }
              : node
          ),
        }));
      },

      updateNodePosition: (id, position) => {
        set((state) => ({
          nodes: state.nodes.map((node) =>
            node.id === id ? { ...node, position } : node
          ),
        }));
      },

      setSelectedNode: (id) => set({ selectedNodeId: id }),

      addEdge: (edge) => {
        set((state) => ({
          edges: [...state.edges, edge],
        }));
      },

      removeEdge: (id) => {
        get().pushHistory();
        set((state) => ({
          edges: state.edges.filter((e) => e.id !== id),
        }));
      },

      connectNodes: (sourceId, targetId) => {
        const edge: Edge = {
          id: `edge_${sourceId}_${targetId}`,
          source: sourceId,
          target: targetId,
        };
        set((state) => ({
          edges: [...state.edges, edge],
        }));
      },

      clearProcess: () => {
        set({
          metadata: null,
          nodes: [],
          edges: [],
          selectedNodeId: null,
          executionState: 'idle',
          undoStack: [],
          redoStack: [],
        });
      },

      setExecutionState: (state) => set({ executionState: state }),

      setExecutionProgress: (progress) => set({ executionProgress: progress }),

      setCurrentExecutingNode: (id) => set({ currentExecutingNodeId: id }),

      undo: () => {
        const { undoStack, redoStack, nodes, edges } = get();
        if (undoStack.length === 0) return;

        const currentState: UndoState = { nodes, edges };
        const previousState = undoStack[undoStack.length - 1];

        set({
          nodes: previousState.nodes,
          edges: previousState.edges,
          undoStack: undoStack.slice(0, -1),
          redoStack: [...redoStack, currentState],
        });
      },

      redo: () => {
        const { undoStack, redoStack, nodes, edges } = get();
        if (redoStack.length === 0) return;

        const currentState: UndoState = { nodes, edges };
        const nextState = redoStack[redoStack.length - 1];

        set({
          nodes: nextState.nodes,
          edges: nextState.edges,
          undoStack: [...undoStack, currentState],
          redoStack: redoStack.slice(0, -1),
        });
      },

      pushHistory: () => {
        const { nodes, edges, undoStack, maxHistorySize } = get();
        const newState: UndoState = { nodes: [...nodes], edges: [...edges] };

        set({
          undoStack: [...undoStack, newState].slice(-maxHistorySize),
          redoStack: [],
        });
      },
    }),
    {
      name: 'rpaforge-process',
      partialize: (state) => ({
        mode: state.mode,
        orchestratorUrl: state.orchestratorUrl,
        metadata: state.metadata,
        nodes: state.nodes,
        edges: state.edges,
      }),
    }
  )
);
