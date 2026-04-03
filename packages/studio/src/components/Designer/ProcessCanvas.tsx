import React, { useCallback, useRef, useEffect } from 'react';
import {
  ReactFlow,
  Node,
  Connection,
  useNodesState,
  useEdgesState,
  OnNodesChange,
  OnEdgesChange,
  SelectionMode,
  addEdge,
  MarkerType,
} from '@reactflow/core';
import { Controls } from '@reactflow/controls';
import { MiniMap } from '@reactflow/minimap';
import { Background, BackgroundVariant } from '@reactflow/background';
import { useProcessStore, ProcessNodeData } from '../../stores/processStore';
import type { Activity } from '../../types/engine';
import type { BlockData } from '../../types/blocks';
import { createConnection, validateConnection, CONNECTION_STYLES } from '../../types/connections';
import { blockNodeTypes } from './Blocks';
import { edgeTypes } from './Edges';
import '@reactflow/core/dist/style.css';
import '@reactflow/controls/dist/style.css';
import '@reactflow/minimap/dist/style.css';

interface DragData {
  type: 'block' | 'activity';
  data: BlockData | Activity;
}

const ProcessCanvas: React.FC = () => {
  const reactFlowWrapper = useRef<HTMLDivElement>(null);

  const {
    nodes: storeNodes,
    edges: storeEdges,
    addNode,
    removeNode,
    updateNodePosition,
    connectNodes,
    setSelectedNode,
    currentExecutingNodeId,
  } = useProcessStore();

  const [nodes, setNodes, onNodesChange] = useNodesState(storeNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(storeEdges);

  useEffect(() => {
    setNodes(storeNodes);
  }, [storeNodes, setNodes]);

  useEffect(() => {
    setEdges(storeEdges);
  }, [storeEdges, setEdges]);

  const onConnect = useCallback(
    (params: Connection) => {
      if (!params.source || !params.target) return;

      const sourceNode = nodes.find((n) => n.id === params.source);
      const targetNode = nodes.find((n) => n.id === params.target);

      if (!sourceNode || !targetNode) return;

      const sourceType = sourceNode.data.blockData?.type || 'activity';
      const targetType = targetNode.data.blockData?.type || 'activity';

      const validation = validateConnection(
        sourceType,
        params.sourceHandle || null,
        targetType,
        params.targetHandle || null
      );

      if (!validation.isValid) {
        console.warn('Invalid connection:', validation.message);
        return;
      }

      const newEdge = createConnection(
        params.source,
        params.target,
        params.sourceHandle || null,
        params.targetHandle || null
      );

      setEdges((eds) => addEdge(newEdge, eds));
      connectNodes(params.source, params.target);
    },
    [nodes, setEdges, connectNodes]
  );

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();

      const rawData = event.dataTransfer.getData('application/json');
      if (!rawData) return;

      let dragData: DragData;
      try {
        dragData = JSON.parse(rawData) as DragData;
      } catch {
        return;
      }

      if (!reactFlowWrapper.current) return;

      const bounds = reactFlowWrapper.current.getBoundingClientRect();
      const position = {
        x: event.clientX - bounds.left,
        y: event.clientY - bounds.top,
      };

      const nodeId = `node_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      if (dragData.type === 'block') {
        const blockData = dragData.data as BlockData;
        const newNode: Node<ProcessNodeData> = {
          id: nodeId,
          type: blockData.type,
          position,
          data: {
            blockData: { ...blockData, id: nodeId },
            arguments: [],
            timeout: 30,
            continueOnError: false,
            tags: [],
          },
        };
        addNode(newNode);
      } else {
        const activity = dragData.data as Activity;
        const newNode: Node<ProcessNodeData> = {
          id: nodeId,
          type: 'activity',
          position,
          data: {
            activity,
            arguments: (activity.arguments || []).map((arg) => ({
              name: arg.name,
              type: 'string' as const,
              value: String(arg.default ?? ''),
            })),
            timeout: 30,
            continueOnError: false,
            tags: [],
          },
        };
        addNode(newNode);
      }

      setSelectedNode(nodeId);
    },
    [addNode, setSelectedNode]
  );

  const handleNodesChange: OnNodesChange = useCallback(
    (changes) => {
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
    [onNodesChange, updateNodePosition, removeNode, setSelectedNode]
  );

  const handleEdgesChange: OnEdgesChange = useCallback(
    (changes) => {
      onEdgesChange(changes);
    },
    [onEdgesChange]
  );

  return (
    <div ref={reactFlowWrapper} className="flex-1 h-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={handleNodesChange}
        onEdgesChange={handleEdgesChange}
        onConnect={onConnect}
        onDragOver={onDragOver}
        onDrop={onDrop}
        nodeTypes={blockNodeTypes}
        edgeTypes={edgeTypes}
        fitView
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
          nodeColor={(node) => {
            if (node.id === currentExecutingNodeId) {
              return '#6366f1';
            }
            return '#94a3b8';
          }}
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

export default ProcessCanvas;
