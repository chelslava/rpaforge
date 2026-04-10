/**
 * RPAForge Process Store
 *
 * Manages process state for the visual designer.
 * Supports both standalone and orchestrator modes.
 */

import type { Edge, Node } from '@reactflow/core';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Activity } from '../types/engine';
import { createActivityBlockData, createDefaultBlockData, type BlockData } from '../types/blocks';
import {
  validateDiagram as validateDiagramDomain,
  isStartNode as isStartNodeDomain,
  countStartNodes,
  findStartNode,
  cloneNodes,
  cloneEdges,
  normalizeEdge as normalizeEdgeDomain,
} from '../domain/diagram';
import type { DiagramValidationError } from '../domain/diagram';
import { generateNodeId } from '../utils/guid';

export type ExecutionMode = 'standalone' | 'orchestrator';

export type ExecutionState = 'idle' | 'running' | 'paused' | 'stopped';

export interface ActivityBuiltinState {
  timeout?: number;
  retryEnabled?: boolean;
  retryCount?: number;
  retryInterval?: string;
  continueOnError?: boolean;
}

export interface LegacyNodeArgument {
  name: string;
  type: 'string' | 'variable' | 'expression' | 'number' | 'boolean';
  value: string | number | boolean;
}

export interface ProcessNodeData {
  activity?: Activity;
  blockData?: BlockData;
  activityValues?: Record<string, unknown>;
  builtinSettings?: ActivityBuiltinState;
  description?: string;
  tags?: string[];

  // Legacy fields kept for persisted-diagram compatibility.
  arguments?: LegacyNodeArgument[];
  timeout?: number;
  continueOnError?: boolean;
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
  validationMessage: string | null;

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
  loadProcess: (
    metadata: ProcessMetadata,
    nodes: Node<ProcessNodeData>[],
    edges: Edge[]
  ) => boolean;
  saveProcess: () => {
    metadata: ProcessMetadata | null;
    nodes: Node<ProcessNodeData>[];
    edges: Edge[];
  };

  addNode: (node: Node<ProcessNodeData>) => boolean;
  removeNode: (id: string) => boolean;
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
  setValidationMessage: (message: string | null) => void;
  clearValidationMessage: () => void;

  undo: () => void;
  redo: () => void;
  pushHistory: () => void;

  validateDiagram: () => DiagramValidationError[];
  getStartNode: () => Node<ProcessNodeData> | null;
  hasStartNode: () => boolean;
}

const generateId = generateNodeId;

const isStartNode = isStartNodeDomain;

function createDefaultBuiltinSettings(
  activity?: Activity,
  data?: Partial<ProcessNodeData>
): ActivityBuiltinState | undefined {
  if (!activity && !data?.builtinSettings && data?.timeout === undefined && data?.continueOnError === undefined) {
    return undefined;
  }

  return {
    timeout: data?.builtinSettings?.timeout ?? data?.timeout ?? (activity?.builtin.timeout ? 30 : undefined),
    retryEnabled:
      data?.builtinSettings?.retryEnabled ?? (activity?.builtin.retry ? false : undefined),
    retryCount: data?.builtinSettings?.retryCount ?? (activity?.builtin.retry ? 3 : undefined),
    retryInterval:
      data?.builtinSettings?.retryInterval ?? (activity?.builtin.retry ? '2s' : undefined),
    continueOnError:
      data?.builtinSettings?.continueOnError ??
      data?.continueOnError ??
      (activity?.builtin.continueOnError ? false : undefined),
  };
}

function createStartBlockNode(
  processName = 'Main Process',
  position = { x: 80, y: 120 }
): Node<ProcessNodeData> {
  const id = generateId();
  const startBlockData = createDefaultBlockData('start', id) as Extract<BlockData, { type: 'start' }>;

  const sanitizedProcessName = typeof processName === 'string'
    // eslint-disable-next-line no-control-regex
    ? processName.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    : 'Main Process';

  return {
    id,
    type: 'start',
    position,
    data: {
      blockData: {
        ...startBlockData,
        processName: sanitizedProcessName,
      },
      description: '',
      tags: [],
    },
  };
}

function sanitizeNodes(nodes: Node<ProcessNodeData>[]): Node<ProcessNodeData>[] {
  const sanitize = (str: unknown): string => {
    if (typeof str !== 'string') return '';
    
    // eslint-disable-next-line no-control-regex
    return str.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
  };

  return nodes.map((node) => ({
    ...node,
    data: {
      ...node.data,
      blockData: node.data.blockData ? {
        ...node.data.blockData,
        ...('processName' in node.data.blockData && { processName: sanitize(node.data.blockData.processName) }),
        ...('condition' in node.data.blockData && { condition: sanitize(node.data.blockData.condition) }),
        ...('message' in node.data.blockData && { message: sanitize(node.data.blockData.message) }),
        ...('expression' in node.data.blockData && { expression: sanitize(node.data.blockData.expression) }),
      } : undefined,
      activityValues: node.data.activityValues
        ? Object.fromEntries(
            Object.entries(node.data.activityValues).map(([k, v]) => [k, sanitize(v)])
          )
        : undefined,
    },
  }));
}

function normalizeActivityValues(
  activity: Activity | undefined,
  blockData: BlockData | undefined,
  data: Partial<ProcessNodeData>
): Record<string, unknown> | undefined {
  const fromNode = data.activityValues;
  if (fromNode) {
    return { ...fromNode };
  }

  if (blockData?.type === 'activity' && blockData.params) {
    return { ...blockData.params };
  }

  if (Array.isArray(data.arguments)) {
    return Object.fromEntries(data.arguments.map((argument) => [argument.name, argument.value]));
  }

  if (activity) {
    return Object.fromEntries(activity.params.map((param) => [param.name, param.default ?? '']));
  }

  return undefined;
}

function normalizeNode(node: Node<ProcessNodeData>): Node<ProcessNodeData> {
  const rawData = (node.data ?? {}) as Partial<ProcessNodeData>;
  const activity = rawData.activity;
  const blockData =
    rawData.blockData ??
    (activity ? createActivityBlockData(activity, node.id) : undefined);

  const normalizedBlockData =
    blockData?.type === 'activity' && activity
      ? {
          ...createActivityBlockData(activity, node.id),
          ...blockData,
          params: normalizeActivityValues(activity, blockData, rawData) ?? {},
        }
      : blockData;

  return {
    ...node,
    type: node.type ?? normalizedBlockData?.type ?? 'activity',
    position: node.position ?? { x: 0, y: 0 },
    data: {
      activity,
      blockData: normalizedBlockData,
      activityValues: normalizeActivityValues(activity, normalizedBlockData, rawData),
      builtinSettings: createDefaultBuiltinSettings(activity, rawData),
      description: rawData.description ?? normalizedBlockData?.description,
      tags: rawData.tags ?? [],
    },
  };
}

function normalizeEdge(edge: Edge): Edge {
  return normalizeEdgeDomain(edge);
}

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
      validationMessage: null,

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
        const startNode = createStartBlockNode(name);

        set({
          metadata,
          nodes: [startNode],
          edges: [],
          selectedNodeId: startNode.id,
          validationMessage: null,
          executionState: 'idle',
          undoStack: [],
          redoStack: [],
        });
      },

      loadProcess: (metadata, nodes, edges) => {
        const normalizedNodes = nodes.map(normalizeNode);
        const normalizedEdges = edges.map(normalizeEdge);
        const startCount = countStartNodes(normalizedNodes);

        if (startCount !== 1) {
          set({
            validationMessage:
              'Failed to load diagram: every diagram must contain exactly one Start node.',
          });
          return false;
        }

        set({
          metadata,
          nodes: normalizedNodes,
          edges: normalizedEdges,
          selectedNodeId: null,
          validationMessage: null,
          executionState: 'idle',
          undoStack: [],
          redoStack: [],
        });
        return true;
      },

      saveProcess: () => {
        const { metadata, nodes, edges } = get();
        return { metadata, nodes, edges };
      },

      addNode: (node) => {
        const normalizedNode = normalizeNode(node);

        if (isStartNode(normalizedNode) && countStartNodes(get().nodes) > 0) {
          set({
            validationMessage:
              'Diagram already contains a Start node. Remove the existing Start before adding another one.',
          });
          return false;
        }

        get().pushHistory();
        set((state) => ({
          nodes: [...state.nodes, normalizedNode],
          validationMessage: null,
        }));
        return true;
      },

      removeNode: (id) => {
        const target = get().nodes.find((node) => node.id === id);
        if (target && isStartNode(target) && countStartNodes(get().nodes) === 1) {
          set({
            validationMessage:
              'Diagram must always keep exactly one Start node. Add a replacement Start first.',
          });
          return false;
        }

        get().pushHistory();
        set((state) => ({
          nodes: state.nodes.filter((n) => n.id !== id),
          edges: state.edges.filter((e) => e.source !== id && e.target !== id),
          selectedNodeId: state.selectedNodeId === id ? null : state.selectedNodeId,
          validationMessage: null,
        }));
        return true;
      },

      updateNode: (id, data) => {
        set((state) => ({
          nodes: state.nodes.map((node) => {
            if (node.id !== id) {
              return node;
            }

            const nextBlockData =
              data.blockData || data.activity
                ? normalizeNode({
                    ...node,
                    data: {
                      ...node.data,
                      ...data,
                      blockData: data.blockData
                        ? ({ ...node.data.blockData, ...data.blockData } as BlockData)
                        : node.data.blockData,
                    },
                  }).data.blockData
                : node.data.blockData;

            return {
              ...node,
              data: {
                ...node.data,
                ...data,
                blockData: nextBlockData,
                activityValues: data.activityValues
                  ? { ...node.data.activityValues, ...data.activityValues }
                  : node.data.activityValues,
                builtinSettings: data.builtinSettings
                  ? { ...node.data.builtinSettings, ...data.builtinSettings }
                  : node.data.builtinSettings,
                tags: data.tags ?? node.data.tags,
              },
            };
          }),
        }));
      },

      updateNodePosition: (id, position) => {
        set((state) => ({
          nodes: state.nodes.map((node) => (node.id === id ? { ...node, position } : node)),
        }));
      },

      setSelectedNode: (id) => set({ selectedNodeId: id }),

      addEdge: (edge) => {
        get().pushHistory();
        set((state) => ({
          edges: [...state.edges, normalizeEdge(edge)],
          validationMessage: null,
        }));
      },

      removeEdge: (id) => {
        get().pushHistory();
        set((state) => ({
          edges: state.edges.filter((e) => e.id !== id),
        }));
      },

      connectNodes: (sourceId, targetId) => {
        get().pushHistory();
        set((state) => ({
          edges: [
            ...state.edges,
            normalizeEdge({
              id: `edge_${sourceId}_output_${targetId}_input`,
              source: sourceId,
              target: targetId,
            }),
          ],
        }));
      },

      clearProcess: () => {
        set({
          metadata: null,
          nodes: [],
          edges: [],
          selectedNodeId: null,
          validationMessage: null,
          executionState: 'idle',
          undoStack: [],
          redoStack: [],
        });
      },

      setExecutionState: (state) => set({ executionState: state }),

      setExecutionProgress: (progress) => set({ executionProgress: progress }),

      setCurrentExecutingNode: (id) => set({ currentExecutingNodeId: id }),

      setValidationMessage: (message) => set({ validationMessage: message }),

      clearValidationMessage: () => set({ validationMessage: null }),

      undo: () => {
        const { undoStack, redoStack, nodes, edges } = get();
        if (undoStack.length === 0) return;

        const currentState: UndoState = { nodes: cloneNodes(nodes), edges: cloneEdges(edges) };
        const previousState = undoStack[undoStack.length - 1];

        set({
          nodes: cloneNodes(previousState.nodes),
          edges: cloneEdges(previousState.edges),
          undoStack: undoStack.slice(0, -1),
          redoStack: [...redoStack, currentState],
        });
      },

      redo: () => {
        const { undoStack, redoStack, nodes, edges } = get();
        if (redoStack.length === 0) return;

        const currentState: UndoState = { nodes: cloneNodes(nodes), edges: cloneEdges(edges) };
        const nextState = redoStack[redoStack.length - 1];

        set({
          nodes: cloneNodes(nextState.nodes),
          edges: cloneEdges(nextState.edges),
          undoStack: [...undoStack, currentState],
          redoStack: redoStack.slice(0, -1),
        });
      },

      pushHistory: () => {
        const { nodes, edges, undoStack, maxHistorySize } = get();
        const newState: UndoState = {
          nodes: cloneNodes(nodes),
          edges: cloneEdges(edges),
        };

        set({
          undoStack: [...undoStack, newState].slice(-maxHistorySize),
          redoStack: [],
        });
      },

      validateDiagram: () => {
        const { nodes, edges } = get();
        return validateDiagramDomain(nodes, edges);
      },

      getStartNode: () => {
        const { nodes } = get();
        return findStartNode(nodes);
      },

      hasStartNode: () => countStartNodes(get().nodes) > 0,
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
      onRehydrateStorage: () => (state) => {
        if (state) {
          if (state.nodes) {
            state.nodes = sanitizeNodes(state.nodes);
          }
          if (state.metadata) {
            state.metadata = {
              ...state.metadata,
              // eslint-disable-next-line no-control-regex
              name: state.metadata.name?.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '') || 'Unnamed',
              // eslint-disable-next-line no-control-regex
              description: state.metadata.description?.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, ''),
            };
          }
        }
      },
    }
  )
);

export { createStartBlockNode, isStartNode };
export type { DiagramValidationError };
