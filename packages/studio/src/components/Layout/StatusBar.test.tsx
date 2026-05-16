import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';

import StatusBar from './StatusBar';

describe('StatusBar', () => {
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
});
