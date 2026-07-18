import { act, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import React from 'react';

// ── hoisted helpers ──────────────────────────────────────────────────────────

const { mockReactFlowProps, mockScreenToFlowPosition } = vi.hoisted(() => {
  const store: Record<string, unknown> = {};
  return {
    mockReactFlowProps: store as Record<string, unknown>,
    mockScreenToFlowPosition: vi.fn(({ x, y }: { x: number; y: number }) => ({
      x: x - 100,
      y: y - 100,
    })),
  };
});

// ── Mock ReactFlow and sub-packages ──────────────────────────────────────────

vi.mock('@xyflow/react', () => ({
  ReactFlow: ({ children, ...props }: Record<string, unknown>) => {
    Object.assign(mockReactFlowProps, props);
    return <div data-testid="react-flow">{children as React.ReactNode}</div>;
  },
  ReactFlowProvider: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  useNodesState: (initial: unknown[]) => [initial, vi.fn(), vi.fn()],
  useEdgesState: (initial: unknown[]) => [initial, vi.fn(), vi.fn()],
  useReactFlow: () => ({
    screenToFlowPosition: mockScreenToFlowPosition,
    getNodes: vi.fn(() => []),
    setNodes: vi.fn(),
    getNode: vi.fn(),
  }),
  useViewport: () => ({ zoom: 1 }),
  MarkerType: { ArrowClosed: 'arrowclosed' },
  SelectionMode: { Partial: 'partial' },
  Background: () => <div data-testid="rf-background" />,
  BackgroundVariant: { Dots: 'dots' },
  Controls: () => <div data-testid="rf-controls" />,
  MiniMap: () => <div data-testid="rf-minimap" />,
}));

// ── Mock sub-components ──────────────────────────────────────────────────────

vi.mock('./CanvasToolbar', () => ({
  default: () => <div data-testid="canvas-toolbar" />,
}));

vi.mock('./CanvasContextMenu', () => ({
  default: ({ isOpen }: { isOpen: boolean }) =>
    isOpen ? <div data-testid="canvas-context-menu" /> : null,
}));

vi.mock('./QuickAddActivity', () => ({
  default: ({ isOpen }: { isOpen: boolean }) =>
    isOpen ? <div data-testid="quick-add-activity" /> : null,
}));

vi.mock('../Common/EmptyState', () => ({
  default: ({ title }: { title: string }) => (
    <div data-testid="empty-state">{title}</div>
  ),
}));

// ── Mock hooks & toast ───────────────────────────────────────────────────────

vi.mock('sonner', () => ({
  toast: { warning: vi.fn(), error: vi.fn(), success: vi.fn() },
}));

vi.mock('../../hooks/useKeyboardShortcuts', () => ({
  useKeyboardShortcuts: vi.fn(),
}));

vi.mock('../../hooks/useThrottledCallback', () => ({
  useThrottledCallback: (fn: unknown) => fn,
}));

// ── Imports (after all mocks) ────────────────────────────────────────────────

import ProcessCanvas from './ProcessCanvas';
import { useBlockStore, type ProcessNodeData } from '../../stores/blockStore';
import { useSelectionStore } from '../../stores/selectionStore';
import { useHistoryStore } from '../../stores/historyStore';
import { useExecutionStore } from '../../stores/executionStore';
import { useDebuggerStore } from '../../stores/debuggerStore';
import { useDiagramStore } from '../../stores/diagramStore';
import { useSettingsStore } from '../../stores/settingsStore';
import type { BlockData } from '../../types/blocks';
import { createDefaultBlockData } from '../../types/blocks';
import type { Edge } from '@xyflow/react';

// ── Helpers ──────────────────────────────────────────────────────────────────

function createMinimalStartNode(overrides: Partial<ProcessNodeData> = {}) {
  const blockData = createDefaultBlockData('start', 'start-1');
  return {
    id: 'start-1',
    type: 'start' as const,
    position: { x: 0, y: 0 },
    data: {
      blockData,
      description: '',
      tags: [],
      ...overrides,
    },
  };
}

function createMinimalActivityNode(id = 'act-1', overrides: Partial<ProcessNodeData> = {}) {
  const blockData = createDefaultBlockData('activity', id) as Extract<
    BlockData,
    { type: 'activity' }
  >;
  return {
    id,
    type: 'activity' as const,
    position: { x: 200, y: 200 },
    data: {
      blockData,
      description: '',
      tags: [],
      ...overrides,
    },
  };
}

function resetAllStores() {
  // Clear persisted storage
  useDiagramStore.persist.clearStorage();
  useSettingsStore.persist.clearStorage();
  useDebuggerStore.persist.clearStorage();

  // Reset all stores to clean defaults
  useBlockStore.setState({ nodes: [], edges: [] });
  useSelectionStore.setState({
    selectedNodeId: null,
    selectedEdgeId: null,
    multiSelectIds: [],
  });
  useHistoryStore.setState({
    undoStack: [],
    redoStack: [],
  });
  useExecutionStore.setState({
    executionState: 'idle',
    executionProgress: 0,
    currentExecutingNodeId: null,
    executionSpeed: 1,
  });
  useDiagramStore.setState({
    project: null,
    activeDiagramId: null,
    openDiagramIds: [],
    recentDiagrams: [],
    folders: [],
    diagramDocuments: {},
  });
  // Restore default designer settings
  useSettingsStore.setState({
    designer: {
      snapToGrid: true,
      gridSize: 20,
      showMinimap: false,
      autoLayout: false,
    },
    theme: 'system',
    language: 'en',
    executionMode: 'standalone',
    orchestrator: { url: '', autoSync: false },
    editor: { fontSize: 14, tabSize: 2, wordWrap: true, minimap: false, lineNumbers: true, formatOnSave: false },
    execution: { defaultTimeout: 30000, stopOnError: true, captureScreenshots: true, logLevel: 'info' },
    recentFiles: [],
    maxRecentFiles: 10,
    tourCompleted: false,
    setTourCompleted: vi.fn(),
    setTheme: vi.fn(),
    toggleTheme: vi.fn(),
    setLanguage: vi.fn(),
    setExecutionMode: vi.fn(),
    setOrchestratorConfig: vi.fn(),
    setEditorSettings: vi.fn(),
    setDesignerSettings: vi.fn(),
    setExecutionSettings: vi.fn(),
    addRecentFile: vi.fn(),
    removeRecentFile: vi.fn(),
    clearRecentFiles: vi.fn(),
  });
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('ProcessCanvas', () => {
  beforeEach(() => {
    // Clear captured ReactFlow props
    for (const key of Object.keys(mockReactFlowProps)) {
      delete mockReactFlowProps[key];
    }
    resetAllStores();
  });

  // ── 1. Empty state ───────────────────────────────────────────────────────

  test('renders empty state when no nodes exist', () => {
    render(<ProcessCanvas />);

    expect(screen.getByTestId('react-flow')).toBeTruthy();
    expect(screen.getByTestId('empty-state')).toBeTruthy();
  });

  // ── 2. Canvas with nodes ─────────────────────────────────────────────────

  test('renders ReactFlow canvas with nodes when provided', () => {
    useBlockStore.setState({
      nodes: [createMinimalStartNode()],
    });

    render(<ProcessCanvas />);

    expect(screen.getByTestId('react-flow')).toBeTruthy();
    // ReactFlow should receive the nodes
    expect((mockReactFlowProps.nodes as unknown[]).length).toBe(1);
    expect(mockReactFlowProps.nodesDraggable).toBe(true);
    expect(mockReactFlowProps.nodesConnectable).toBe(true);
  });

  // ── 3. Empty state hidden when nodes exist ───────────────────────────────

  test('empty state is hidden when nodes exist', () => {
    useBlockStore.setState({
      nodes: [createMinimalStartNode()],
    });

    render(<ProcessCanvas />);

    expect(screen.queryByTestId('empty-state')).toBeNull();
    expect(screen.getByTestId('react-flow')).toBeTruthy();
  });

  // ── 4. MiniMap ───────────────────────────────────────────────────────────

  test('renders MiniMap when enabled in settings', () => {
    useSettingsStore.setState({
      designer: {
        ...useSettingsStore.getState().designer,
        showMinimap: true,
      },
    });

    render(<ProcessCanvas />);

    expect(screen.getByTestId('rf-minimap')).toBeTruthy();
  });

  test('hides MiniMap when disabled in settings', () => {
    useSettingsStore.setState({
      designer: {
        ...useSettingsStore.getState().designer,
        showMinimap: false,
      },
    });

    render(<ProcessCanvas />);

    expect(screen.queryByTestId('rf-minimap')).toBeNull();
  });

  // ── 5. Controls & Background always rendered ─────────────────────────────

  test('renders Controls component', () => {
    render(<ProcessCanvas />);
    expect(screen.getByTestId('rf-controls')).toBeTruthy();
  });

  test('renders Background component', () => {
    render(<ProcessCanvas />);
    expect(screen.getByTestId('rf-background')).toBeTruthy();
  });

  // ── 6. CanvasToolbar rendered ────────────────────────────────────────────

  test('renders CanvasToolbar', () => {
    render(<ProcessCanvas />);
    expect(screen.getByTestId('canvas-toolbar')).toBeTruthy();
  });

  // ── 7. Node context menu ─────────────────────────────────────────────────

  test('opens context menu on node right-click', () => {
    useBlockStore.setState({
      nodes: [createMinimalStartNode()],
    });

    render(<ProcessCanvas />);

    // Context menu should be hidden initially
    expect(screen.queryByTestId('canvas-context-menu')).toBeNull();

    // Simulate node context menu via ReactFlow callback
    const onNodeContextMenu = mockReactFlowProps.onNodeContextMenu as (
      event: React.MouseEvent,
      node: { id: string },
    ) => void;
    act(() => {
      onNodeContextMenu(
        { preventDefault: vi.fn(), clientX: 100, clientY: 200 } as unknown as React.MouseEvent,
        { id: 'start-1' },
      );
    });

    // Context menu should now be visible
    expect(screen.getByTestId('canvas-context-menu')).toBeTruthy();
  });

  test('opens context menu on pane right-click', () => {
    render(<ProcessCanvas />);

    expect(screen.queryByTestId('canvas-context-menu')).toBeNull();

    const onPaneContextMenu = mockReactFlowProps.onPaneContextMenu as (
      event: React.MouseEvent,
    ) => void;
    act(() => {
      onPaneContextMenu({
        preventDefault: vi.fn(),
        clientX: 300,
        clientY: 400,
      } as unknown as React.MouseEvent);
    });

    expect(screen.getByTestId('canvas-context-menu')).toBeTruthy();
  });

  // ── 8. Node selection ────────────────────────────────────────────────────

  test('selects a node via nodesChange select event', () => {
    useBlockStore.setState({
      nodes: [createMinimalStartNode({ onSelect: vi.fn() })],
    });

    render(<ProcessCanvas />);

    const onNodesChange = mockReactFlowProps.onNodesChange as (
      changes: Array<Record<string, unknown>>,
    ) => void;
    act(() => {
      onNodesChange([{ type: 'select', id: 'start-1', selected: true }]);
    });

    expect(useSelectionStore.getState().selectedNodeId).toBe('start-1');
  });

  test('deselects a node via nodesChange select event', () => {
    useSelectionStore.setState({ selectedNodeId: 'start-1' });
    useBlockStore.setState({
      nodes: [createMinimalStartNode()],
    });

    render(<ProcessCanvas />);

    const onNodesChange = mockReactFlowProps.onNodesChange as (
      changes: Array<Record<string, unknown>>,
    ) => void;
    act(() => {
      onNodesChange([{ type: 'select', id: 'start-1', selected: false }]);
    });

    expect(useSelectionStore.getState().selectedNodeId).toBeNull();
  });

  // ── 9. Edge connection handling ──────────────────────────────────────────

  test('connects two nodes with valid connection', () => {
    useBlockStore.setState({
      nodes: [
        createMinimalStartNode(),
        createMinimalActivityNode('act-1'),
      ],
    });

    render(<ProcessCanvas />);

    const onConnect = mockReactFlowProps.onConnect as (
      connection: Record<string, unknown>,
    ) => void;
    act(() => {
      onConnect({ source: 'start-1', target: 'act-1' });
    });

    const edges = useBlockStore.getState().edges;
    expect(edges.length).toBe(1);
    expect(edges[0].source).toBe('start-1');
    expect(edges[0].target).toBe('act-1');
  });

  test('rejects self-connection', () => {
    useBlockStore.setState({
      nodes: [createMinimalStartNode()],
    });

    render(<ProcessCanvas />);

    const onConnect = mockReactFlowProps.onConnect as (
      connection: Record<string, unknown>,
    ) => void;
    act(() => {
      onConnect({ source: 'start-1', target: 'start-1' });
    });

    // No edge should be added for self-connection
    expect(useBlockStore.getState().edges.length).toBe(0);
  });

  // ── 10. Drag & drop ─────────────────────────────────────────────────────

  test('handles drag over and drag leave events', () => {
    render(<ProcessCanvas />);

    const onDragOver = mockReactFlowProps.onDragOver as (
      event: React.DragEvent,
    ) => void;
    const onDragLeave = mockReactFlowProps.onDragLeave as (
      event: React.DragEvent,
    ) => void;

    // Drag over should not throw
    act(() => {
      onDragOver({
        preventDefault: vi.fn(),
        dataTransfer: { dropEffect: '' },
      } as unknown as React.DragEvent);
    });

    // Drag leave should not throw
    act(() => {
      onDragLeave({
        currentTarget: document.createElement('div'),
        target: document.createElement('div'),
      } as unknown as React.DragEvent);
    });
  });

  test('drops a block onto the canvas', () => {
    const addNodeSpy = vi.spyOn(useBlockStore.getState(), 'addNode');
    const setSelectedNodeSpy = vi.spyOn(
      useSelectionStore.getState(),
      'setSelectedNode',
    );

    render(<ProcessCanvas />);

    const onDrop = mockReactFlowProps.onDrop as (
      event: React.DragEvent,
    ) => void;
    const dragData = JSON.stringify({
      type: 'block',
      data: { type: 'start', id: 'start-dropped', label: 'Start', name: 'Start', category: 'flow-control' },
    });

    act(() => {
      onDrop({
        preventDefault: vi.fn(),
        dataTransfer: {
          getData: (format: string) => (format === 'application/json' ? dragData : ''),
        },
        clientX: 500,
        clientY: 300,
      } as unknown as React.DragEvent);
    });

    expect(addNodeSpy).toHaveBeenCalled();
    expect(setSelectedNodeSpy).toHaveBeenCalled();
  });

  // ── 11. Roles and accessibility ─────────────────────────────────────────

  test('has application role with descriptive aria-label', () => {
    render(<ProcessCanvas />);

    const appRegion = screen.getByRole('application');
    expect(appRegion).toBeTruthy();
    expect(appRegion.getAttribute('aria-label')).toContain('Process Designer');
  });

  // ── 12. Node deletion via edges change ───────────────────────────────────

  test('removes edge when edge delete event fires', () => {
    const edge: Edge = {
      id: 'edge-1',
      source: 'start-1',
      target: 'act-1',
    };
    useBlockStore.setState({
      nodes: [createMinimalStartNode(), createMinimalActivityNode('act-1')],
      edges: [edge],
    });

    render(<ProcessCanvas />);

    expect(useBlockStore.getState().edges.length).toBe(1);

    const onEdgesChange = mockReactFlowProps.onEdgesChange as (
      changes: Array<Record<string, unknown>>,
    ) => void;
    act(() => {
      onEdgesChange([{ type: 'remove', id: 'edge-1' }]);
    });

    expect(useBlockStore.getState().edges.length).toBe(0);
  });

  // ── 13. Node deletion via nodes change ───────────────────────────────────

  test('removes node when node remove event fires', () => {
    // Use an activity node because the store blocks removal of the last start node
    useBlockStore.setState({
      nodes: [createMinimalStartNode(), createMinimalActivityNode('act-1')],
    });

    render(<ProcessCanvas />);

    expect(useBlockStore.getState().nodes.length).toBe(2);

    const onNodesChange = mockReactFlowProps.onNodesChange as (
      changes: Array<Record<string, unknown>>,
    ) => void;
    act(() => {
      onNodesChange([{ type: 'remove', id: 'act-1' }]);
    });

    expect(useBlockStore.getState().nodes.length).toBe(1);
    expect(useBlockStore.getState().nodes[0].id).toBe('start-1');
  });
});
