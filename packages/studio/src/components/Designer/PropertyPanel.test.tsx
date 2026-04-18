import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, test } from 'vitest';
import { PropertyPanel } from './PropertyPanel';
import { useDiagramStore } from '../../stores/diagramStore';
import { useBlockStore } from '../../stores/blockStore';
import { useSelectionStore } from '../../stores/selectionStore';
import { useVariableStore } from '../../stores/variableStore';
import type { BlockData } from '../../types/blocks';
import { createDefaultBlockData } from '../../types/blocks';
import type { ProcessNodeData } from '../../stores/blockStore';

function renderWithSelectedBlock(blockData: BlockData, dataOverrides: Partial<ProcessNodeData> = {}) {
  useBlockStore.setState({
    nodes: [
      {
        id: 'node-1',
        type: blockData.type,
        position: { x: 0, y: 0 },
        data: {
          blockData,
          description: '',
          tags: [],
          ...dataOverrides,
        },
      },
    ],
    edges: [],
  });

  useSelectionStore.setState({
    selectedNodeId: 'node-1',
  });

  return render(<PropertyPanel />);
}

describe('PropertyPanel block editors', () => {
  beforeEach(() => {
    useBlockStore.setState({
      nodes: [],
      edges: [],
    });

    useSelectionStore.setState({
      selectedNodeId: null,
      selectedEdgeId: null,
      multiSelectIds: [],
    });

    useDiagramStore.setState({
      project: null,
      activeDiagramId: null,
      openDiagramIds: [],
      recentDiagrams: [],
      folders: [],
      diagramDocuments: {},
    });

    useVariableStore.getState().clearVariables();
  });

  test('renders and updates switch case editors', () => {
    const blockData = {
      ...createDefaultBlockData('switch', 'switch-1'),
      expression: 'status',
      cases: [{ id: 'success', value: 'success', label: 'Success' }],
    } as Extract<BlockData, { type: 'switch' }>;

    renderWithSelectedBlock(blockData);

    expect(screen.getByText('Cases')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Add case/i }));

    const nextCases = (useBlockStore.getState().nodes[0].data.blockData as Extract<BlockData, { type: 'switch' }>).cases;
    expect(nextCases).toHaveLength(2);
    expect(screen.getByDisplayValue('status')).toBeTruthy();
  });

  test('renders and updates parallel branch editors', () => {
    const blockData = {
      ...createDefaultBlockData('parallel', 'parallel-1'),
      branches: [
        { id: 'branch-1', name: 'Branch 1', activities: [] },
        { id: 'branch-2', name: 'Branch 2', activities: [] },
      ],
    } as Extract<BlockData, { type: 'parallel' }>;

    renderWithSelectedBlock(blockData);

    const inputs = screen.getAllByDisplayValue(/Branch /);
    expect(inputs).toHaveLength(2);

    fireEvent.change(inputs[0], { target: { value: 'Primary Branch' } });

    const nextBranches = (useBlockStore.getState().nodes[0].data.blockData as Extract<BlockData, { type: 'parallel' }>).branches;
    expect(nextBranches[0].name).toBe('Primary Branch');
  });

  test('renders try/catch handler editors and finally toggle', () => {
    const blockData = {
      ...createDefaultBlockData('try-catch', 'try-1'),
      exceptBlocks: [{ id: 'except-1', exceptionType: 'TimeoutError', variable: 'err', handler: [] }],
      finallyBlock: undefined,
    } as Extract<BlockData, { type: 'try-catch' }>;

    renderWithSelectedBlock(blockData);

    expect(screen.getByText('Exception handlers')).toBeTruthy();
    fireEvent.click(screen.getByLabelText('Enable FINALLY path'));

    const nextBlock = useBlockStore.getState().nodes[0].data.blockData as Extract<BlockData, { type: 'try-catch' }>;
    expect(nextBlock.finallyBlock).toEqual([]);
    expect(screen.getByDisplayValue('TimeoutError')).toBeTruthy();
  });

  test('configures parameter mappings for sub-diagram calls', () => {
    useDiagramStore.setState({
      project: {
        name: 'My Project',
        version: '1.0.0',
        main: 'main-diagram',
        diagrams: [
          {
            id: 'main-diagram',
            name: 'Main Process',
            type: 'main',
            path: 'Main.process',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
          {
            id: 'login-flow',
            name: 'Login Flow',
            type: 'sub-diagram',
            path: 'auth/Login-Flow.process',
            inputs: ['username'],
            outputs: ['success'],
            folder: 'auth',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        ],
        folders: ['auth'],
        settings: {
          defaultTimeout: 30000,
          screenshotOnError: true,
        },
      },
      activeDiagramId: 'main-diagram',
      openDiagramIds: ['main-diagram'],
      recentDiagrams: [],
      folders: ['auth'],
      diagramDocuments: {},
    });

    useVariableStore.getState().addVariable({
      name: 'user',
      type: 'string',
      scope: 'task',
      value: '',
    });
    useVariableStore.getState().addVariable({
      name: 'login_success',
      type: 'boolean',
      scope: 'task',
      value: '',
    });

    const blockData = {
      ...createDefaultBlockData('sub-diagram-call', 'sub-call-1'),
      diagramId: 'login-flow',
      diagramName: 'Login Flow',
      parameters: {},
      returns: {},
    } as Extract<BlockData, { type: 'sub-diagram-call' }>;

    renderWithSelectedBlock(blockData);

    fireEvent.click(screen.getByRole('button', { name: /Configure mappings/i }));
    fireEvent.change(screen.getAllByRole('textbox')[1], {
      target: { value: 'user' },
    });
    fireEvent.change(screen.getAllByRole('textbox')[2], {
      target: { value: 'login_success' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^Apply$/i }));

    const nextBlock = useBlockStore.getState().nodes[0].data
      .blockData as Extract<BlockData, { type: 'sub-diagram-call' }>;

    expect(nextBlock.parameters).toEqual({ username: 'user' });
    expect(nextBlock.returns).toEqual({ success: 'login_success' });
  });
});
