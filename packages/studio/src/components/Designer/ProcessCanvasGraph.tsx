import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  type Connection,
  type EdgeChange,
  type Node,
  type NodeChange,
  MarkerType,
  ReactFlow,
  SelectionMode,
  useEdgesState,
  useNodesState,
} from '@reactflow/core';
import { Background, BackgroundVariant } from '@reactflow/background';
import { Controls } from '@reactflow/controls';
import { MiniMap } from '@reactflow/minimap';
import { type BlockData } from '../../types/blocks';
import type { Activity } from '../../types/engine';
import { useBlockStore, type ProcessNodeData } from '../../stores/blockStore';
import { useHistoryStore } from '../../stores/historyStore';
import { useSelectionStore } from '../../stores/selectionStore';
import { useExecutionStore } from '../../stores/executionStore';
import { useDebuggerStore } from '../../stores/debuggerStore';
import { useDiagramStore } from '../../stores/diagramStore';
import { edgeTypes } from './Edges';
import { blockNodeTypes } from './Blocks';
import { generateNodeId } from '../../utils/guid';
import CanvasToolbar from './CanvasToolbar';
import CanvasContextMenu from './CanvasContextMenu';
import QuickAddActivity from './QuickAddActivity';
import { useCanvasInteractions } from './hooks/useCanvasInteractions';
import { createActivityBlockData } from '../types/blocks';

interface ContextMenuState {
  isOpen: boolean;
  position: { x: number; y: number };
  nodeId: string | null;
}

interface QuickAddState {
  isOpen: boolean;
  position: { x: number; y: number };
}

export const ProcessCanvasGraph: React.FC = () => {
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const [snapToGrid, setSnapToGrid] = useState(true);
  const [edgeType, setEdgeType] = useState<'default' | 'straight' | 'smoothstep' | 'bendable'>('smoothstep');
  const [isDragOver, setIsDragOver] = useState(false);
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({
    isOpen: false,
    position: { x: 0, y: 0 },
    nodeId: null,
  });
  const [quickAdd, setQuickAdd] = useState<QuickAddState>({
    isOpen: false,
    position: { x: 0, y: 0 },
  });

  const nodeTypes = useMemo(() => blockNodeTypes, []);
  const edgeTypesMemo = useMemo(() => edgeTypes, []);

  const storeNodes = useBlockStore((state) => state.nodes);
  const storeEdges = useBlockStore((state) => state.edges);
  const addNode = useBlockStore((state) => state.addNode);
  const addEdge = useBlockStore((state) => state.addEdge);
  const removeNode = useBlockStore((state) => state.removeNode);
  const removeEdge = useBlockStore((state) => state.removeEdge);
  const updateEdge = useBlockStore((state) => state.updateEdge);
  const updateNodePosition = useBlockStore((state) => state.updateNodePosition);
  const copyNodes = useBlockStore((state) => state.copyNodes);
  const pasteNodes = useBlockStore((state) => state.pasteNodes);
  const duplicateNodes = useBlockStore((state) => state.duplicateNodes);

  const selectedNodeId = useSelectionStore((state) => state.selectedNodeId);
  const setSelectedNode = useSelectionStore((state) => state.setSelectedNode);

  const pushHistory = useHistoryStore((state) => state.pushHistory);

  const currentExecutingNodeId = useExecutionStore((state) => state.currentExecutingNodeId);

  const {
    breakpoints,
    addBreakpoint,
    removeBreakpoint,
  } = useDebuggerStore();
  const openDiagram = useDiagramStore((state) => state.openDiagram);

  const { onNodesChange, onEdgesChange, onConnect, onDrop, onNodeDoubleClick, onNodeContextMenu, onPaneContextMenu, closeContextMenu } = useCanvasInteractions();

  const [nodes, setNodes] = useNodesState(storeNodes);
  const [edges, setEdges] = useEdgesState(storeEdges);

  useEffect(() => {
    setNodes(storeNodes);
  }, [setNodes, storeNodes]);

  useEffect(() => {
    setEdges(storeEdges);
  }, [setEdges, storeEdges]);

  useEffect(() => {
    setEdges((eds) => eds.map((ed) => ({ ...ed, type: edgeType })));
  }, [edgeType, setEdges]);

  useEffect(() => {
    if (edgeType === 'bendable') {
      setEdges((eds) => eds.map((ed) => ({ ...ed, type: 'bendable' })));
    } else {
      setEdges((eds) => eds.map((ed) => ({ ...ed, type: edgeType })));
    }
  }, [edgeType, setEdges]);

  useEffect(() => {
    if (edgeType === 'bendable') {
      setEdges(storeEdges.map(ed => ({ ...ed, type: 'bendable' })));
    } else {
      setEdges(storeEdges);
    }
  }, [storeEdges, setEdges, edgeType]);

  const onPaneDragStart = useCallback((event: React.MouseEvent) => {
    setIsDragOver(true);
  }, []);

  const onPaneDragEnd = useCallback((event: React.MouseEvent) => {
    setIsDragOver(false);
  }, []);

  const onPaneDrop = useCallback(
    async (event: React.DragEvent) => {
      event.preventDefault();
      setIsDragOver(false);

      if (!reactFlowWrapper.current) return;

      const rect = reactFlowWrapper.current.getBoundingClientRect();
      const position = {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      };

      const data = event.dataTransfer.getData('application/json');
      if (!data) return;

      try {
        const { type, data: dragData } = JSON.parse(data) as {
          type: 'block' | 'activity';
          data: BlockData | Activity;
        };

        if (type === 'block') {
          const newBlock = {
            id: dragData.id,
            type: 'block',
            position,
            data: { blockData: dragData },
          };
          addNode(newBlock);
          pushHistory();
        } else if (type === 'activity') {
          const nodeId = generateNodeId();
          const newNode = {
            id: nodeId,
            type: 'activity',
            position,
            data: { activity: dragData },
          };
          const added = addNode(newNode);

          if (added) {
            setSelectedNode(nodeId);
            toast.success(`Added ${dragData.name}`);
          }
          pushHistory();
        }
      } catch (error) {
        console.error('Failed to parse drag data:', error);
      }
    },
    [addNode, addEdge, pushHistory, setSelectedNode],
  );

  const onDiagramLoad = useCallback(() => {
    setSnapToGrid(true);
  }, []);

  const onDiagramUnload = useCallback(() => {
    setSnapToGrid(false);
  }, []);

  return (
    <div className="flex h-full w-full flex-col">
      <CanvasToolbar
        snapToGrid={snapToGrid}
        onSnapToGridChange={setSnapToGrid}
        edgeType={edgeType}
        onEdgeTypeChange={setEdgeType}
        onQuickAdd={() => setQuickAdd({ isOpen: true, position: { x: 0, y: 0 } })}
        onFitView={() => {}}
      />

      <div className="relative flex-1 overflow-hidden" ref={reactFlowWrapper}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onDrop={onDrop}
          onNodeDoubleClick={onNodeDoubleClick}
          onNodeContextMenu={onNodeContextMenu}
          onPaneContextMenu={onPaneContextMenu}
          onPaneDragStart={onPaneDragStart}
          onPaneDragEnd={onPaneDragEnd}
          onPaneDrop={onPaneDrop}
          onFitView={() => {}}
          onInit={onDiagramLoad}
          onSelectChange={onDiagramUnload}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypesMemo}
          selectionOnDrag
          selectionMode={SelectionMode.Partial}
          snapToGrid={snapToGrid}
          snapGrid={[20, 20]}
        >
          <Controls />
          <MiniMap
            nodeColor={(node: Node<ProcessNodeData>) =>
              node.id === currentExecutingNodeId ? '#6366f1' : '#94a3b8'
            }
          />
          <Background variant={BackgroundVariant.Dots} gap={20} size={1} />
        </ReactFlow>

        {isDragOver && (
          <div
            className="absolute inset-0 pointer-events-none border-2 border-dashed border-indigo-500 bg-indigo-500/5 z-10"
            aria-hidden="true"
          />
        )}

        <CanvasContextMenu
          isOpen={contextMenu.isOpen}
          position={contextMenu.position}
          nodeId={contextMenu.nodeId}
          onClose={closeContextMenu}
        />

        <QuickAddActivity
          isOpen={quickAdd.isOpen}
          position={quickAdd.position}
          onClose={() => setQuickAdd({ isOpen: false, position: { x: 0, y: 0 } })}
          onAddActivity={(activity, pos) => {
            const nodeId = generateNodeId();
            const blockData = createActivityBlockData(activity, nodeId);
            const added = addNode({
              id: nodeId,
              type: 'activity',
              position: pos,
              data: {
                activity,
                blockData,
                activityValues: { ...blockData.params },
                builtinSettings: {
                  timeout: blockData.builtin.timeout_ms > 0 ? blockData.builtin.timeout_ms / 1000 : undefined,
                  retryEnabled: blockData.builtin.has_retry ? false : undefined,
                  retryCount: blockData.builtin.has_retry ? 3 : undefined,
                  retryInterval: blockData.builtin.has_retry ? '2s' : undefined,
                  continueOnError: blockData.builtin.has_continue_on_error ? false : undefined,
                },
                description: activity.description,
                tags: [],
              },
            });

            if (added) {
              setSelectedNode(nodeId);
              toast.success(`Added ${activity.name}`);
            }
          }}
        />

        <style>{`
          @keyframes dash {
            to {
              stroke-dashoffset: -10;
            }
          }
          @keyframes shimmer {
            0% {
              transform: translateX(-100%);
            }
            100% {
              transform: translateX(100%);
            }
          }
        `}</style>
      </div>
    </div>
  );
};

export const ProcessCanvas: React.FC = () => {
  return <ProcessCanvasGraph />;
};

export default ProcessCanvas;
