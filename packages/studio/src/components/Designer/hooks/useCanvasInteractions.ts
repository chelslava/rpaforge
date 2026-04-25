import { useCallback } from "react";
import {
  type Connection,
  type EdgeChange,
  type Node,
  type NodeChange,
  applyNodeChanges,
  applyEdgeChanges,
} from "@reactflow/core";
import { type BlockData } from "../../../types/blocks";
import type { Activity } from "../../../types/engine";
import type { Breakpoint } from "../../../types/engine";
import { useBlockStore, type ProcessNodeData } from "../../../stores/blockStore";
import { useHistoryStore } from "../../../stores/historyStore";
import { useDebuggerStore } from "../../../stores/debuggerStore";
import { useDiagramStore } from "../../../stores/diagramStore";
import type { Edge } from "@reactflow/core";

export function useCanvasInteractions() {
  const { addNode, addEdge, setNodes } = useBlockStore();
  const pushHistory = useHistoryStore((state: { pushHistory: () => void }) => state.pushHistory);
  const { breakpoints, addBreakpoint, removeBreakpoint } = useDebuggerStore();
  const openDiagram = useDiagramStore((state: { openDiagram: (id: string) => void }) => state.openDiagram);

  const onNodesChange = useCallback((changes: NodeChange[]) => {
    setNodes((nodes: Node<ProcessNodeData>[]) => applyNodeChanges(changes, nodes));
  }, [setNodes]);

  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
    addEdge((edges: Edge[]) => applyEdgeChanges(changes, edges));
  }, [addEdge]);

  const onConnect = useCallback(
    (connection: Connection) => {
      const isValid = true;
      if (isValid) {
        addEdge(connection);
        pushHistory();
      }
    },
    [addEdge, pushHistory],
  );

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      const data = event.dataTransfer.getData("application/json") as string;
      if (!data) return;

      try {
        const { type, data: dragData } = JSON.parse(data) as {
          type: "block" | "activity";
          data: BlockData | Activity;
        };

        const nodePosition = { x: 0, y: 0 };

        if (type === "block") {
          const newBlock = {
            id: dragData.id,
            type: "block",
            position: nodePosition,
            data: { blockData: dragData },
          };
          addNode(newBlock);
          pushHistory();
        } else if (type === "activity") {
          const newNode = {
            id: `node-${Date.now()}`,
            type: "activity",
            position: nodePosition,
            data: { activity: dragData },
          };
          addNode(newNode);
          pushHistory();
        }
      } catch (error) {
        console.error("Failed to parse drag data:", error);
      }
    },
    [addNode, pushHistory],
  );

  const onNodeDoubleClick = useCallback(
    (_event: React.MouseEvent, node: Node<ProcessNodeData>) => {
      const subDiagramId =
        node.data.blockData?.type === "sub-diagram-call"
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

  const onNodeContextMenu = useCallback(
    (_event: React.MouseEvent, _node: Node<ProcessNodeData>) => {
    },
    [],
  );

  const onPaneContextMenu = useCallback((event: React.MouseEvent) => {
    event.preventDefault();
  }, []);

  const closeContextMenu = useCallback(() => {
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
  };
}
