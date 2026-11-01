import '@testing-library/jest-dom/vitest';

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';

import WatchPanel from './WatchPanel';
import { useDiagramStore } from '../../stores/diagramStore';
import { useDebuggerStore } from '../../stores/debuggerStore';
import { useWatchStore } from '../../stores/watchStore';

const evaluateExpression = vi.fn();

vi.mock('../../hooks/useEngine', () => ({
  useEngine: () => ({ evaluateExpression }),
}));

const DIAGRAM = 'diag-9';

describe('WatchPanel', () => {
  beforeEach(() => {
    evaluateExpression.mockReset();
    useDiagramStore.setState({ activeDiagramId: DIAGRAM });
    useDebuggerStore.setState({ isPaused: true, evaluationTick: 0 });
    useWatchStore.setState({ watchesByDiagram: {} });
  });

  test('renders empty state and adds a watch from the input', async () => {
    render(<WatchPanel />);
    expect(screen.getByText('watch.empty')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('watch.placeholder'), {
      target: { value: 'total > 100' },
    });
    evaluateExpression.mockResolvedValue({ ok: true, value: true, type: 'bool' });
    fireEvent.click(screen.getByRole('button', { name: 'watch.add' }));

    await waitFor(() => {
      expect(useWatchStore.getState().watchesByDiagram[DIAGRAM]).toHaveLength(1);
    });
    const list = useWatchStore.getState().watchesByDiagram[DIAGRAM];
    expect(list[0].expression).toBe('total > 100');
  });

  test('shows inline error when evaluation fails', async () => {
    useWatchStore.getState().addWatch(DIAGRAM, 'broken_expr');
    evaluateExpression.mockResolvedValue({
      ok: false,
      error: "Unknown variable 'broken_expr'",
    });

    render(<WatchPanel />);
    await waitFor(() => expect(evaluateExpression).toHaveBeenCalled());
    await waitFor(() =>
      expect(screen.getByText(/Unknown variable/)).toBeInTheDocument(),
    );
  });

  test('shows formatted value on successful evaluation', async () => {
    useWatchStore.getState().addWatch(DIAGRAM, 'total');
    evaluateExpression.mockResolvedValue({ ok: true, value: 150, type: 'int' });

    render(<WatchPanel />);
    await waitFor(() =>
      expect(screen.getByText(/150/)).toBeInTheDocument(),
    );
  });

  test('remove button deletes the watch', async () => {
    useWatchStore.getState().addWatch(DIAGRAM, 'total');
    evaluateExpression.mockResolvedValue({ ok: true, value: 1, type: 'int' });

    render(<WatchPanel />);
    await waitFor(() => expect(evaluateExpression).toHaveBeenCalled());

    fireEvent.click(screen.getByRole('button', { name: 'watch.remove' }));
    expect(useWatchStore.getState().watchesByDiagram[DIAGRAM]).toHaveLength(0);
  });

  test('does not auto-evaluate while running', () => {
    useDebuggerStore.setState({ isPaused: false });
    useWatchStore.getState().addWatch(DIAGRAM, 'total');

    render(<WatchPanel />);
    expect(evaluateExpression).not.toHaveBeenCalled();
    expect(screen.getByText('watch.notEvaluated')).toBeInTheDocument();
  });
});

