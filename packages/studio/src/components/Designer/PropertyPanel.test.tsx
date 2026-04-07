import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, test } from 'vitest';
import PropertyPanel from './PropertyPanel';
import { useProcessStore } from '../../stores/processStore';
import { useVariableStore } from '../../stores/variableStore';
import type { BlockData } from '../../types/blocks';
import { createDefaultBlockData } from '../../types/blocks';
import type { ProcessNodeData } from '../../stores/processStore';

function renderWithSelectedBlock(blockData: BlockData, dataOverrides: Partial<ProcessNodeData> = {}) {
  useProcessStore.setState({
    metadata: null,
    edges: [],
    selectedNodeId: 'node-1',
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
  });

  return render(<PropertyPanel />);
}

describe('PropertyPanel block editors', () => {
  beforeEach(() => {
    useProcessStore.persist.clearStorage();
    useProcessStore.getState().clearProcess();
    useVariableStore.persist.clearStorage();
    useVariableStore.getState().clearVariables();
  });

  test('renders and updates switch case editors', () => {
    const blockData = {
      ...createDefaultBlockData('switch', 'switch-1'),
      expression: '${status}',
      cases: [{ id: 'success', value: 'success', label: 'Success' }],
    } as Extract<BlockData, { type: 'switch' }>;

    renderWithSelectedBlock(blockData);

    expect(screen.getByText('Cases')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Add case/i }));

    const nextCases = (useProcessStore.getState().nodes[0].data.blockData as Extract<BlockData, { type: 'switch' }>).cases;
    expect(nextCases).toHaveLength(2);
    expect(screen.getByDisplayValue('${status}')).toBeTruthy();
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

    const nextBranches = (useProcessStore.getState().nodes[0].data.blockData as Extract<BlockData, { type: 'parallel' }>).branches;
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

    const nextBlock = useProcessStore.getState().nodes[0].data.blockData as Extract<BlockData, { type: 'try-catch' }>;
    expect(nextBlock.finallyBlock).toEqual([]);
    expect(screen.getByDisplayValue('TimeoutError')).toBeTruthy();
  });
});
