import React, { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  type Connection,
  type EdgeChange,
  type Node,
  type NodeChange,
  MarkerType,
  ReactFlow,
  ReactFlowProvider,
  SelectionMode,
  useEdgesState,
  useNodesState,
  useReactFlow,
} from '@reactflow/core';
import { Background, BackgroundVariant } from '@reactflow/background';
import { Controls } from '@reactflow/controls';
import { MiniMap } from '@reactflow/minimap';
import { createActivityBlockData, type BlockData } from '../../types/blocks';
import { edgeTypes } from './Edges';
import { ConnectionLine } from './Edges/ConnectionLine';
import { blockNodeTypes } from './Blocks';
import { generateNodeId } from '../../utils/guid';
import { createLogger } from '../../utils/logger';
import { Activity } from '../../types/engine';
import { validateConnection, createConnection, CONNECTION_STYLES } from '../../types/connections';
import { useShallow } from 'zustand/shallow';
import { useBlockStore, type ProcessNodeData } from '../../stores/blockStore';
import { useHistoryStore } from '../../stores/historyStore';
import { useSelectionStore } from '../../stores/selectionStore';
import { useExecutionStore } from '../../stores/executionStore';
import { useDiagramStore } from '../../stores/diagramStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts';
import { useThrottledCallback } from '../../hooks/useThrottledCallback';
import CanvasToolbar, { type EdgeTypeOption } from './CanvasToolbar';
import CanvasContextMenu from './CanvasContextMenu';
import QuickAddActivity from './QuickAddActivity';
import '@reactflow/controls/dist/style.css';
import '@reactflow/core/dist/style.css';
import '@reactflow/minimap/dist/style.css';

interface DragData {
  type: 'block' | 'activity';
  data: BlockData | Activity;
}

interface ContextMenuState {
  isOpen: boolean;
  position: { x: number; y: number };
  nodeId: string | null;
}

interface QuickAddState {
  isOpen: boolean;
  position: { x: number; y: number };
}

const logger = createLogger('ProcessCanvas');

// Define node and edge types outside component to prevent recreation
const nodeTypes = blockNodeTypes;
const edgeTypesConfig = edgeTypes;

const ProcessCanvasInner: React.FC = () => {
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const { screenToFlowPosition } = useReactFlow();
  const [snapToGrid, setSnapToGrid] = useState(true);
  const [edgeType, setEdgeType] = useState<EdgeTypeOption>('auto-route');
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

  const storeNodes = useBlockStore(useShallow((state) => state.nodes));
  const storeEdges = useBlockStore(useShallow((state) => state.edges));
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
  const undoHistory = useHistoryStore((state) => state.undo);
  const redoHistory = useHistoryStore((state) => state.redo);
  const undoStack = useHistoryStore((state) => state.undoStack);
  const redoStack = useHistoryStore((state) => state.redoStack);

  const showMiniMap = useSettingsStore((state) => state.designer.showMinimap);
  const setDesignerSettings = useSettingsStore((state) => state.setDesignerSettings);

  const currentExecutingNodeId = useExecutionStore((state) => state.currentExecutingNodeId);

  const miniMapNodeColor = useCallback(
    (node: Node<ProcessNodeData>) => node.id === currentExecutingNodeId ? '#6366f1' : '#94a3b8',
    [currentExecutingNodeId]
  );

  useEffect(() => {
    if (selectedNodeId && reactFlowWrapper.current) {
      const blockElement = reactFlowWrapper.current.querySelector(`[data-node-id="${selectedNodeId}"]`);
      if (blockElement) {
        if (document.activeElement !== blockElement) {
          (blockElement as HTMLElement).focus();
        }
      }
    }
  }, [selectedNodeId]);

  const { breakpoints, addBreakpoint, removeBreakpoint } = useExecutionStore(
    useShallow((state) => ({
      breakpoints: state.breakpoints,
      addBreakpoint: state.addBreakpoint,
      removeBreakpoint: state.removeBreakpoint,
    }))
  );
  const openDiagram = useDiagramStore((state) => state.openDiagram);

  useKeyboardShortcuts(
    {
      copy: () => {
        if (selectedNodeId) {
          copyNodes([selectedNodeId]);
          toast.success('Node copied');
        }
      },
      paste: () => {
        const { nodes: newNodes, edges: newEdges } = pasteNodes();
        if (newNodes.length > 0) {
          pushHistory(storeNodes, storeEdges);
          for (const node of newNodes) {
            addNode(node);
          }
          for (const edge of newEdges) {
            addEdge(edge);
          }
          setSelectedNode(newNodes[0].id);
        }
      },
      cut: () => {
        if (selectedNodeId) {
          copyNodes([selectedNodeId]);
          pushHistory(storeNodes, storeEdges);
          removeNode(selectedNodeId);
          toast.success('Node cut');
        }
      },
      duplicate: () => {
        if (selectedNodeId) {
          const { nodes: newNodes, edges: newEdges } = duplicateNodes([selectedNodeId]);
          if (newNodes.length > 0) {
            pushHistory(storeNodes, storeEdges);
            for (const node of newNodes) {
              addNode(node);
            }
            for (const edge of newEdges) {
              addEdge(edge);
            }
            setSelectedNode(newNodes[0].id);
            toast.success('Node duplicated');
          }
        }
      },
      undo: () => {
        const snapshot = undoHistory(storeNodes, storeEdges);
        if (snapshot) {
          setNodes(snapshot.nodes);
          setEdges(snapshot.edges.map(ed => ({ ...ed, type: edgeType })));
        }
      },
      redo: () => {
        const snapshot = redoHistory(storeNodes, storeEdges);
        if (snapshot) {
          setNodes(snapshot.nodes);
          setEdges(snapshot.edges.map(ed => ({ ...ed, type: edgeType })));
        }
      },
      quickAdd: () => {
        const canvasRect = reactFlowWrapper.current?.getBoundingClientRect();
        if (canvasRect) {
          setQuickAdd({
            isOpen: true,
            position: {
              x: canvasRect.left + canvasRect.width / 2 - 160,
              y: canvasRect.top + 100,
            },
          });
        }
      },
      navNext: () => {
        if (storeNodes.length === 0) return;
        const currentIdx = selectedNodeId
          ? storeNodes.findIndex((n) => n.id === selectedNodeId)
          : -1;
        const nextIdx = (currentIdx + 1) % storeNodes.length;
        setSelectedNode(storeNodes[nextIdx].id);
      },
      navPrev: () => {
        if (storeNodes.length === 0) return;
        const currentIdx = selectedNodeId
          ? storeNodes.findIndex((n) => n.id === selectedNodeId)
          : 0;
        const prevIdx = (currentIdx - 1 + storeNodes.length) % storeNodes.length;
        setSelectedNode(storeNodes[prevIdx].id);
      },
      navConfirm: () => {
        if (selectedNodeId) {
          setSelectedNode(selectedNodeId);
          const propertiesPanel = document.querySelector('[data-panel="properties"]') as HTMLElement | null;
          propertiesPanel?.focus();
        }
      },
      navEscape: () => {
        setSelectedNode(null);
      },
      navArrowUp: (nodeId) => {
        if (nodeId) setSelectedNode(nodeId);
      },
      navArrowDown: (nodeId) => {
        if (nodeId) setSelectedNode(nodeId);
      },
      navArrowLeft: (nodeId) => {
        if (nodeId) setSelectedNode(nodeId);
      },
      navArrowRight: (nodeId) => {
        if (nodeId) setSelectedNode(nodeId);
      },
    },
    {
      nodes: storeNodes.map((n) => ({
        id: n.id,
        position: n.position,
      })),
      selectedNodeId: selectedNodeId ?? undefined,
    }
  );

  const [nodes, setNodes, onNodesChange] = useNodesState(storeNodes);
  const [edges, setEdges] = useEdgesState(storeEdges);

  const onNodeDoubleClick = useCallback(
    (_event: React.MouseEvent, node: Node<ProcessNodeData>) => {
      const subDiagramId =
        node.data.blockData?.type === 'sub-diagram-call'
          ? node.data.blockData.diagramId
          : undefined;

      if (subDiagramId) {
        openDiagram(subDiagramId);
        return;
      }

      const existingBreakpoint = Array.from(breakpoints.values()).find(
        (bp) => bp.nodeId === node.id || bp.file === node.id
      );

      if (existingBreakpoint) {
        removeBreakpoint(existingBreakpoint.id);
      } else {
        addBreakpoint({
          id: `bp-${node.id}-${Date.now()}`,
          file: node.id,
          line: 0,
          nodeId: node.id,
          enabled: true,
        });
      }
    },
    [breakpoints, addBreakpoint, openDiagram, removeBreakpoint]
  );

  const onNodeContextMenu = useCallback(
    (event: React.MouseEvent, node: Node<ProcessNodeData>) => {
      event.preventDefault();
      setContextMenu({
        isOpen: true,
        position: { x: event.clientX, y: event.clientY },
        nodeId: node.id,
      });
    },
    []
  );

  const onPaneContextMenu = useCallback((event: React.MouseEvent) => {
    event.preventDefault();
    setContextMenu({
      isOpen: true,
      position: { x: event.clientX, y: event.clientY },
      nodeId: null,
    });
  }, []);

  const closeContextMenu = useCallback(() => {
    setContextMenu({ isOpen: false, position: { x: 0, y: 0 }, nodeId: null });
  }, []);

  const syncNodesToFlow = useCallback(
    (currentNodes: Node<ProcessNodeData>[]) => {
      const currentMap = new Map(currentNodes.map((n) => [n.id, n]));
      return storeNodes.map((storeNode) => {
        const current = currentMap.get(storeNode.id);
        if (current) {
          return { ...current, data: storeNode.data, type: storeNode.type };
        }
        return storeNode;
      });
    },
    [storeNodes]
  );

  useEffect(() => {
    setNodes(syncNodesToFlow);
  }, [setNodes, syncNodesToFlow]);

  useEffect(() => {
    setEdges(storeEdges.map(ed => ({ ...ed, type: edgeType })));
  }, [storeEdges, setEdges, edgeType]);

  const handleNodeSelect = useCallback(
    (nodeId: string) => {
      setSelectedNode(nodeId);
    },
    [setSelectedNode]
  );

  const onConnect = useCallback(
    (params: Connection) => {
      if (!params.source || !params.target) {
        return;
      }

      const sourceNode = storeNodes.find((node) => node.id === params.source);
      const targetNode = storeNodes.find((node) => node.id === params.target);

      if (!sourceNode || !targetNode) {
        return;
      }

      if (params.source === params.target) {
        toast.warning('A node cannot connect to itself.');
        return;
      }

      const sourceHandle = params.sourceHandle || 'output';
      const targetHandle = params.targetHandle || 'input';

      const validation = validateConnection(
        sourceNode.data.blockData?.type || 'activity',
        sourceHandle,
        targetNode.data.blockData?.type || 'activity',
        targetHandle
      );

      if (!validation.isValid) {
        toast.warning(validation.message || 'Invalid connection.');
        return;
      }

      const duplicateEdge = storeEdges.some(
        (edge) =>
          edge.source === params.source &&
          edge.target === params.target &&
          (edge.sourceHandle || 'output') === sourceHandle &&
          (edge.targetHandle || 'input') === targetHandle
      );

      if (duplicateEdge) {
        toast.warning('This connection already exists.');
        return;
      }

      const duplicateIncomingEdge = storeEdges.some(
        (edge) =>
          edge.target === params.target &&
          (edge.targetHandle || 'input') === targetHandle &&
          edge.source !== params.source
      );

      if (duplicateIncomingEdge) {
        toast.warning('Only one incoming connection is allowed for the selected target port.');
        return;
      }

      addEdge(createConnection(params.source, params.target, sourceHandle, targetHandle));
    },
    [addEdge, storeEdges, storeNodes]
  );

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
    setIsDragOver(true);
  }, []);

  const onDragLeave = useCallback((event: React.DragEvent) => {
    if (event.currentTarget === event.target) {
      setIsDragOver(false);
    }
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();

      const diagramData = event.dataTransfer.getData('application/rpaforge-diagram');
      if (diagramData) {
        try {
          const diagram = JSON.parse(diagramData);
          if (diagram.type === 'sub-diagram-call') {
            const position = screenToFlowPosition({
              x: event.clientX,
              y: event.clientY,
            });

            const nodeId = generateNodeId();
            const blockData = {
              id: nodeId,
              type: 'sub-diagram-call' as const,
              label: diagram.diagramName,
              name: diagram.diagramName,
              category: 'sub-diagram',
              diagramId: diagram.diagramId,
              diagramName: diagram.diagramName,
              parameters: {},
              returns: {},
            };

            const added = addNode({
              id: nodeId,
              type: 'sub-diagram-call',
              position,
              data: {
                blockData,
                description: '',
                tags: [],
                onSelect: handleNodeSelect,
              },
            });

            if (added) {
              setSelectedNode(nodeId);
            }
            setIsDragOver(false);
            return;
          }
        } catch (err) {
          logger.warn('Failed to parse diagram drag data', err);
        }
      }

      const rawData = event.dataTransfer.getData('application/json');
      if (!rawData) {
        setIsDragOver(false);
        return;
      }

      let dragData: DragData;
      try {
        dragData = JSON.parse(rawData) as DragData;
      } catch (err) {
        logger.warn('Failed to parse block drag data', err);
        setIsDragOver(false);
        return;
      }

      const position = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      const nodeId = crypto.randomUUID();

      if (dragData.type === 'block') {
        const blockData = dragData.data as BlockData;
        const added = addNode({
          id: nodeId,
          type: blockData.type,
          position,
          data: {
            blockData: { ...blockData, id: nodeId },
            description: blockData.description,
            tags: [],
            onSelect: handleNodeSelect,
          },
        });

        if (added) {
          setSelectedNode(nodeId);
        }
        setIsDragOver(false);
        return;
      }

      const activity = dragData.data as Activity;
      const blockData = createActivityBlockData(activity, nodeId);
      const added = addNode({
        id: nodeId,
        type: 'activity',
        position,
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
          onSelect: handleNodeSelect,
        },
      });

      if (added) {
        setSelectedNode(nodeId);
      }
      setIsDragOver(false);
    },
    [addNode, screenToFlowPosition, setSelectedNode, handleNodeSelect]
  );

  const handleNodesChange = useCallback(
    (changes: NodeChange[]) => {
      onNodesChange(changes);

      const debouncedUpdates = changes.filter(
        (c) => c.type === 'position' && c.position && c.dragging === false
      );
      debouncedUpdates.forEach((change) => {
        if (change.type === 'position' && change.position) {
          updateNodePosition(change.id, change.position);
        }
      });

      changes.forEach((change) => {
        if (change.type === 'remove') {
          removeNode(change.id);
        }

        if (change.type === 'select' && change.selected !== undefined) {
          setSelectedNode(change.selected ? change.id : null);
        }
      });
    },
    [onNodesChange, removeNode, setSelectedNode, updateNodePosition]
  );

  const handleEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      const removedIds = changes
        .filter((change) => change.type === 'remove')
        .map((change) => change.id);

      removedIds.forEach((id) => removeEdge(id));
    },
    [removeEdge]
  );

  const throttledNodesChange = useThrottledCallback(handleNodesChange, 16);
  const throttledEdgesChange = useThrottledCallback(handleEdgesChange, 16);

  return (
    <div 
      ref={reactFlowWrapper} 
      className="relative flex-1 h-full"
      role="application"
      aria-label="Process Designer. Use Tab to focus blocks, Enter to select, Arrow keys to navigate, Escape to deselect."
    >
      <CanvasToolbar
        snapToGrid={snapToGrid}
        onToggleSnapToGrid={() => setSnapToGrid(!snapToGrid)}
        edgeType={edgeType}
        onChangeEdgeType={setEdgeType}
        canUndo={undoStack.length > 0}
        canRedo={redoStack.length > 0}
        onUndo={() => {
          const snapshot = undoHistory(storeNodes, storeEdges);
          if (snapshot) {
            setNodes(snapshot.nodes);
            setEdges(snapshot.edges.map(ed => ({ ...ed, type: edgeType })));
          }
        }}
        onRedo={() => {
          const snapshot = redoHistory(storeNodes, storeEdges);
          if (snapshot) {
            setNodes(snapshot.nodes);
            setEdges(snapshot.edges.map(ed => ({ ...ed, type: edgeType })));
          }
        }}
        showMiniMap={showMiniMap}
        onToggleMiniMap={() => setDesignerSettings({ showMinimap: !showMiniMap })}
      />
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={throttledNodesChange}
        onEdgesChange={throttledEdgesChange}
        onEdgeUpdate={(oldEdge, newConnection) => {
          updateEdge(oldEdge.id, {
            source: newConnection.source,
            target: newConnection.target,
            sourceHandle: newConnection.sourceHandle ?? undefined,
            targetHandle: newConnection.targetHandle ?? undefined,
          } as Partial<import('@reactflow/core').Edge>);
        }}
        onConnect={onConnect}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onNodeDoubleClick={onNodeDoubleClick}
        onNodeContextMenu={onNodeContextMenu}
        onPaneContextMenu={onPaneContextMenu}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypesConfig}
        connectionRadius={40}
        connectionLineComponent={ConnectionLine}
        connectionLineStyle={{ stroke: '#6366F1', strokeWidth: 2.5, strokeDasharray: '6,3' }}
        deleteKeyCode={['Backspace', 'Delete']}
        selectionOnDrag
        panOnDrag={[1, 2]}
        selectionMode={SelectionMode.Partial}
        snapToGrid={snapToGrid}
        snapGrid={[20, 20]}
        onlyRenderVisibleElements
        defaultEdgeOptions={{
          type: edgeType,
          markerEnd: { type: MarkerType.ArrowClosed },
        }}
      >
        <svg style={{ position: 'absolute', top: 0, left: 0 }}>
          <defs>
            {Object.entries(CONNECTION_STYLES).map(([type, style]) => (
              <marker
                key={type}
                id={`arrow-${type}`}
                markerWidth="10"
                markerHeight="10"
                viewBox="-10 -5 20 10"
                orient="auto"
                markerUnits="strokeWidth"
              >
                <path
                  d="M-10,-5 L0,0 L-10,5"
                  fill={style.color}
                  stroke={style.color}
                  strokeWidth="1"
                />
              </marker>
            ))}
          </defs>
        </svg>
        <Controls />
        {showMiniMap && (
          <MiniMap nodeColor={miniMapNodeColor} />
        )}
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} />
      </ReactFlow>

      {nodes.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
          <div className="text-center select-none">
            <div className="w-16 h-16 mx-auto mb-4 text-indigo-400 opacity-40">&#9889;</div>
            <h3 className="text-lg font-medium text-slate-400 mb-2">Start Building</h3>
            <p className="text-sm text-slate-500 mb-1">
              Press <kbd className="px-1.5 py-0.5 bg-slate-700 rounded text-xs font-mono">Ctrl+Space</kbd> to quick-add
            </p>
            <p className="text-xs text-slate-600">Or drag activities from the palette &rarr;</p>
          </div>
        </div>
      )}

      {isDragOver && (
        <div
          className="absolute inset-0 pointer-events-none z-10 flex items-center justify-center"
          aria-hidden="true"
        >
          <div className="absolute inset-0 border-2 border-dashed border-indigo-400 bg-indigo-500/10 rounded" />
          <div className="relative flex flex-col items-center gap-2 px-6 py-4 bg-white/90 dark:bg-slate-800/90 rounded-xl shadow-lg border border-indigo-200 dark:border-indigo-700">
            <svg className="w-8 h-8 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            <span className="text-sm font-medium text-indigo-700 dark:text-indigo-300">Drop to add block</span>
          </div>
        </div>
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
              onSelect: handleNodeSelect,
            },
          });

          if (added) {
            setSelectedNode(nodeId);
          }
          setIsDragOver(false);
          return;
        }}
      />

      <style>{`
        @keyframes dash {
          to {
            stroke-dashoffset: -10;
          }
        }
        @keyframes dashdraw {
          to {
            stroke-dashoffset: -9;
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
  );
};

const ProcessCanvas: React.FC = () => {
  return (
    <ReactFlowProvider>
      <ProcessCanvasInner />
    </ReactFlowProvider>
  );
};

export default ProcessCanvas;
