import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';

import StatusBar from './StatusBar';
import { useHistoryStore } from '../../stores/historyStore';
import { useBlockStore } from '../../stores/blockStore';

describe('StatusBar', () => {
  beforeEach(() => {
    useHistoryStore.getState().clearHistory();
    useBlockStore.getState().setNodes([]);
    useBlockStore.getState().setEdges([]);
  });

  test('shows runtime capability summary from engine capabilities', () => {
    render(
      <StatusBar
        bridgeStatus={{
          timestamp: new Date().toISOString(),
          state: 'ready',
          isOperational: true,
          maxReconnectAttempts: 3,
          consecutiveHeartbeatFailures: 0,
        }}
        capabilities={{
          version: '0.1.0',
          features: {
            debugger: true,
            breakpoints: true,
            stepping: true,
            variableWatching: true,
          },
          libraries: ['BuiltIn', 'DesktopUI', 'WebUI'],
        }}
        isDebugging={false}
        executionState="idle"
        executionSpeed={1}
        metadata={null}
        showConsole={false}
        onToggleConsole={vi.fn()}
      />
    );

    expect(screen.getByText(/Bridge:/)).toBeTruthy();
    expect(screen.getByText(/Engine 0.1.0 \| Debugger \| 3 libraries/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Show Console' })).toBeTruthy();
  });

  test('shows Hide Console button when console is visible and calls toggle on click', () => {
    const onToggleConsole = vi.fn();

    render(
      <StatusBar
        bridgeStatus={{
          timestamp: new Date().toISOString(),
          state: 'ready',
          isOperational: true,
          maxReconnectAttempts: 3,
          consecutiveHeartbeatFailures: 0,
        }}
        capabilities={null}
        isDebugging={false}
        executionState="paused"
        executionSpeed={1}
        metadata={null}
        showConsole={true}
        onToggleConsole={onToggleConsole}
      />
    );

    const hideBtn = screen.getByRole('button', { name: 'Hide Console' });
    expect(hideBtn).toBeTruthy();
    fireEvent.click(hideBtn);
    expect(onToggleConsole).toHaveBeenCalledOnce();
  });

  test('shows undo and redo stack depth and performs clicked actions', () => {
    const node = { id: 'node-1', type: 'start', position: { x: 0, y: 0 }, data: {} };
    useBlockStore.getState().setNodes([node]);
    useHistoryStore.getState().pushHistory([node], []);
    useHistoryStore.getState().pushHistory([], []);
    useHistoryStore.getState().undo([node], []);

    render(
      <StatusBar
        bridgeStatus={null}
        capabilities={null}
        isDebugging={false}
        executionState="idle"
        executionSpeed={1}
        metadata={null}
        showConsole={false}
        onToggleConsole={vi.fn()}
      />
    );

    expect(screen.getByRole('button', { name: 'Undo (1)' })).not.toHaveProperty('disabled', true);
    expect(screen.getByRole('button', { name: 'Redo (1)' })).not.toHaveProperty('disabled', true);
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Undo (1)' }));
    });
    expect(screen.getByRole('button', { name: 'Undo (0)' })).toHaveProperty('disabled', true);
    expect(screen.getByRole('button', { name: 'Redo (2)' })).not.toHaveProperty('disabled', true);
  });
});
