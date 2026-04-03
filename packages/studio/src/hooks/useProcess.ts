/**
 * RPAForge useProcess Hook
 *
 * Hook for managing process state and actions.
 */

import { useProcessStore, type ProcessNodeData, type ProcessMetadata, type ExecutionState } from '../stores/processStore';
import type { Node, Edge } from '@reactflow/core';

export interface UseProcessResult {
  mode: 'standalone' | 'orchestrator';
  orchestratorUrl: string | null;
  isConnected: boolean;
  
  metadata: ProcessMetadata | null;
  nodes: Node<ProcessNodeData>[];
  edges: Edge[];
  
  selectedNodeId: string | null;
  
  executionState: ExecutionState;
  executionProgress: number;
  currentExecutingNodeId: string | null;
  undoStack: Array<{ nodes: Node[]; edges: Edge[] }>;
  redoStack: Array<{ nodes: Node[]; edges: Edge[] }>;
  
  setMode: (mode: 'standalone' | 'orchestrator') => void;
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
}

export const useProcess = (): UseProcessResult => {
  const {
    mode,
    orchestratorUrl,
    isConnected,
    metadata,
    nodes,
    edges,
    selectedNodeId,
    executionState,
    executionProgress,
    currentExecutingNodeId,
    undoStack,
    redoStack,
    
    setMode,
    setOrchestratorUrl,
    setConnected,
    createProcess,
    loadProcess,
    saveProcess,
    addNode,
    removeNode,
    updateNode,
    updateNodePosition,
    setSelectedNode,
    addEdge,
    removeEdge,
    connectNodes,
    clearProcess,
    setExecutionState,
    setExecutionProgress,
    setCurrentExecutingNode,
    undo,
    redo,
  } = useProcessStore();

  return {
    mode,
    orchestratorUrl,
    isConnected,
    metadata,
    nodes,
    edges,
    selectedNodeId,
    executionState,
    executionProgress,
    currentExecutingNodeId,
    undoStack,
    redoStack,
    
    setMode,
    setOrchestratorUrl,
    setConnected,
    createProcess,
    loadProcess,
    saveProcess,
    addNode,
    removeNode,
    updateNode,
    updateNodePosition,
    setSelectedNode,
    addEdge,
    removeEdge,
    connectNodes,
    clearProcess,
    setExecutionState,
    setExecutionProgress,
    setCurrentExecutingNode,
    undo,
    redo,
  };
};

export default useProcess;
