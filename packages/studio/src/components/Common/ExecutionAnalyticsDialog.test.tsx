import { beforeEach, describe, expect, test } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import ExecutionAnalyticsDialog from './ExecutionAnalyticsDialog';
import { useExecutionHistoryStore } from '../../stores/executionHistoryStore';
import type {
  ActivityExecutionRecord,
  ExecutionHistoryEntry,
} from '../../stores/executionHistoryStore';

function entry(partial: Partial<ExecutionHistoryEntry>): ExecutionHistoryEntry {
  return {
    id: `run-${Math.random().toString(36).slice(2)}`,
    processName: 'Invoices',
    startTime: new Date(Date.now() - 3600_000),
    endTime: new Date(),
    status: 'completed',
    duration: 60000,
    activitiesExecuted: 2,
    ...partial,
  };
}

function activity(partial: Partial<ActivityExecutionRecord>): ActivityExecutionRecord {
  return {
    id: `act-${Math.random().toString(36).slice(2)}`,
    executionId: 'run-1',
    activityName: 'Click Element',
    nodeName: 'node-1',
    nodeId: 'node-1',
    startTime: new Date(Date.now() - 3600_000),
    endTime: new Date(),
    status: 'success',
    duration: 500,
    ...partial,
  };
}

describe('ExecutionAnalyticsDialog', () => {
  beforeEach(() => {
    const okRun = entry({ id: 'run-1', status: 'completed', duration: 10000 });
    const failedRun = entry({
      id: 'run-2',
      status: 'failed',
      duration: 20000,
      errorMessage: 'Timeout: element not found',
    });
    const records: ActivityExecutionRecord[] = [
      activity({ executionId: 'run-1', activityName: 'Click Element', duration: 120 }),
      activity({
        executionId: 'run-2',
        activityName: 'Click Element',
        status: 'failed',
        duration: 5000,
        error: 'element not found',
      }),
    ];
    useExecutionHistoryStore.setState({
      history: [okRun, failedRun],
      activityRecords: new Map([
        [okRun.id, [records[0]]],
        [failedRun.id, [records[1]]],
      ]),
    });
  });

  const renderDialog = () => render(<ExecutionAnalyticsDialog open onClose={() => undefined} />);

  test('renders KPI cards with computed values', () => {
    renderDialog();
    const kpis = screen.getByTestId('analytics-kpis').textContent ?? '';
    expect(kpis).toContain('2');
    expect(kpis).toContain('50.0%');
  });

  test('renders sparkline and aggregated tables', () => {
    renderDialog();
    expect(screen.getByTestId('analytics-sparkline')).toBeTruthy();
    expect(screen.getByTestId('analytics-top-failing').textContent).toContain('Click Element');
  });

  test('period selector refilters the report', () => {
    useExecutionHistoryStore.setState({
      history: [
        entry({ id: 'old', status: 'failed', duration: 1000, startTime: new Date('2020-01-01') }),
      ],
    });
    renderDialog();
    fireEvent.change(screen.getByLabelText(/Period/i), { target: { value: '7' } });
    expect(screen.getByTestId('analytics-empty')).toBeTruthy();
  });

  test('empty history renders a localized empty state instead of zeros', () => {
    useExecutionHistoryStore.setState({ history: [], activityRecords: new Map() });
    renderDialog();
    expect(screen.getByTestId('analytics-empty')).toBeTruthy();
    expect(screen.queryByTestId('analytics-kpis')).toBeNull();
  });
});
