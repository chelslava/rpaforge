import { beforeEach, describe, expect, test, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

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
