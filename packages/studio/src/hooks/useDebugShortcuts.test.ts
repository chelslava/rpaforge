import { renderHook } from '@testing-library/react';
import { fireEvent } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';

import { useDebugShortcuts } from './useDebugShortcuts';

const handlers = () => ({
  onStepOver: vi.fn(),
  onStepInto: vi.fn(),
  onStepOut: vi.fn(),
  onContinue: vi.fn(),
});

const press = (key: string, shift = false) => {
  fireEvent.keyDown(window, { key, shiftKey: shift });
};

describe('useDebugShortcuts', () => {
  test('dispatches stepping and continue handlers while paused', () => {
    const h = handlers();
    renderHook(() => useDebugShortcuts(h, { isPaused: true, isStepLoading: false }));

    press('F10');
    expect(h.onStepOver).toHaveBeenCalledTimes(1);

    press('F11');
    expect(h.onStepInto).toHaveBeenCalledTimes(1);

    press('F11', true);
    expect(h.onStepOut).toHaveBeenCalledTimes(1);

    press('F5');
    expect(h.onContinue).toHaveBeenCalledTimes(1);
  });

  test('ignores all debugger keys while not paused', () => {
    const h = handlers();
    renderHook(() => useDebugShortcuts(h, { isPaused: false, isStepLoading: false }));

    press('F10');
    press('F11');
    press('F11', true);
    press('F5');

    expect(h.onStepOver).not.toHaveBeenCalled();
    expect(h.onStepInto).not.toHaveBeenCalled();
    expect(h.onStepOut).not.toHaveBeenCalled();
    expect(h.onContinue).not.toHaveBeenCalled();
  });

  test('ignores keys while a step request is in flight', () => {
    const h = handlers();
    const { rerender } = renderHook(
      ({ loading }) => useDebugShortcuts(h, { isPaused: true, isStepLoading: loading }),
      { initialProps: { loading: false } },
    );

    press('F10');
    expect(h.onStepOver).toHaveBeenCalledTimes(1);

    rerender({ loading: true });
    press('F10');
    press('F5');
    expect(h.onStepOver).toHaveBeenCalledTimes(1);
    expect(h.onContinue).not.toHaveBeenCalled();

    rerender({ loading: false });
    press('F5');
    expect(h.onContinue).toHaveBeenCalledTimes(1);
  });
});
