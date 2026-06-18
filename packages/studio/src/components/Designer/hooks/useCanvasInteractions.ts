import { useCallback, useState } from "react";
import { type Connection, type Edge, type EdgeChange, type Node, type NodeChange, useReactFlow } from "@xyflow/react";
import { type BlockData } from "../../../types/blocks";
import type { Activity } from "../../../domain/activity";
import { useBlockStore, type ProcessNodeData } from "../../../stores/blockStore";
import { useDebuggerStore } from "../../../stores/debuggerStore";
import { useDiagramStore } from "../../../stores/diagramStore";

interface ContextMenuState {
  isOpen: boolean;
  position: { x: number; y: number };
  nodeId: string | null;
}

export function useCanvasInteractions() {
  const addNode = useBlockStore((state) => state.addNode);
  const addEdge = useBlockStore((state) => state.addEdge);
  const updateNodePosition = useBlockStore((state) => state.updateNodePosition);
  const { breakpoints, addBreakpoint, removeBreakpoint } = useDebuggerStore();
  const openDiagram = useDiagramStore((state) => state.openDiagram);
  const { screenToFlowPosition } = useReactFlow();

  const [contextMenu, setContextMenu] = useState<ContextMenuState>({
    isOpen: false,
    position: { x: 0, y: 0 },
    nodeId: null,
  });

  const onNodesChange = useCallback((changes: NodeChange[]) => {
    for (const change of changes) {
      if (change.type === 'position' && change.position) {
        updateNodePosition(change.id, change.position);
      }
    }
  }, [updateNodePosition]);

  const onEdgesChange = useCallback((_changes: EdgeChange[]) => {}, []);

  const onConnect = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target) return;
      const edge: Edge = {
        id: `${connection.source}_${connection.sourceHandle ?? 'output'}_${connection.target}_${connection.targetHandle ?? 'input'}`,
        source: connection.source,
        target: connection.target,
        sourceHandle: connection.sourceHandle,
        targetHandle: connection.targetHandle,
        type: 'default',
      };
       addEdge(edge);
    },
    [addEdge],
  );

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      const data = event.dataTransfer.getData("application/json") as string;
      if (!data) return;

      const position = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      try {
        const parsedData = JSON.parse(data);
        const { type, data: dragData } = parsedData as { type: "block" | "activity"; data: unknown };

        if (type === "block") {
          const blockData = dragData as BlockData;
          addNode({
            id: blockData.id,
            type: "block",
            position,
            data: { blockData },
          });
        } else if (type === "activity") {
          const activity = dragData as Activity;
          addNode({
            id: `node-${Date.now()}`,
            type: "activity",
            position,
            data: { activity },
          });
        }
      } catch (error) {
        console.error("Failed to parse drag data:", error);
      }
    },
    [addNode, screenToFlowPosition],
  );

  const onNodeDoubleClick = useCallback(
    (_event: React.MouseEvent, node: Node<ProcessNodeData>) => {
      const subDiagramId =
        node.data?.blockData?.type === "sub-diagram-call"
          ? node.data.blockData.diagramId
          : undefined;

      if (subDiagramId && typeof subDiagramId === "string") {
        openDiagram(subDiagramId);
        return;
      }

      const existingBreakpoint = Array.from(breakpoints.values()).find(
        (bp: { nodeId?: string; file?: string; id?: string }) => bp.nodeId === node.id || bp.file === node.id,
      );

      if (existingBreakpoint) {
        const breakpointId = existingBreakpoint.id;
        if (breakpointId) {
          removeBreakpoint(breakpointId);
        }
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
    [breakpoints, addBreakpoint, openDiagram, removeBreakpoint],
  );

  const onNodeContextMenu = useCallback((_event: React.MouseEvent, _node: Node) => {}, []);

  const onPaneContextMenu = useCallback((event: MouseEvent | React.MouseEvent) => {
    event.preventDefault();
  }, []);

  const closeContextMenu = useCallback((..._args: unknown[]) => {
    setContextMenu({ isOpen: false, position: { x: 0, y: 0 }, nodeId: null });
  }, []);

  return {
    onNodesChange,
    onEdgesChange,
    onConnect,
    onDrop,
    onNodeDoubleClick,
    onNodeContextMenu,
    onPaneContextMenu,
    closeContextMenu,
    contextMenu,
  };
}
