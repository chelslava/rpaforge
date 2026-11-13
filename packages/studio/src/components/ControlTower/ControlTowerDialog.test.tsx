import { beforeEach, describe, expect, test, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';

import ControlTowerDialog from './ControlTowerDialog';
import { useOrchestratorStore, type ServeRun } from '../../stores/orchestratorStore';

const RUN: ServeRun = {
  item_id: 'item-1',
  queue_name: 'jobs',
  run_id: 'run-1',
  diagram_path: 'invoice.process',
  status: 'success',
  exit_code: 0,
  started_at: '2026-11-10T07:00:00Z',
  finished_at: '2026-11-10T07:01:00Z',
  audit_path: null,
  error: null,
  steps: [{ activity: 'Log', status: 'success', duration_ms: 12 }],
};

const setConnection = () => {
  useOrchestratorStore.setState({
    connections: [
      { id: 'conn-1', name: 'local', baseUrl: 'http://127.0.0.1:8765', hasToken: true },
    ],
    activeConnectionId: 'conn-1',
    health: { 'conn-1': 'healthy' },
    runs: [RUN],
    runDetail: RUN,
    schedules: [
      {
        name: 'nightly',
        cron: '30 9 * * 1-5',
        diagram_path: 'backup.process',
        priority: 'Normal',
        missed_run_policy: 'skip',
        last_enqueued: null,
      },
    ],
    metrics: { queue: 'jobs', queue_backend: 'sqlite', stats: { New: 2, DeadLetter: 1 } },
  });
};

describe('ControlTowerDialog', () => {
  beforeEach(() => {
    setConnection();
  });

  const renderDialog = () => render(<ControlTowerDialog open onClose={() => undefined} />);

  test('renders the active connection health badge', () => {
    renderDialog();
    expect(screen.getByTestId('orchestrator-health-badge').textContent).toBe('Healthy');
    expect(screen.getByText('local')).toBeTruthy();
  });

  test('shows runs with status chips and switches between tabs', async () => {
    renderDialog();
    expect(screen.getByTestId('orchestrator-run-status').textContent).toBe('success');
    expect(screen.getAllByText('invoice.process').length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole('tab', { name: /Queues/i }));
    expect(screen.getByTestId('orchestrator-queue-stats').textContent).toContain('Dead letter');

    fireEvent.click(screen.getByRole('tab', { name: /Schedules/i }));
    expect(screen.getByTestId('orchestrator-schedule-list').textContent).toContain('nightly');
  });

  test('run detail lists step timing', () => {
    renderDialog();
    // Selecting a run switches the right pane to the detail view.
    fireEvent.click(screen.getAllByText('invoice.process')[0]);
    const steps = screen.getByTestId('orchestrator-run-steps');
    expect(steps.textContent).toContain('Log');
    expect(steps.textContent).toContain('12 ms');
  });

  test('cancel button calls the store and refreshes', async () => {
    const cancelMock = vi.fn(async () => 'cancelled' as const);
    const refreshMock = vi.fn(async () => undefined);
    useOrchestratorStore.setState({
      runs: [{ ...RUN, status: 'running' }],
      runDetail: null,
    });
    useOrchestratorStore.setState({ cancelRun: cancelMock, refreshRuns: refreshMock });

    renderDialog();
    fireEvent.click(screen.getByTestId('orchestrator-cancel-run'));
    await waitFor(() => expect(cancelMock).toHaveBeenCalledWith('item-1'));
    await waitFor(() => expect(refreshMock).toHaveBeenCalled());
  });

  test('run form queues a trigger and refreshes (issue #875)', async () => {
    const triggerMock = vi.fn(async () => ({ item_id: 'item-new', queue: 'jobs' }));
    const refreshMock = vi.fn(async () => undefined);
    useOrchestratorStore.setState({
      runs: [],
      runDetail: null,
      triggerRun: triggerMock,
      refreshRuns: refreshMock,
    });

    renderDialog();
    fireEvent.click(screen.getByTestId('orchestrator-run-toggle'));
    fireEvent.change(screen.getByTestId('orchestrator-run-path-input'), {
      target: { value: 'jobs/process.forge' },
    });
    fireEvent.click(screen.getByTestId('orchestrator-run-submit'));

    await waitFor(() => expect(triggerMock).toHaveBeenCalledWith('jobs/process.forge'));
    const queued = await screen.findByTestId('orchestrator-run-queued');
    expect(queued.textContent).toContain('item-new');
    await waitFor(() => expect(refreshMock).toHaveBeenCalled());
  });

  test('schedule delete requires confirmation then calls the store (issue #876)', async () => {
    const deleteMock = vi.fn(async () => undefined);
    const refreshMock = vi.fn(async () => undefined);
    useOrchestratorStore.setState({ deleteSchedule: deleteMock, refreshSchedules: refreshMock });

    renderDialog();
    fireEvent.click(screen.getByRole('tab', { name: /Schedules/i }));
    fireEvent.click(screen.getByTestId('orchestrator-schedule-delete'));
    expect(deleteMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId('orchestrator-schedule-delete-confirm'));
    await waitFor(() => expect(deleteMock).toHaveBeenCalledWith('nightly'));
    await waitFor(() => expect(refreshMock).toHaveBeenCalled());
  });

  test('dead-letter requeue calls the store and refreshes (issue #877)', async () => {
    const requeueItemMock = vi.fn(async () => undefined);
    const requeueAllMock = vi.fn(async () => undefined);
    useOrchestratorStore.setState({
      queueItems: [
        {
          id: 'dl-1',
          queue_name: 'jobs',
          payload: { diagram_path: 'a.process' },
          reference: null,
          priority: 'Normal',
          status: 'DeadLetter',
          retry_count: 3,
          max_retries: 3,
          lock_expires_at: null,
          defer_until: null,
          error_message: 'boom',
          created_at: '2026-11-14T00:00:00Z',
          updated_at: '2026-11-14T00:00:00Z',
        },
      ],
      requeueItem: requeueItemMock,
      requeueAllDeadLetter: requeueAllMock,
    });

    renderDialog();
    fireEvent.click(screen.getByRole('tab', { name: /Queues/i }));
    expect(screen.getByTestId('orchestrator-queue-stats').textContent).toContain('Dead letter');

    fireEvent.click(screen.getByTestId('orchestrator-requeue-item-dl-1'));
    await waitFor(() => expect(requeueItemMock).toHaveBeenCalledWith('dl-1'));

    fireEvent.click(screen.getByTestId('orchestrator-requeue-all'));
    await waitFor(() => expect(requeueAllMock).toHaveBeenCalled());
  });

  test('auto-refresh polls the runs list on the selected interval (issue #879)', async () => {
    vi.useFakeTimers();
    try {
      const refreshMock = vi.fn(async () => undefined);
      useOrchestratorStore.setState({ refreshRuns: refreshMock });

      renderDialog();
      // Off by default — only the initial mount fetch within 15 s.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(15000);
      });
      expect(refreshMock).toHaveBeenCalledTimes(1);

      fireEvent.change(screen.getByLabelText('Auto-refresh'), {
        target: { value: '5' },
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(5000);
      });
      expect(refreshMock).toHaveBeenCalledTimes(2);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(5000);
      });
      expect(refreshMock).toHaveBeenCalledTimes(3);

      fireEvent.change(screen.getByLabelText('Auto-refresh'), {
        target: { value: 'off' },
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(30000);
      });
      expect(refreshMock).toHaveBeenCalledTimes(3);
    } finally {
      vi.useRealTimers();
    }
  });

  test('host metrics summary shows uptime and queue counts (issue #880)', () => {
    useOrchestratorStore.setState({
      metrics: {
        queue: 'jobs',
        queue_backend: 'sqlite',
        uptime_sec: 3725,
        stats: { New: 2, InProgress: 1, DeadLetter: 1 },
      },
    });
    renderDialog();
    fireEvent.click(screen.getByRole('tab', { name: /Connections/i }));
    const summary = screen.getByTestId('orchestrator-host-metrics');
    expect(summary.textContent).toContain('1h 2m');
    expect(summary.textContent).toContain('sqlite');
    expect(summary.textContent).toContain('Dead letter');
  });

  test('cron preview renders the weekday key', () => {
    renderDialog();
    fireEvent.click(screen.getByRole('tab', { name: /Schedules/i }));
    expect(screen.getByText(/Weekdays at 9:30/)).toBeTruthy();
  });

  test('connections tab shows token state', () => {
    renderDialog();
    fireEvent.click(screen.getByRole('tab', { name: /Connections/i }));
    expect(screen.getByTestId('orchestrator-connection-list').textContent).toContain('Token set');
  });

  test('no-connection state shows the add-connection form', () => {
    useOrchestratorStore.setState({ connections: [], activeConnectionId: null });
    renderDialog();
    expect(screen.getByTestId('orchestrator-connection-form')).toBeTruthy();
  });
});
