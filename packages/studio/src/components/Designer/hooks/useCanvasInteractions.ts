import { useCallback, useState } from "react";
import { type Edge, type Node } from "@reactflow/core";
import { type BlockData } from "../../../types/blocks";
import type { Activity } from "../../../types/engine";
import { useBlockStore } from "../../../stores/blockStore";
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
  const { breakpoints, addBreakpoint, removeBreakpoint } = useDebuggerStore();
  const openDiagram = useDiagramStore((state) => state.openDiagram);

  const [contextMenu, setContextMenu] = useState<ContextMenuState>({
    isOpen: false,
    position: { x: 0, y: 0 },
    nodeId: null,
  });

  const onNodesChange = useCallback((_changes: any[]) => {}, []);

  const onEdgesChange = useCallback((_changes: any[]) => {}, []);

  const onConnect = useCallback(
    (connection: any) => {
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

      try {
        const parsedData = JSON.parse(data);
        const { type, data: dragData } = parsedData as { type: "block" | "activity"; data: unknown };

        const nodePosition = { x: 0, y: 0 };

        if (type === "block") {
          const blockData = dragData as BlockData;
          const newBlock = {
            id: blockData.id,
            type: "block",
            position: nodePosition,
            data: { blockData },
          };
          addNode(newBlock);
        } else if (type === "activity") {
          const activity = dragData as Activity;
          const newNode = {
            id: `node-${Date.now()}`,
            type: "activity",
            position: nodePosition,
            data: { activity },
          };
          addNode(newNode);
        }
      } catch (error) {
        console.error("Failed to parse drag data:", error);
      }
    },
    [addNode],
  );

  const onNodeDoubleClick = useCallback(
    (_event: React.MouseEvent, node: Node) => {
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

  const onPaneContextMenu = useCallback((event: React.MouseEvent) => {
    event.preventDefault();
  }, []);

  const closeContextMenu = useCallback((..._args: any[]) => {
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
