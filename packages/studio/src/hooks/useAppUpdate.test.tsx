import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, test, vi, beforeEach, afterEach } from 'vitest';

import { useAppUpdate } from './useAppUpdate';
import type { AppUpdateEventPayload } from '../types/ipc-contracts';

type Listener = (event: AppUpdateEventPayload) => void;

const checkForUpdates = vi.fn();
const installUpdate = vi.fn(async () => {});
const setChannel = vi.fn(async (channel: 'stable' | 'pre-release') => ({
  phase: 'idle' as const,
  currentVersion: '0.7.0',
  channel,
}));
const getState = vi.fn(async (): Promise<AppUpdateEventPayload> => ({
  phase: 'idle',
  currentVersion: '0.7.0',
  channel: 'stable',
}));

let listeners: Listener[] = [];
const onUpdateEvent = vi.fn((listener: Listener) => {
  listeners.push(listener);
  return () => {
    listeners = listeners.filter((l) => l !== listener);
  };
});

function setBridge(bridge: unknown): void {
  Object.defineProperty(window, 'rpaforge', {
    value: bridge ? { appUpdate: bridge } : undefined,
    writable: true,
    configurable: true,
  });
}

describe('useAppUpdate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listeners = [];
    setBridge({ checkForUpdates, installUpdate, setChannel, getState, onUpdateEvent });
  });

  afterEach(() => {
    setBridge(null);
  });

  test('subscribes once and fetches the initial snapshot', async () => {
    const { result, unmount } = renderHook(() => useAppUpdate());
    await waitFor(() => expect(result.current.snapshot.currentVersion).toBe('0.7.0'));
    expect(listeners).toHaveLength(1);
    expect(result.current.isSupported).toBe(true);
    unmount();
    expect(listeners).toHaveLength(0);
  });

  test('reports unsupported when the bridge is missing', () => {
    setBridge(null);
    const { result } = renderHook(() => useAppUpdate());
    expect(result.current.isSupported).toBe(false);
  });

  test('applies pushed events to the snapshot', async () => {
    const { result, unmount } = renderHook(() => useAppUpdate());
    await waitFor(() => expect(getState).toHaveBeenCalled());
    act(() => {
      listeners.forEach((listener) =>
        listener({
          phase: 'downloaded',
          currentVersion: '0.7.0',
          channel: 'stable',
          availableVersion: '0.8.0',
          progressPercent: 100,
        }),
      );
    });
    expect(result.current.snapshot.phase).toBe('downloaded');
    expect(result.current.snapshot.availableVersion).toBe('0.8.0');
    unmount();
  });

  test('checkForUpdates pushes the returned state', async () => {
    checkForUpdates.mockResolvedValue({
      phase: 'checking',
      currentVersion: '0.7.0',
      channel: 'stable',
    });
    const { result, unmount } = renderHook(() => useAppUpdate());
    await act(async () => {
      await result.current.checkForUpdates();
    });
    expect(result.current.snapshot.phase).toBe('checking');
    unmount();
  });

  test('setChannel forwards the selection', async () => {
    const { result, unmount } = renderHook(() => useAppUpdate());
    await act(async () => {
      await result.current.setChannel('pre-release');
    });
    expect(setChannel).toHaveBeenCalledWith('pre-release');
    unmount();
  });
});
