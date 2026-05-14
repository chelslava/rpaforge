import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { usePageInspection } from './usePageInspection';

function setupBridge(sendImpl: (method: string, params: unknown) => Promise<unknown>) {
  Object.defineProperty(window, 'rpaforge', {
    value: { bridge: { send: vi.fn().mockImplementation(sendImpl) } },
    writable: true,
    configurable: true,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('usePageInspection', () => {
  it('web mode calls inspectPage with empty params', async () => {
    setupBridge(() => Promise.resolve({ elements: [] }));

    const { result } = renderHook(() => usePageInspection('web'));

    await act(async () => {
      await result.current.inspect();
    });

    expect(window.rpaforge!.bridge.send).toHaveBeenCalledWith('inspectPage', {});
  });

  it('desktop mode without windowId calls inspectDesktop with empty params', async () => {
    setupBridge(() => Promise.resolve({ elements: [] }));

    const { result } = renderHook(() => usePageInspection('desktop'));

    await act(async () => {
      await result.current.inspect();
    });

    expect(window.rpaforge!.bridge.send).toHaveBeenCalledWith('inspectDesktop', {});
  });

  it('desktop mode with windowId passes it to inspectDesktop', async () => {
    setupBridge(() => Promise.resolve({ elements: [] }));

    const { result } = renderHook(() => usePageInspection('desktop'));

    await act(async () => {
      await result.current.inspect(12345);
    });

    expect(window.rpaforge!.bridge.send).toHaveBeenCalledWith('inspectDesktop', { windowId: 12345 });
  });

  it('web mode ignores windowId and never sends it', async () => {
    setupBridge(() => Promise.resolve({ elements: [] }));

    const { result } = renderHook(() => usePageInspection('web'));

    await act(async () => {
      await result.current.inspect(99);
    });

    expect(window.rpaforge!.bridge.send).toHaveBeenCalledWith('inspectPage', {});
  });

  it('populates elements from bridge response', async () => {
    const elements = [{ tag: 'Button', id: null, classes: [], text: 'OK', rect: null }];
    setupBridge(() => Promise.resolve({ elements }));

    const { result } = renderHook(() => usePageInspection('web'));

    await act(async () => {
      await result.current.inspect();
    });

    expect(result.current.elements).toEqual(elements);
    expect(result.current.error).toBeNull();
  });

  it('strips Electron IPC prefix from error messages', async () => {
    setupBridge(() =>
      Promise.reject(
        new Error("Error invoking remote method 'bridge:send': Error: No window selected.")
      )
    );

    const { result } = renderHook(() => usePageInspection('desktop'));

    await act(async () => {
      await result.current.inspect();
    });

    expect(result.current.error).toBe('No window selected.');
  });
});
