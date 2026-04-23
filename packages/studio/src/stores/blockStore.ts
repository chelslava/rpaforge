import type { Edge, Node } from '@reactflow/core';
import { create } from 'zustand';
import {
  validateDiagram as validateDiagramDomain,
  countStartNodes,
  findStartNode,
  normalizeEdge as normalizeEdgeDomain,
} from '../domain/diagram';
import type { DiagramValidationError } from '../domain/diagram';
import { generateNodeId } from '../utils/guid';
import type { Activity } from '../types/engine';
import { createActivityBlockData, createDefaultBlockData, type BlockData } from '../types/blocks';

export interface ActivityBuiltinState {
  timeout?: number;
  retryEnabled?: boolean;
  retryCount?: number;
  retryInterval?: string;
  continueOnError?: boolean;
}

export interface ProcessNodeData {
  activity?: Activity;
  blockData?: BlockData;
  activityValues?: Record<string, unknown>;
  builtinSettings?: ActivityBuiltinState;
  description?: string;
  tags?: string[];
  outputVariable?: string;
}

export type ProcessNode = Node<ProcessNodeData>;

interface ClipboardData {
  nodes: ProcessNode[];
  edges: Edge[];
}

interface BlockState {
  nodes: ProcessNode[];
  edges: Edge[];
  clipboard: ClipboardData | null;

  setNodes: (nodes: ProcessNode[]) => void;
  setEdges: (edges: Edge[]) => void;
  addNode: (node: ProcessNode) => boolean;
  removeNode: (id: string) => boolean;
  updateNode: (id: string, data: Partial<ProcessNodeData>) => void;
  updateNodePosition: (id: string, position: { x: number; y: number }) => void;
  addEdge: (edge: Edge) => void;
  updateEdge: (id: string, updates: Partial<Edge>) => void;
  removeEdge: (id: string) => void;
  connectNodes: (sourceId: string, targetId: string) => void;

  validateDiagram: () => DiagramValidationError[];
  getStartNode: () => ProcessNode | null;
  hasStartNode: () => boolean;

  copyNodes: (nodeIds: string[]) => void;
  pasteNodes: (offset?: { x: number; y: number }) => { nodes: ProcessNode[]; edges: Edge[] };
  duplicateNodes: (nodeIds: string[]) => { nodes: ProcessNode[]; edges: Edge[] };

  clearBlocks: () => void;
}

const generateId = generateNodeId;

export const isStartNode = (node: Node): boolean =>
  node.data?.blockData?.type === 'start';

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

  if (activity) {
    return Object.fromEntries(activity.params.map((param) => [param.name, param.default ?? '']));
  }

  return undefined;
}

function createDefaultBuiltinSettings(
  activity?: Activity,
  data?: Partial<ProcessNodeData>
): ActivityBuiltinState | undefined {
  if (!activity && !data?.builtinSettings) {
    return undefined;
  }

  return {
    timeout: data?.builtinSettings?.timeout ?? (activity && activity.timeout_ms > 0 ? activity.timeout_ms / 1000 : undefined),
    retryEnabled: data?.builtinSettings?.retryEnabled ?? (activity && activity.has_retry ? false : undefined),
    retryCount: data?.builtinSettings?.retryCount ?? (activity && activity.has_retry ? 3 : undefined),
    retryInterval: data?.builtinSettings?.retryInterval ?? (activity && activity.has_retry ? '2s' : undefined),
    continueOnError: data?.builtinSettings?.continueOnError ?? (activity && activity.has_continue_on_error ? false : undefined),
  };
}

export function normalizeNode(node: ProcessNode): ProcessNode {
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

export function createStartBlockNode(
  processName = 'Main Process',
  position = { x: 80, y: 120 }
): ProcessNode {
  const id = generateId();
  const startBlockData = createDefaultBlockData('start', id) as Extract<BlockData, { type: 'start' }>;

  const sanitizedProcessName = typeof processName === 'string'
    ? processName.replace(/[\0-\b\v\f\016-\037\177]/gu, '')
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

export const useBlockStore = create<BlockState>((set, get) => ({
  nodes: [],
  edges: [],
  clipboard: null,

  setNodes: (nodes) => set({ nodes }),

  setEdges: (edges) => set({ edges }),

  addNode: (node) => {
    const normalizedNode = normalizeNode(node);

    if (isStartNode(normalizedNode) && countStartNodes(get().nodes) > 0) {
      return false;
    }

    set((state) => ({
      nodes: [...state.nodes, normalizedNode],
    }));
    return true;
  },

  removeNode: (id) => {
    const target = get().nodes.find((node) => node.id === id);
    if (target && isStartNode(target) && countStartNodes(get().nodes) === 1) {
      return false;
    }

    set((state) => ({
      nodes: state.nodes.filter((n) => n.id !== id),
      edges: state.edges.filter((e) => e.source !== id && e.target !== id),
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

  updateEdge: (id, updates) => {
    set((state) => ({
      edges: state.edges.map((edge) => (edge.id === id ? { ...edge, ...updates } : edge)),
    }));
  },

  addEdge: (edge) => {
    set((state) => ({
      edges: [...state.edges, normalizeEdgeDomain(edge)],
    }));
  },

  removeEdge: (id) => {
    set((state) => ({
      edges: state.edges.filter((e) => e.id !== id),
    }));
  },

  connectNodes: (sourceId, targetId) => {
    set((state) => ({
      edges: [
        ...state.edges,
        normalizeEdgeDomain({
          id: `edge_${sourceId}_output_${targetId}_input`,
          source: sourceId,
          target: targetId,
        }),
      ],
    }));
  },

  validateDiagram: () => {
    const { nodes, edges } = get();
    return validateDiagramDomain(nodes, edges);
  },

  getStartNode: () => {
    const { nodes } = get();
    return findStartNode(nodes) as ProcessNode | null;
  },

  hasStartNode: () => countStartNodes(get().nodes) > 0,

  copyNodes: (nodeIds) => {
    const { nodes, edges } = get();
    const selectedNodes = nodes.filter((n) => nodeIds.includes(n.id));
    const relatedEdges = edges.filter(
      (e) => nodeIds.includes(e.source) && nodeIds.includes(e.target)
    );

    set({
      clipboard: {
        nodes: selectedNodes.map((n) => ({
          ...n,
          data: JSON.parse(JSON.stringify(n.data)),
        })),
        edges: relatedEdges.map((e) => ({
          ...e,
          data: e.data ? JSON.parse(JSON.stringify(e.data)) : e.data,
        })),
      },
    });
  },

  pasteNodes: (offset = { x: 20, y: 20 }) => {
    const { clipboard } = get();
    if (!clipboard || clipboard.nodes.length === 0) {
      return { nodes: [], edges: [] };
    }

    const nodeIdMap = new Map<string, string>();
    const newNodes: ProcessNode[] = [];

    for (const node of clipboard.nodes) {
      if (isStartNode(node)) continue;

      const newId = generateId();
      nodeIdMap.set(node.id, newId);

      const newNode: ProcessNode = {
        ...node,
        id: newId,
        position: {
          x: node.position.x + offset.x,
          y: node.position.y + offset.y,
        },
        data: {
          ...node.data,
          blockData: node.data.blockData
            ? { ...node.data.blockData, id: newId }
            : undefined,
        },
        selected: false,
      };
      newNodes.push(newNode);
    }

    const newEdges: Edge[] = [];
    for (const edge of clipboard.edges) {
      const newSourceId = nodeIdMap.get(edge.source);
      const newTargetId = nodeIdMap.get(edge.target);

      if (newSourceId && newTargetId) {
        const newEdge: Edge = {
          ...edge,
          id: `edge_${newSourceId}_${edge.sourceHandle || 'output'}_${newTargetId}_${edge.targetHandle || 'input'}`,
          source: newSourceId,
          target: newTargetId,
        };
        newEdges.push(newEdge);
      }
    }

    return { nodes: newNodes, edges: newEdges };
  },

  duplicateNodes: (nodeIds) => {
    get().copyNodes(nodeIds);
    return get().pasteNodes({ x: 30, y: 30 });
  },

  clearBlocks: () => {
    set({
      nodes: [],
      edges: [],
      clipboard: null,
    });
  },
}));

export type { DiagramValidationError };
