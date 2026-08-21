import { renderHook } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import { useKeyboardShortcuts } from './useKeyboardShortcuts';

describe('useKeyboardShortcuts', () => {
  test('triggers zoomToFit on Ctrl+0 and Shift+1', () => {
    const zoomToFit = vi.fn();
    renderHook(() => useKeyboardShortcuts({ zoomToFit }));

    document.dispatchEvent(new KeyboardEvent('keydown', { key: '0', ctrlKey: true }));
    expect(zoomToFit).toHaveBeenCalledTimes(1);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: '1', shiftKey: true }));
    expect(zoomToFit).toHaveBeenCalledTimes(2);
  });

  test('triggers centerView on Home and Ctrl+Shift+C', () => {
    const centerView = vi.fn();
    renderHook(() => useKeyboardShortcuts({ centerView }));

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home' }));
    expect(centerView).toHaveBeenCalledTimes(1);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'c', ctrlKey: true, shiftKey: true }));
    expect(centerView).toHaveBeenCalledTimes(2);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 's', ctrlKey: true, shiftKey: true }));
    expect(centerView).toHaveBeenCalledTimes(3);
  });
});
