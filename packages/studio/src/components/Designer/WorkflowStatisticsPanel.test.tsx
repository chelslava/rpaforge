import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { Edge } from '@xyflow/react';
import { useBlockStore } from '../../stores/blockStore';
import { useDiagramStore } from '../../stores/diagramStore';
import { useVariableStore } from '../../stores/variableStore';
import type { ProcessVariable } from '../../stores/variableStore';
import type { Activity } from '../../domain/activity';
import type { ProcessNode, ProcessNodeData } from '../../stores/blockStore';
import type { DiagramDocument, ProjectConfig } from '../../stores/diagramStore';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en' },
  }),
}));

import WorkflowStatisticsPanel from './WorkflowStatisticsPanel';

/* ── Helpers ── */

function createActivity(overrides: Partial<Activity> = {}): Activity {
  return {
    id: 'builtin.log',
    name: 'Log',
    library: 'BuiltIn',
    type: 'sync',
    category: 'BuiltIn',
    description: 'Log a message',
    tags: [],
    timeout_ms: 0,
    has_retry: false,
    has_continue_on_error: false,
    params: [],
    has_output: false,
    output_description: '',
    ...overrides,
  };
}

function createActivityNode(
  id: string,
  activityOverrides: Partial<Activity> = {},
): ProcessNode {
  const activity = createActivity(activityOverrides);
  return {
    id,
    type: 'activity',
    position: { x: 0, y: 0 },
    data: {
      activity,
      blockData: {
        type: 'activity',
        id,
        name: activity.name,
        library: activity.library,
        description: '',
        params: {},
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any,
    } as ProcessNodeData,
  };
}

function createBlockNode(
  id: string,
  blockType: string,
  blockName = blockType,
): ProcessNode {
  return {
    id,
    type: blockType,
    position: { x: 0, y: 0 },
    data: {
      blockData: {
        type: blockType,
        id,
        name: blockName,
        description: '',
        category: 'flow-control',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any,
    } as ProcessNodeData,
  };
}

function createEdge(id: string, source: string, target: string): Edge {
  return { id, source, target };
}

function createMockVariable(
  overrides: Partial<ProcessVariable> = {},
): ProcessVariable {
  return {
    id: 'var-1',
    name: 'testVar',
    type: 'string',
    value: '',
    scope: 'task',
    projectId: 'proj-1',
    description: '',
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
    ...overrides,
  };
}

const BASE_PROJECT: ProjectConfig = {
  id: 'proj-1',
  name: 'Test Project',
  version: '1.0',
  main: '',
  diagrams: [],
  folders: [],
  settings: { defaultTimeout: 30000, screenshotOnError: true },
};

/* ── Tests ── */

describe('WorkflowStatisticsPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    useBlockStore.setState({ nodes: [], edges: [] });
    useVariableStore.setState({ variables: [] });
    useDiagramStore.setState({
      project: null,
      activeDiagramId: null,
      openDiagramIds: [],
      recentDiagrams: [],
      folders: [],
      diagramDocuments: {},
    });
  });

  test('shows empty state when there are no nodes', () => {
    render(<WorkflowStatisticsPanel />);

    expect(screen.getByText('workflowStatistics.title')).toBeTruthy();
    expect(screen.getByText('workflowStatistics.empty')).toBeTruthy();
  });

  test('renders stat cards with node and edge counts', () => {
    useBlockStore.setState({
      nodes: [
        createActivityNode('n1'),
        createActivityNode('n2'),
        createBlockNode('n3', 'start'),
      ],
      edges: [createEdge('e1', 'n1', 'n2'), createEdge('e2', 'n2', 'n3')],
    });
    useDiagramStore.setState({ project: { ...BASE_PROJECT } });

    render(<WorkflowStatisticsPanel />);

    expect(screen.getByText('workflowStatistics.nodes')).toBeTruthy();
    expect(screen.getByText('workflowStatistics.edges')).toBeTruthy();
    expect(screen.getByText('workflowStatistics.estimatedTime')).toBeTruthy();
    expect(screen.getByText('3')).toBeTruthy();
  });

  test('shows activity and block breakdown', () => {
    useBlockStore.setState({
      nodes: [
        createActivityNode('n1'),
        createActivityNode('n2', { library: 'DesktopUI', type: 'async' }),
        createBlockNode('n3', 'start'),
        createBlockNode('n4', 'if'),
      ],
      edges: [],
    });
    useDiagramStore.setState({ project: { ...BASE_PROJECT } });

    const { container } = render(<WorkflowStatisticsPanel />);

    // Mock t returns keys, so rendered text is e.g. "2 workflowStatistics.activities"
    expect(container.textContent).toContain('workflowStatistics.activities');
    expect(container.textContent).toContain('workflowStatistics.blocks');
    expect(screen.getByText('4')).toBeTruthy();
  });

  test('shows library usage pills', () => {
    useBlockStore.setState({
      nodes: [
        createActivityNode('n1', { library: 'BuiltIn' }),
        createActivityNode('n2', { library: 'BuiltIn' }),
        createActivityNode('n3', { library: 'DesktopUI' }),
        createActivityNode('n4', { library: 'WebUI' }),
      ],
      edges: [],
    });
    useDiagramStore.setState({ project: { ...BASE_PROJECT } });

    render(<WorkflowStatisticsPanel />);

    expect(screen.getByText('BuiltIn')).toBeTruthy();
    expect(screen.getByText('DesktopUI')).toBeTruthy();
    expect(screen.getByText('WebUI')).toBeTruthy();
    expect(screen.getByText('workflowStatistics.libraries')).toBeTruthy();
  });

  test('shows estimated execution time based on activity types', () => {
    useBlockStore.setState({
      nodes: [
        createActivityNode('n1', { library: 'BuiltIn', type: 'sync' }),
        createActivityNode('n2', { library: 'DesktopUI', type: 'async' }),
        createActivityNode('n3', { library: 'DesktopUI', type: 'async' }),
      ],
      edges: [],
    });
    useDiagramStore.setState({ project: { ...BASE_PROJECT } });

    render(<WorkflowStatisticsPanel />);

    expect(screen.getByText('~5s')).toBeTruthy();
  });

  test('shows <1s for very fast workflows', () => {
    useBlockStore.setState({
      nodes: [createActivityNode('n1', { library: 'BuiltIn', type: 'sync' })],
      edges: [],
    });
    useDiagramStore.setState({ project: { ...BASE_PROJECT } });

    render(<WorkflowStatisticsPanel />);

    expect(screen.getByText('<1s')).toBeTruthy();
  });

  test('shows variable count with scope breakdown', () => {
    useBlockStore.setState({
      nodes: [createActivityNode('n1')],
      edges: [],
    });
    useDiagramStore.setState({ project: { ...BASE_PROJECT } });
    useVariableStore.setState({
      variables: [
        createMockVariable({ id: 'v1', name: 'globalVar', scope: 'process' }),
        createMockVariable({ id: 'v2', name: 'taskVar1', scope: 'task' }),
        createMockVariable({ id: 'v3', name: 'taskVar2', scope: 'task' }),
      ],
    });

    render(<WorkflowStatisticsPanel />);

    expect(screen.getByText('workflowStatistics.variables')).toBeTruthy();
    expect(screen.getByText('1p + 2t')).toBeTruthy();
  });

  test('shows zero variables when none exist', () => {
    useBlockStore.setState({
      nodes: [createActivityNode('n1')],
      edges: [],
    });
    useDiagramStore.setState({ project: { ...BASE_PROJECT } });

    render(<WorkflowStatisticsPanel />);

    expect(screen.getByText('workflowStatistics.variables')).toBeTruthy();
    expect(screen.queryByText(/p \+ .*t/)).toBeNull();
  });

  test('shows largest sub-diagram when loaded', () => {
    useBlockStore.setState({
      nodes: [createActivityNode('n1')],
      edges: [],
    });

    const diagramDocuments: Record<string, DiagramDocument> = {
      'sub-1': {
        metadata: {
          id: 'sub-1',
          name: 'Data Processing',
          description: '',
          createdAt: '2025-01-01T00:00:00.000Z',
          updatedAt: '2025-01-01T00:00:00.000Z',
        },
        nodes: [
          createActivityNode('s1'),
          createActivityNode('s2'),
          createActivityNode('s3'),
          createActivityNode('s4'),
          createActivityNode('s5'),
        ],
        edges: [],
      },
      'sub-2': {
        metadata: {
          id: 'sub-2',
          name: 'Report Gen',
          description: '',
          createdAt: '2025-01-01T00:00:00.000Z',
          updatedAt: '2025-01-01T00:00:00.000Z',
        },
        nodes: [createActivityNode('r1'), createActivityNode('r2')],
        edges: [],
      },
    };

    useDiagramStore.setState({
      project: {
        ...BASE_PROJECT,
        diagrams: [
          {
            id: 'main-1',
            name: 'Main Process',
            type: 'main',
            path: 'Main.process',
            inputs: [],
            outputs: [],
            createdAt: '2025-01-01T00:00:00.000Z',
            updatedAt: '2025-01-01T00:00:00.000Z',
          },
          {
            id: 'sub-1',
            name: 'Data Processing',
            type: 'sub-diagram',
            path: 'Sub/Data.process',
            inputs: [],
            outputs: [],
            createdAt: '2025-01-01T00:00:00.000Z',
            updatedAt: '2025-01-01T00:00:00.000Z',
          },
          {
            id: 'sub-2',
            name: 'Report Gen',
            type: 'sub-diagram',
            path: 'Sub/Report.process',
            inputs: [],
            outputs: [],
            createdAt: '2025-01-01T00:00:00.000Z',
            updatedAt: '2025-01-01T00:00:00.000Z',
          },
        ],
      },
      activeDiagramId: 'main-1',
      diagramDocuments,
    });
    useVariableStore.setState({ variables: [] });

    const { container } = render(<WorkflowStatisticsPanel />);

    // Mock t doesn't interpolate params, so the key is rendered as-is
    expect(container.textContent).toContain('workflowStatistics.largestSubDiagram');
  });

  test('handles no project gracefully', () => {
    useBlockStore.setState({
      nodes: [createActivityNode('n1')],
      edges: [],
    });

    render(<WorkflowStatisticsPanel />);

    expect(screen.getByText('workflowStatistics.nodes')).toBeTruthy();
    expect(screen.getByText('workflowStatistics.estimatedTime')).toBeTruthy();
  });

  test('handles non-activity blocks without activity data', () => {
    useBlockStore.setState({
      nodes: [
        createBlockNode('n1', 'start'),
        createBlockNode('n2', 'if'),
        createBlockNode('n3', 'while'),
      ],
      edges: [],
    });
    useDiagramStore.setState({ project: { ...BASE_PROJECT } });

    const { container } = render(<WorkflowStatisticsPanel />);

    expect(screen.getByText('3')).toBeTruthy();
    // Mock t returns keys, so rendered text is e.g. "3 workflowStatistics.blocks"
    expect(container.textContent).toContain('workflowStatistics.blocks');
    expect(screen.queryByText('workflowStatistics.libraries')).toBeNull();
  });
});
