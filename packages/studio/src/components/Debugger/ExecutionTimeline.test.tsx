import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, test } from 'vitest';
import ExecutionTimeline from './ExecutionTimeline';
import { useDebuggerStore } from '../../stores/debuggerStore';
import { useExecutionHistoryStore } from '../../stores/executionHistoryStore';
import { useSelectionStore } from '../../stores/selectionStore';

describe('ExecutionTimeline', () => {
  beforeEach(() => {
    useExecutionHistoryStore.getState().clearHistory();
    useDebuggerStore.getState().reset();
    useSelectionStore.getState().clearSelection();
  });

  test('shows activity records and sends node/output snapshots to debugger state', () => {
    const executionId = useExecutionHistoryStore.getState().startExecution('Demo process');
    const recordId = useExecutionHistoryStore
      .getState()
      .recordActivityStart(executionId, 'Open Browser', 'Open Browser', 'node-1');

    act(() => {
      useExecutionHistoryStore.getState().recordActivityEnd(recordId, 'success', { url: 'https://example.test' });
    });

    render(<ExecutionTimeline />);

    expect(screen.getByText('Open Browser')).toBeTruthy();
    expect(screen.getByText('1 steps')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /Open Browser/ }));

    expect(useSelectionStore.getState().selectedNodeId).toBe('node-1');
    expect(useDebuggerStore.getState().variables).toEqual([
      { name: 'url', value: 'https://example.test', type: 'string' },
    ]);
  });
});
