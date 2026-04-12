import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';

import StatusBar from './StatusBar';

describe('StatusBar', () => {
  test('shows runtime capability summary from engine capabilities', () => {
    render(
      <StatusBar
        activeTab="designer"
        bridgeState="ready"
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
        executionState="idle"
        metadata={null}
        showConsole={false}
        onToggleConsole={vi.fn()}
      />
    );

    expect(screen.getByText('Bridge: ready')).toBeTruthy();
    expect(screen.getByText('Engine 0.1.0 | Debugger | 3 libraries')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Show Console' })).toBeTruthy();
  });

  test('hides console toggle outside designer tab', () => {
    const onToggleConsole = vi.fn();

    render(
      <StatusBar
        activeTab="debugger"
        bridgeState="ready"
        capabilities={null}
        executionState="paused"
        metadata={null}
        showConsole={true}
        onToggleConsole={onToggleConsole}
      />
    );

    expect(screen.queryByRole('button', { name: 'Hide Console' })).toBeNull();
    expect(screen.getByText('Capabilities unavailable')).toBeTruthy();
    fireEvent.click(screen.getByText('Capabilities unavailable'));
    expect(onToggleConsole).not.toHaveBeenCalled();
  });
});
