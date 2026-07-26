import { act, renderHook } from '@testing-library/react';
import { beforeEach, afterEach, describe, expect, test, vi } from 'vitest';
import { useAppInitialization } from './useAppInitialization';
import { useUIStore } from '../stores/uiStore';

describe('useAppInitialization', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useUIStore.setState({ appReady: false });
    delete window.rpaforge;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test('uses real readiness and completes immediately without an Electron bridge', async () => {
    const { result } = renderHook(() => useAppInitialization());

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(result.current.isInitializing).toBe(false);
    expect(result.current.progress).toBe(100);
    expect(result.current.degraded).toBe(false);
    expect(useUIStore.getState().appReady).toBe(true);
  });

  test('enters degraded mode after a bounded bridge stall', async () => {
    Object.defineProperty(window, 'rpaforge', {
      configurable: true,
      value: {
        bridge: {
          isReady: vi.fn().mockResolvedValue(false),
          getState: vi.fn().mockResolvedValue('starting'),
        },
      },
    });

    const { result } = renderHook(() => useAppInitialization());

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(result.current.isInitializing).toBe(false);
    expect(result.current.degraded).toBe(true);
    expect(useUIStore.getState().appReady).toBe(true);
  });
});
