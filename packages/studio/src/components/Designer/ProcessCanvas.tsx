import React, { useCallback, useEffect, useRef } from 'react';
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
import type { Activity } from '../../types/engine';
import {
  useProcessStore,
  type ProcessNodeData,
} from '../../stores/processStore';
import { useDebuggerStore } from '../../stores/debuggerStore';
import { useDiagramStore } from '../../stores/diagramStore';
import {
  CONNECTION_STYLES,
  createConnection,
  validateConnection,
} from '../../types/connections';
import { edgeTypes } from './Edges';
import { blockNodeTypes } from './Blocks';
import { generateNodeId } from '../../utils/guid';
import { createLogger } from '../../utils/logger';
import '@reactflow/controls/dist/style.css';
import '@reactflow/core/dist/style.css';
import '@reactflow/minimap/dist/style.css';

interface DragData {
  type: 'block' | 'activity';
  data: BlockData | Activity;
}

const logger = createLogger('ProcessCanvas');

const ProcessCanvasInner: React.FC = () => {
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const hasInitialFit = useRef(false);
  const { fitView, screenToFlowPosition } = useReactFlow();

  const {
    nodes: storeNodes,
    edges: storeEdges,
    addNode,
    addEdge,
    removeNode,
    removeEdge,
    updateNodePosition,
    setSelectedNode,
    currentExecutingNodeId,
  } = useProcessStore();

  const {
    breakpoints,
    addBreakpoint,
    removeBreakpoint,
  } = useDebuggerStore();
  const openDiagram = useDiagramStore((state) => state.openDiagram);

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
        (bp) => bp.file === node.id
      );

      if (existingBreakpoint) {
        removeBreakpoint(existingBreakpoint.id);
      } else {
        addBreakpoint({
          id: `bp-${node.id}-${Date.now()}`,
          file: node.id,
          line: 0,
          enabled: true,
        });
      }
    },
    [breakpoints, addBreakpoint, openDiagram, removeBreakpoint]
  );

  useEffect(() => {
    setNodes(storeNodes);
  }, [setNodes, storeNodes]);

  useEffect(() => {
    setEdges(storeEdges);
  }, [setEdges, storeEdges]);

  useEffect(() => {
    if (!hasInitialFit.current && storeNodes.length > 0 && reactFlowWrapper.current) {
      const timer = setTimeout(() => {
        fitView({ padding: 0.2, duration: 200 });
        hasInitialFit.current = true;
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [storeNodes.length, fitView]);

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
              },
            });

            if (added) {
              setSelectedNode(nodeId);
            }
            return;
          }
        } catch (err) {
          logger.warn('Failed to parse diagram drag data', err);
        }
      }

      const rawData = event.dataTransfer.getData('application/json');
      if (!rawData) {
        return;
      }

      let dragData: DragData;
      try {
        dragData = JSON.parse(rawData) as DragData;
      } catch (err) {
        logger.warn('Failed to parse block drag data', err);
        return;
      }

      const position = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      const nodeId = `node_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;

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
          },
        });

        if (added) {
          setSelectedNode(nodeId);
        }
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
        },
      });

      if (added) {
        setSelectedNode(nodeId);
      }
    },
    [addNode, screenToFlowPosition, setSelectedNode]
  );

  const handleNodesChange = useCallback(
    (changes: NodeChange[]) => {
      onNodesChange(changes);

      changes.forEach((change) => {
        if (change.type === 'position' && change.position && change.dragging === false) {
          updateNodePosition(change.id, change.position);
        }

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

  return (
    <div ref={reactFlowWrapper} className="relative flex-1 h-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={handleNodesChange}
        onEdgesChange={handleEdgesChange}
        onConnect={onConnect}
        onDragOver={onDragOver}
        onDrop={onDrop}
        onNodeDoubleClick={onNodeDoubleClick}
        nodeTypes={blockNodeTypes}
        edgeTypes={edgeTypes}
        deleteKeyCode={['Backspace', 'Delete']}
        selectionOnDrag
        panOnDrag={[1, 2]}
        selectionMode={SelectionMode.Partial}
        defaultEdgeOptions={{
          type: 'custom',
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
        <MiniMap
          nodeColor={(node: Node<ProcessNodeData>) =>
            node.id === currentExecutingNodeId ? '#6366f1' : '#94a3b8'
          }
        />
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} />
      </ReactFlow>

      <style>{`
        @keyframes dash {
          to {
            stroke-dashoffset: -10;
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
