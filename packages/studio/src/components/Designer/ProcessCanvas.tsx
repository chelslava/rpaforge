import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { FiZap } from 'react-icons/fi';
import {
  Background,
  BackgroundVariant,
  type Connection,
  Controls,
  type Edge,
  type EdgeChange,
  MarkerType,
  MiniMap,
  type Node,
  type NodeChange,
  type OnNodeDrag,
  ReactFlow,
  ReactFlowProvider,
  SelectionMode,
  useEdgesState,
  useNodesState,
  useReactFlow,
  useViewport,
} from '@xyflow/react';
import { createActivityBlockData, type BlockData } from '../../types/blocks';
import { computeAutoLayout } from '../../canvas/loadAutoLayout';
import { edgeTypes } from './Edges';
import { ConnectionLine } from './Edges/ConnectionLine';
import { blockNodeTypes } from './Blocks';
import { generateNodeId } from '../../utils/guid';
import { createLogger } from '../../utils/logger';
import type { Activity } from '../../domain/activity';
import { validateConnection, createConnection, CONNECTION_STYLES } from '../../types/connections';
import { useShallow } from 'zustand/shallow';
import { useBlockStore, type ProcessNodeData } from '../../stores/blockStore';
import { useHistoryStore } from '../../stores/historyStore';
import { useSelectionStore } from '../../stores/selectionStore';
import { useExecutionStore } from '../../stores/executionStore';
import { useDebuggerStore } from '../../stores/debuggerStore';
import { useDiagramStore } from '../../stores/diagramStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts';
import { useThrottledCallback } from '../../hooks/useThrottledCallback';
import { useAiSuggestions } from '../../hooks/useAiSuggestions';
import { useNodeSearch } from '../../hooks/useNodeSearch';
import CanvasToolbar, { type EdgeTypeOption } from './CanvasToolbar';
import CanvasContextMenu from './CanvasContextMenu';
import QuickAddActivity from './QuickAddActivity';
import AiSuggestionOverlay from './AiSuggestionOverlay';
import EmptyState from '../Common/EmptyState';
import '@xyflow/react/dist/style.css';

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
  const { t } = useTranslation('common');
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  // Holds the pre-drag store positions so a single undo step restores the
  // original layout after a node drag (see #683). The store only receives a
  // node's final position at drag-stop, so these are the authoritative values.
  const dragStartPositions = useRef<Map<string, { x: number; y: number }> | null>(null);
  const { screenToFlowPosition, fitView, setCenter } = useReactFlow();
  const { zoom } = useViewport();
  const [snapToGrid, setSnapToGrid] = useState(true);
  const [edgeType, setEdgeType] = useState<EdgeTypeOption>('auto-route');

  const snapGrid = useMemo<[number, number]>(() => [20, 20], []);
  const defaultEdgeOptions = useMemo(
    () => ({ type: edgeType, markerEnd: { type: MarkerType.ArrowClosed } as const }),
    [edgeType],
  );
  const [isDragOver, setIsDragOver] = useState(false);
  const [isLayouting, setIsLayouting] = useState(false);
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

  const handleZoomToFit = useCallback(() => {
    fitView({ padding: 0.2, duration: 300 });
  }, [fitView]);

  const handleCenterView = useCallback(() => {
    const startNode =
      storeNodes.find(
        (n) =>
          n.type === 'start' ||
          n.id === 'start' ||
          (n.data as { blockType?: string } | undefined)?.blockType === 'start'
      ) || storeNodes[0];
    if (startNode) {
      setCenter(
        startNode.position.x + (startNode.measured?.width ?? 180) / 2,
        startNode.position.y + (startNode.measured?.height ?? 80) / 2,
        { zoom: 1, duration: 300 }
      );
    } else {
      fitView({ padding: 0.2, duration: 300 });
    }
  }, [storeNodes, setCenter, fitView]);

  const selectedNodeId = useSelectionStore((state) => state.selectedNodeId);
  const setSelectedNode = useSelectionStore((state) => state.setSelectedNode);

    const { suggestions, isThinking, clearSuggestions } = useAiSuggestions({
      selectedNodeId,
      nodes: storeNodes,
    });

  const pushHistory = useHistoryStore((state) => state.pushHistory);
  const undoHistory = useHistoryStore((state) => state.undo);
  const redoHistory = useHistoryStore((state) => state.redo);
  const undoStack = useHistoryStore((state) => state.undoStack);
  const redoStack = useHistoryStore((state) => state.redoStack);

  const showMiniMap = useSettingsStore((state) => state.designer.showMinimap);
  const setDesignerSettings = useSettingsStore((state) => state.setDesignerSettings);

  const currentExecutingNodeId = useExecutionStore((state) => state.currentExecutingNodeId);

  const miniMapNodeColor = useCallback(
    (node: Node<ProcessNodeData>) =>
      node.id === currentExecutingNodeId ? 'var(--color-ui-primary)' : 'var(--color-ui-text-subtle)',
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

  const { breakpoints, addBreakpoint, removeBreakpoint } = useDebuggerStore(
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
          toast.success(t('processCanvas.nodeCopied'));
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
          toast.success(t('canvas.nodeCut'));
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
            toast.success(t('canvas.nodeDuplicated'));
          }
        }
      },
      undo: () => {
        const snapshot = undoHistory(storeNodes, storeEdges);
        if (snapshot) {
          applySnapshot(snapshot.nodes, snapshot.edges);
        }
      },
      redo: () => {
        const snapshot = redoHistory(storeNodes, storeEdges);
        if (snapshot) {
          applySnapshot(snapshot.nodes, snapshot.edges);
        }
      },
      zoomToFit: handleZoomToFit,
      centerView: handleCenterView,
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
  const {
    query: nodeSearch,
    setQuery: setNodeSearch,
    matchingNodeIds,
    matchCount: nodeSearchMatchCount,
    totalCount: nodeSearchTotalCount,
    isSearching: isNodeSearching,
  } = useNodeSearch(storeNodes);

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

  const onPaneContextMenu = useCallback((event: MouseEvent | React.MouseEvent) => {
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

  useEffect(() => {
    setNodes((currentNodes: Node<ProcessNodeData>[]) => {
      const currentMap = new Map(currentNodes.map((n) => [n.id, n]));
      let changed = false;
      const next = storeNodes.map((storeNode) => {
        const current = currentMap.get(storeNode.id);
        if (current) {
          if (current.data === storeNode.data && current.type === storeNode.type) {
            return current;
          }
          changed = true;
          return { ...current, data: storeNode.data, type: storeNode.type };
        }
        changed = true;
        return storeNode;
      });
      return changed ? next : currentNodes;
    });
  }, [storeNodes, setNodes]);

  useEffect(() => {
    setEdges(storeEdges.map(ed => ({ ...ed, type: edgeType })));
  }, [storeEdges, setEdges, edgeType]);

  const handleNodeSelect = useCallback(
    (nodeId: string) => {
      setSelectedNode(nodeId);
    },
    [setSelectedNode]
  );
  const interactionEnabled = zoom >= 0.5;

  const displayNodes = useMemo(() => {
    if (!isNodeSearching) {
      return nodes;
    }

    return nodes.map((node) => {
      const baseStyle = { ...node.style };
      delete baseStyle.opacity;
      delete baseStyle.filter;
      delete baseStyle.boxShadow;
      const isMatch = matchingNodeIds.has(node.id);
      return {
        ...node,
        style: {
          ...baseStyle,
          opacity: isMatch ? 1 : 0.3,
          filter: isMatch ? 'drop-shadow(0 0 7px var(--color-ui-primary))' : 'grayscale(0.35)',
          boxShadow: isMatch ? '0 0 0 2px var(--color-ui-primary)' : undefined,
        },
      };
    });
  }, [isNodeSearching, matchingNodeIds, nodes]);

  const navigateToFirstMatch = useCallback(() => {
    const nodeId = nodes.find((node) => matchingNodeIds.has(node.id))?.id;
    if (!nodeId) {
      return;
    }

    const target = nodes.find((node) => node.id === nodeId);
    setSelectedNode(nodeId);
    if (target) {
      void fitView({ nodes: [target], duration: 300, padding: 0.35 });
    }
  }, [fitView, matchingNodeIds, nodes, setSelectedNode]);

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
        toast.warning(t('canvas.selfConnection'));
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
        toast.warning(t(validation.messageKey || 'canvas.invalidConnection'));
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
        toast.warning(t('canvas.connectionExists'));
        return;
      }

      const duplicateIncomingEdge = storeEdges.some(
        (edge) =>
          edge.target === params.target &&
          (edge.targetHandle || 'input') === targetHandle &&
          edge.source !== params.source
      );

      if (duplicateIncomingEdge) {
        toast.warning(t('canvas.onlyOneIncoming'));
        return;
      }

      addEdge(createConnection(params.source, params.target, sourceHandle, targetHandle));
    },
    [addEdge, storeEdges, storeNodes, t]
  );

  const handleAutoLayout = useCallback(async () => {
    if (nodes.length === 0) return;

    setIsLayouting(true);
    try {
      const positions = await computeAutoLayout(nodes, edges);
      pushHistory(storeNodes, storeEdges);

      setNodes((nds) =>
        nds.map((node) => {
          const positioned = positions.find((p) => p.id === node.id);
          return positioned ? { ...node, position: positioned.position } : node;
        })
      );

      positions.forEach(({ id, position }) => updateNodePosition(id, position));
      toast.success(t('canvasToolbar.layoutApplied'));
    } catch (err) {
      logger.error('Auto layout failed', err);
      toast.error(t('canvasToolbar.layoutFailed'));
    } finally {
      setIsLayouting(false);
    }
  }, [nodes, edges, storeNodes, storeEdges, pushHistory, setNodes, updateNodePosition, t]);

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

  const autoConnectOnEdge = useCallback(
    (pos: { x: number; y: number }, newNodeId: string) => {
      for (const edge of storeEdges) {
        const sourceNode = storeNodes.find((n) => n.id === edge.source);
        const targetNode = storeNodes.find((n) => n.id === edge.target);
        if (!sourceNode || !targetNode) continue;

        const x1 = sourceNode.position.x;
        const y1 = sourceNode.position.y;
        const x2 = targetNode.position.x;
        const y2 = targetNode.position.y;

        const minX = Math.min(x1, x2) - 60;
        const maxX = Math.max(x1, x2) + 60;
        const minY = Math.min(y1, y2) - 60;
        const maxY = Math.max(y1, y2) + 60;

        if (pos.x >= minX && pos.x <= maxX && pos.y >= minY && pos.y <= maxY) {
          removeEdge(edge.id);
          addEdge({
            id: generateNodeId(),
            source: edge.source,
            target: newNodeId,
            sourceHandle: edge.sourceHandle,
            targetHandle: undefined,
            type: edgeType,
          });
          addEdge({
            id: generateNodeId(),
            source: newNodeId,
            target: edge.target,
            sourceHandle: undefined,
            targetHandle: edge.targetHandle,
            type: edgeType,
          });
          break;
        }
      }
    },
    [storeEdges, storeNodes, removeEdge, addEdge, edgeType]
  );

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
              autoConnectOnEdge(position, nodeId);
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
          autoConnectOnEdge(position, nodeId);
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
        autoConnectOnEdge(position, nodeId);
      }
      setIsDragOver(false);
    },
    [addNode, screenToFlowPosition, setSelectedNode, handleNodeSelect, autoConnectOnEdge]
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

  // Capture the pre-drag positions once a drag begins. This runs before React
  // Flow emits the in-flight position changes, and the store does not receive
  // intermediate positions while dragging — so storeNodes still holds the
  // original layout we need for the undo snapshot.
  const handleNodeDragStart = useCallback(() => {
    dragStartPositions.current = new Map(
      storeNodes.map((node) => [node.id, { ...node.position }])
    );
  }, [storeNodes]);

  // When a drag ends, commit happens via handleNodesChange (dragging === false).
  // Here we push a single undo step anchored on the pre-drag snapshot, so an
  // accidental move can be undone without spamming history during movement.
  const handleNodeDragStop = useCallback<OnNodeDrag<Node<ProcessNodeData>>>(
    (_event, node) => {
      const startMap = dragStartPositions.current;
      dragStartPositions.current = null;
      if (!startMap) return;

      const startPosition = startMap.get(node.id);
      const endPosition = node.position;
      if (!startPosition) return;

      const moved =
        startPosition.x !== endPosition.x || startPosition.y !== endPosition.y;
      if (!moved) return;

      // Rebuild the pre-drag layout: use the captured positions for any node
      // that was in the drag set, and the current layout for everything else.
      const previousNodes = storeNodes.map((n) => {
        const captured = startMap.get(n.id);
        if (!captured) return n;
        return { ...n, position: { x: captured.x, y: captured.y } };
      });
      const previousEdges = storeEdges.map((e) => ({ ...e }));
      pushHistory(previousNodes, previousEdges);
    },
    [storeNodes, storeEdges, pushHistory]
  );

  // Apply a history snapshot to both the React Flow render state AND the
  // durable block store, so undo/redo of positions is persisted (see #683).
  const applySnapshot = useCallback(
    (nextNodes: Node<ProcessNodeData>[], nextEdges: Edge[]) => {
      setNodes(nextNodes);
      setEdges(nextEdges.map((ed) => ({ ...ed, type: edgeType })));
      nextNodes.forEach((n) => {
        if (n.position) updateNodePosition(n.id, n.position);
      });
    },
    [setNodes, setEdges, updateNodePosition, edgeType]
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

  const onPaneDoubleClick = useCallback(
    (event: React.MouseEvent) => {
      const position = screenToFlowPosition({ x: event.clientX, y: event.clientY });
      setQuickAdd({ isOpen: true, position });
    },
    [screenToFlowPosition]
  );

  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      const activeTag = document.activeElement?.tagName.toLowerCase();
      if (
        activeTag === 'input' ||
        activeTag === 'textarea' ||
        document.activeElement?.classList.contains('monaco-editor')
      ) {
        return;
      }
      if (e.code === 'Space' && !e.ctrlKey && !e.altKey && !e.metaKey) {
        e.preventDefault();
        const centerPos = screenToFlowPosition({
          x: window.innerWidth / 2,
          y: window.innerHeight / 2,
        });
        setQuickAdd({ isOpen: true, position: centerPos });
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [screenToFlowPosition]);

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
            applySnapshot(snapshot.nodes, snapshot.edges);
          }
        }}
        onRedo={() => {
          const snapshot = redoHistory(storeNodes, storeEdges);
          if (snapshot) {
            applySnapshot(snapshot.nodes, snapshot.edges);
          }
        }}
        showMiniMap={showMiniMap}
        onToggleMiniMap={() => setDesignerSettings({ showMinimap: !showMiniMap })}
        onAutoLayout={handleAutoLayout}
        isLayouting={isLayouting}
        onZoomToFit={handleZoomToFit}
        onCenterView={handleCenterView}
        nodeSearch={nodeSearch}
        onNodeSearchChange={setNodeSearch}
        nodeSearchMatchCount={nodeSearchMatchCount}
        nodeSearchTotalCount={nodeSearchTotalCount}
        onNavigateToFirstMatch={navigateToFirstMatch}
      />
      <ReactFlow
        nodes={displayNodes}
        edges={edges}
        onNodesChange={throttledNodesChange}
        onEdgesChange={throttledEdgesChange}
        onReconnect={(oldEdge, newConnection) => {
          updateEdge(oldEdge.id, {
            source: newConnection.source,
            target: newConnection.target,
            sourceHandle: newConnection.sourceHandle ?? undefined,
            targetHandle: newConnection.targetHandle ?? undefined,
          } as Partial<import('@xyflow/react').Edge>);
        }}
        onConnect={onConnect}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onNodeDoubleClick={onNodeDoubleClick}
        onNodeContextMenu={onNodeContextMenu}
        onNodeDragStart={handleNodeDragStart}
        onNodeDragStop={handleNodeDragStop}
        onPaneContextMenu={onPaneContextMenu}
        onDoubleClick={onPaneDoubleClick}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypesConfig}
        connectionRadius={40}
        connectionLineComponent={ConnectionLine}
        connectionLineStyle={{ stroke: 'var(--color-ui-primary)', strokeWidth: 2.5, strokeDasharray: '6,3' }}
        deleteKeyCode={['Backspace', 'Delete']}
        selectionOnDrag
        panOnDrag={[1, 2]}
        selectionMode={SelectionMode.Partial}
        snapToGrid={snapToGrid}
        snapGrid={snapGrid}
        onlyRenderVisibleElements
        nodesDraggable={interactionEnabled}
        nodesConnectable={interactionEnabled}
        defaultEdgeOptions={defaultEdgeOptions}
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
          <EmptyState
            icon={<FiZap className="w-8 h-8 text-ui-primary" />}
            title={t('canvas.startBuilding')}
            description={`${t('canvas.pressCtrlSpace')} • ${t('canvas.dragActivities')}`}
          />
        </div>
      )}

      {isDragOver && (
        <div
          className="absolute inset-0 pointer-events-none z-10 flex items-center justify-center"
          aria-hidden="true"
        >
          <div className="absolute inset-0 border-2 border-dashed border-ui-primary bg-ui-primary/10 rounded" />
          <div className="relative flex flex-col items-center gap-2 px-6 py-4 bg-ui-surface/90 rounded-xl shadow-lg border border-ui-primary">
            <svg className="w-8 h-8 text-ui-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            <span className="text-sm font-medium text-ui-primary">Drop to add block</span>
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

      {/* AI Suggestion Overlay */}
      <AiSuggestionOverlay
        selectedNodeId={selectedNodeId}
        suggestions={suggestions}
        isThinking={isThinking}
        onClearSuggestions={clearSuggestions}
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
