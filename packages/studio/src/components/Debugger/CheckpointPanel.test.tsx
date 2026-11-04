import '@testing-library/jest-dom/vitest';

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';

import CheckpointPanel from './CheckpointPanel';
import { useDebuggerStore } from '../../stores/debuggerStore';
import { useDiagramStore } from '../../stores/diagramStore';

const listCheckpoints = vi.fn();
const rewindToCheckpoint = vi.fn();
const applyHotReload = vi.fn();
const onRestartRun = vi.fn();

vi.mock('../../hooks/useEngine', () => ({
  useEngine: () => ({ listCheckpoints, rewindToCheckpoint, applyHotReload }),
}));

const DIAGRAM_ID = 'diag-1';
const DOCUMENT = {
  metadata: { name: 'Test' },
  nodes: [],
  edges: [],
};

describe('CheckpointPanel', () => {
  beforeEach(() => {
    listCheckpoints.mockReset();
    rewindToCheckpoint.mockReset();
    applyHotReload.mockReset();
    onRestartRun.mockReset();
    useDebuggerStore.setState({ isPaused: false });
    useDiagramStore.setState({
      activeDiagramId: DIAGRAM_ID,
      diagramDocuments: { [DIAGRAM_ID]: DOCUMENT },
    } as never);
  });

  test('renders the empty state when no checkpoints exist', async () => {
    listCheckpoints.mockResolvedValue([]);
    render(<CheckpointPanel onRestartRun={onRestartRun} />);
    await waitFor(() => {
      expect(screen.getByText('debugger.checkpoints.empty')).toBeInTheDocument();
    });
  });

  test('lists checkpoints and rewinds on click', async () => {
    listCheckpoints.mockResolvedValue([
      {
        checkpoint_id: 'cp_1',
        timestamp: '2026-11-05T10:00:00',
        current_node_id: 'n6',
        current_task_name: 'Main',
        activity_count: 6,
        variable_count: 2,
        state: 'running',
      },
    ]);
    rewindToCheckpoint.mockResolvedValue({});
    onRestartRun.mockResolvedValue(undefined);

    render(<CheckpointPanel onRestartRun={onRestartRun} />);
    await waitFor(() => {
      expect(screen.getByText(/n6/)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'debugger.checkpoints.rewind' }));
    await waitFor(() => {
      expect(rewindToCheckpoint).toHaveBeenCalledWith('cp_1');
      expect(onRestartRun).toHaveBeenCalledTimes(1);
    });
  });

  test('apply & continue sends the active diagram document', async () => {
    useDebuggerStore.setState({ isPaused: true });
    listCheckpoints.mockResolvedValue([]);
    applyHotReload.mockResolvedValue({ paused_node_id: 'n2', added_nodes: ['n2b'] });
    onRestartRun.mockResolvedValue(undefined);

    render(<CheckpointPanel onRestartRun={onRestartRun} />);
    const button = await screen.findByRole('button', {
      name: 'debugger.checkpoints.applyContinue',
    });
    fireEvent.click(button);
    await waitFor(() => {
      expect(applyHotReload).toHaveBeenCalledWith({
        nodes: DOCUMENT.nodes,
        edges: DOCUMENT.edges,
        metadata: DOCUMENT.metadata,
        variables: [],
      });
      expect(onRestartRun).toHaveBeenCalledTimes(1);
    });
    expect(
      screen.getByText(/debugger.checkpoints.summaryAdded/)
    ).toBeInTheDocument();
  });

  test('shows rejection reasons when hot reload fails', async () => {
    useDebuggerStore.setState({ isPaused: true });
    listCheckpoints.mockResolvedValue([]);
    applyHotReload.mockRejectedValue(
      new Error("paused node 'n2' was deleted — stop the run instead")
    );

    render(<CheckpointPanel onRestartRun={onRestartRun} />);
    const button = await screen.findByRole('button', {
      name: 'debugger.checkpoints.applyContinue',
    });
    fireEvent.click(button);
    await waitFor(() => {
      expect(
        screen.getByText(/paused node 'n2' was deleted/)
      ).toBeInTheDocument();
    });
    expect(onRestartRun).not.toHaveBeenCalled();
  });
});
