import { useCallback } from 'react';
import type { Node, Edge } from '@reactflow/core';
import { useBlockStore, type ProcessNodeData, type ProcessNode, normalizeNode, createStartBlockNode } from '../stores/blockStore';
import { useHistoryStore } from '../stores/historyStore';
import { useSelectionStore } from '../stores/selectionStore';
import { useExecutionStore, type ExecutionState } from '../stores/executionStore';
import { useProcessMetadataStore, type ProcessMetadata, type ExecutionMode } from '../stores/processMetadataStore';
import { generateNodeId } from '../utils/guid';
import { countStartNodes } from '../domain/diagram';

export interface UseProcessResult {
  mode: ExecutionMode;
  orchestratorUrl: string | null;
  isConnected: boolean;
  
  metadata: ProcessMetadata | null;
  nodes: ProcessNode[];
  edges: Edge[];
  
  selectedNodeId: string | null;
  
  executionState: ExecutionState;
  executionProgress: number;
  currentExecutingNodeId: string | null;
  undoStack: Array<{ nodes: Node[]; edges: Edge[] }>;
  redoStack: Array<{ nodes: Node[]; edges: Edge[] }>;
  
  setMode: (mode: ExecutionMode) => void;
  setOrchestratorUrl: (url: string | null) => void;
  setConnected: (connected: boolean) => void;
  
  createProcess: (name: string, description?: string) => void;
  loadProcess: (metadata: ProcessMetadata, nodes: ProcessNode[], edges: Edge[]) => boolean;
  saveProcess: () => { metadata: ProcessMetadata | null; nodes: ProcessNode[]; edges: Edge[] };
  
  addNode: (node: ProcessNode) => boolean;
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
  
  undo: () => void;
  redo: () => void;
}

export const useProcess = (): UseProcessResult => {
  const nodes = useBlockStore((s) => s.nodes);
  const edges = useBlockStore((s) => s.edges);
  const addBlockNode = useBlockStore((s) => s.addNode);
  const removeBlockNode = useBlockStore((s) => s.removeNode);
  const updateBlockNode = useBlockStore((s) => s.updateNode);
  const updateBlockNodePosition = useBlockStore((s) => s.updateNodePosition);
  const addBlockEdge = useBlockStore((s) => s.addEdge);
  const removeBlockEdge = useBlockStore((s) => s.removeEdge);
  const connectBlockNodes = useBlockStore((s) => s.connectNodes);
  const clearBlocks = useBlockStore((s) => s.clearBlocks);
  const setBlockNodes = useBlockStore((s) => s.setNodes);
  const setBlockEdges = useBlockStore((s) => s.setEdges);

  const selectedNodeId = useSelectionStore((s) => s.selectedNodeId);
  const setSelectedNodeId = useSelectionStore((s) => s.setSelectedNode);
  const clearSelection = useSelectionStore((s) => s.clearSelection);

  const undoStack = useHistoryStore((s) => s.undoStack);
  const redoStack = useHistoryStore((s) => s.redoStack);
  const pushHistory = useHistoryStore((s) => s.pushHistory);
  const performUndo = useHistoryStore((s) => s.undo);
  const performRedo = useHistoryStore((s) => s.redo);
  const clearHistory = useHistoryStore((s) => s.clearHistory);

  const executionState = useExecutionStore((s) => s.executionState);
  const executionProgress = useExecutionStore((s) => s.executionProgress);
  const currentExecutingNodeId = useExecutionStore((s) => s.currentExecutingNodeId);
  const setExecState = useExecutionStore((s) => s.setExecutionState);
  const setExecProgress = useExecutionStore((s) => s.setExecutionProgress);
  const setExecutingNode = useExecutionStore((s) => s.setCurrentExecutingNode);
  const resetExecution = useExecutionStore((s) => s.resetExecution);

  const mode = useProcessMetadataStore((s) => s.mode);
  const orchestratorUrl = useProcessMetadataStore((s) => s.orchestratorUrl);
  const isConnected = useProcessMetadataStore((s) => s.isConnected);
  const metadata = useProcessMetadataStore((s) => s.metadata);
  const setMode = useProcessMetadataStore((s) => s.setMode);
  const setOrchestratorUrl = useProcessMetadataStore((s) => s.setOrchestratorUrl);
  const setConnected = useProcessMetadataStore((s) => s.setConnected);
  const setMetadata = useProcessMetadataStore((s) => s.setMetadata);
  const clearProcessMetadata = useProcessMetadataStore((s) => s.clearProcess);

  const createProcess = useCallback((name: string, description?: string) => {
    const newMetadata: ProcessMetadata = {
      id: generateNodeId(),
      name,
      description,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const startNode = createStartBlockNode(name);

    setMetadata(newMetadata);
    setBlockNodes([startNode]);
    setBlockEdges([]);
    setSelectedNodeId(startNode.id);
    resetExecution();
    clearHistory();
  }, [setMetadata, setBlockNodes, setBlockEdges, setSelectedNodeId, resetExecution, clearHistory]);

  const loadProcess = useCallback((meta: ProcessMetadata, newNodes: ProcessNode[], newEdges: Edge[]): boolean => {
    const normalizedNodes = newNodes.map(normalizeNode);
    const startCount = countStartNodes(normalizedNodes);

    if (startCount !== 1) {
      return false;
    }

    setMetadata(meta);
    setBlockNodes(normalizedNodes);
    setBlockEdges(newEdges);
    clearSelection();
    resetExecution();
    clearHistory();
    return true;
  }, [setMetadata, setBlockNodes, setBlockEdges, clearSelection, resetExecution, clearHistory]);

  const saveProcess = useCallback(() => {
    return { metadata, nodes, edges };
  }, [metadata, nodes, edges]);

  const addNode = useCallback((node: ProcessNode): boolean => {
    pushHistory(nodes, edges);
    const result = addBlockNode(node);
    return result;
  }, [pushHistory, nodes, edges, addBlockNode]);

  const removeNode = useCallback((id: string): boolean => {
    pushHistory(nodes, edges);
    const result = removeBlockNode(id);
    if (result && selectedNodeId === id) {
      setSelectedNodeId(null);
    }
    return result;
  }, [pushHistory, nodes, edges, removeBlockNode, selectedNodeId, setSelectedNodeId]);

  const updateNode = useCallback((id: string, data: Partial<ProcessNodeData>) => {
    updateBlockNode(id, data);
  }, [updateBlockNode]);

  const updateNodePosition = useCallback((id: string, position: { x: number; y: number }) => {
    updateBlockNodePosition(id, position);
  }, [updateBlockNodePosition]);

  const setSelectedNode = useCallback((id: string | null) => {
    setSelectedNodeId(id);
  }, [setSelectedNodeId]);

  const addEdge = useCallback((edge: Edge) => {
    pushHistory(nodes, edges);
    addBlockEdge(edge);
  }, [pushHistory, nodes, edges, addBlockEdge]);

  const removeEdge = useCallback((id: string) => {
    pushHistory(nodes, edges);
    removeBlockEdge(id);
  }, [pushHistory, nodes, edges, removeBlockEdge]);

  const connectNodes = useCallback((sourceId: string, targetId: string) => {
    pushHistory(nodes, edges);
    connectBlockNodes(sourceId, targetId);
  }, [pushHistory, nodes, edges, connectBlockNodes]);

  const clearProcess = useCallback(() => {
    clearProcessMetadata();
    clearBlocks();
    clearSelection();
    resetExecution();
    clearHistory();
  }, [clearProcessMetadata, clearBlocks, clearSelection, resetExecution, clearHistory]);

  const setExecutionState = useCallback((state: ExecutionState) => {
    setExecState(state);
  }, [setExecState]);

  const setExecutionProgress = useCallback((progress: number) => {
    setExecProgress(progress);
  }, [setExecProgress]);

  const setCurrentExecutingNode = useCallback((id: string | null) => {
    setExecutingNode(id);
  }, [setExecutingNode]);

  const undo = useCallback(() => {
    const result = performUndo(nodes, edges);
    if (result) {
      setBlockNodes(result.nodes as ProcessNode[]);
      setBlockEdges(result.edges);
    }
  }, [performUndo, nodes, edges, setBlockNodes, setBlockEdges]);

  const redo = useCallback(() => {
    const result = performRedo(nodes, edges);
    if (result) {
      setBlockNodes(result.nodes as ProcessNode[]);
      setBlockEdges(result.edges);
    }
  }, [performRedo, nodes, edges, setBlockNodes, setBlockEdges]);

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

export type { ProcessNodeData, ProcessNode, ProcessMetadata, ExecutionState, ExecutionMode };
