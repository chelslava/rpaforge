import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, test, vi } from 'vitest';

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('../../hooks/useFocusTrap', () => ({
  useFocusTrap: () => React.createRef<HTMLDivElement>(),
}));

import { useBlockStore } from '../../stores/blockStore';
import { useDiagramStore } from '../../stores/diagramStore';
import ExtractSubDiagramDialog from './ExtractSubDiagramDialog';

vi.mock('../../stores/projectFsStore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../stores/projectFsStore')>();
  return {
    ...actual,
    useProjectFsStore: Object.assign(
      (selector: (s: Record<string, unknown>) => unknown) => {
        const state = {
          ...actual.useProjectFsStore.getState(),
          createFile: vi.fn(async () => undefined),
          projectPath: '/proj',
        };
        return selector(state);
      },
      { getState: () => actual.useProjectFsStore.getState() }
    ),
  };
});

function startNode(id = 'start'): Record<string, unknown> {
  return {
    id,
    type: 'start',
    position: { x: 0, y: 0 },
    data: { blockData: { id, type: 'start', name: 'Start', label: 'Start' } },
  };
}

function activityNode(id: string): Record<string, unknown> {
  return {
    id,
    type: 'activity',
    position: { x: 100, y: 0 },
    data: {
      blockData: {
        id,
        type: 'activity',
        name: id,
        label: id,
        category: 'flow',
        library: 'Flow',
        activity: 'Log Message',
        args: [id],
        output_variable: '',
      },
    },
  };
}

describe('ExtractSubDiagramDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('shows derived contract for a valid selection', () => {
    useBlockStore.setState({
      nodes: [startNode(), activityNode('a'), activityNode('b')] as never,
      edges: [
        { id: 's-a', source: 'start', target: 'a' },
        { id: 'a-b', source: 'a', target: 'b' },
        { id: 'b-x', source: 'b', target: 'outside' },
      ] as never,
    });

    render(<ExtractSubDiagramDialog selectedIds={['a', 'b']} onClose={vi.fn()} />);

    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.getByLabelText('canvas.extractSubDiagram.nameLabel')).toBeTruthy();
    expect(screen.getByText((c) => c.includes('canvas.extractSubDiagram.inputs'))).toBeTruthy();
  });

  test('shows an error for a selection without an entry', () => {
    useBlockStore.setState({
      nodes: [startNode(), activityNode('a')] as never,
      edges: [] as never,
    });

    render(<ExtractSubDiagramDialog selectedIds={['a']} onClose={vi.fn()} />);

    expect(screen.getByText((c) => c.includes('errors.no-start'))).toBeTruthy();
    // Confirm disabled.
    expect(
      (screen.getByText('canvas.extractSubDiagram.confirm') as HTMLButtonElement).disabled
    ).toBe(true);
  });

  test('confirm creates the diagram file and call node', async () => {
    const addDiagram = vi.fn(() => ({ id: 'd1' }));
    useDiagramStore.setState({ addDiagram } as never);
    useBlockStore.setState({
      nodes: [startNode(), activityNode('a'), activityNode('b')] as never,
      edges: [
        { id: 's-a', source: 'start', target: 'a' },
        { id: 'a-b', source: 'a', target: 'b' },
        { id: 'b-x', source: 'b', target: 'outside' },
      ] as never,
    });

    const onClose = vi.fn();
    render(<ExtractSubDiagramDialog selectedIds={['a', 'b']} onClose={onClose} />);

    fireEvent.change(screen.getByLabelText('canvas.extractSubDiagram.nameLabel'), {
      target: { value: 'Extracted Flow' },
    });
    fireEvent.click(screen.getByText('canvas.extractSubDiagram.confirm'));

    await vi.waitFor(() => {
      expect(addDiagram).toHaveBeenCalled();
      expect(onClose).toHaveBeenCalled();
    });
  });
});
