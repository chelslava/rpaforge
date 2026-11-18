import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, test } from 'vitest';
import type { Node } from '@xyflow/react';

import ProblemsPanel from './ProblemsPanel';
import { useDiagramStore, type DiagramDocument } from '../../stores/diagramStore';
import type { ProcessNodeData } from '../../stores/processStore';
import { useProblemsStore, type ProblemItem } from '../../stores/problemsStore';
import { useSelectionStore } from '../../stores/selectionStore';

const problem: ProblemItem = {
  id: 'p1',
  severity: 'error',
  code: 'missing_diagram',
  message: 'Sub-diagram not found: ghost-diagram',
  diagramId: 'main-1',
  nodeId: 'node-1',
  source: 'diagram',
};

function docWithNodes(nodes: Node<ProcessNodeData>[]): DiagramDocument {
  return { metadata: {} as DiagramDocument['metadata'], nodes, edges: [] };
}

function seedProject() {
  const meta = {
    id: 'main-1',
    name: 'Main',
    type: 'main' as const,
    path: 'main.process',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  };
  useDiagramStore.getState().loadProject(
    {
      name: 'P',
      version: '1.0.0',
      main: 'main-1',
      diagrams: [meta],
      folders: [],
      settings: { defaultTimeout: 30, screenshotOnError: false },
    },
    { 'main-1': docWithNodes([]) }
  );
}

describe('ProblemsPanel', () => {
  beforeEach(() => {
    useProblemsStore.getState().clear();
    useSelectionStore.setState({ selectedNodeId: null, selectedEdgeId: null });
    useDiagramStore.persist.clearStorage();
    useDiagramStore.setState({
      project: null,
      activeDiagramId: null,
      openDiagramIds: [],
      recentDiagrams: [],
      folders: [],
      diagramDocuments: {},
    });
    seedProject();
  });

  test('renders nothing without an active project', () => {
    useDiagramStore.setState({ project: null, activeDiagramId: null });
    const { container } = render(<ProblemsPanel />);
    expect(container.firstChild).toBeNull();
  });

  test('shows empty state in the collapsed header', () => {
    render(<ProblemsPanel />);
    expect(screen.getByText('Workspace problems')).toBeTruthy();
    expect(screen.getByText('No problems detected')).toBeTruthy();
  });

  test('lists problems when expanded and navigates on click', () => {
    render(<ProblemsPanel />);
    // The mount-effect refresh recomputes from the clean fixture first, so
    // seed the panel's store only after render.
    act(() => {
      useProblemsStore.setState({ problems: [problem] });
    });

    fireEvent.click(screen.getByLabelText('Show problem details'));
    expect(screen.getByText('Sub-diagram not found: ghost-diagram')).toBeTruthy();

    fireEvent.click(screen.getByText('Sub-diagram not found: ghost-diagram'));
    expect(useSelectionStore.getState().selectedNodeId).toBe('node-1');
    expect(useDiagramStore.getState().activeDiagramId).toBe('main-1');
  });

  test('refresh recomputes problems from the workspace', () => {
    render(<ProblemsPanel />);
    act(() => {
      useProblemsStore.setState({ problems: [problem] });
    });

    fireEvent.click(screen.getByLabelText('Refresh problems'));
    expect(useProblemsStore.getState().problems).toHaveLength(0);
  });

  test('severity counts render next to the title', () => {
    render(<ProblemsPanel />);
    act(() => {
      useProblemsStore.setState({ problems: [problem] });
    });

    expect(screen.getByLabelText('errors')).toBeTruthy();
  });
});
