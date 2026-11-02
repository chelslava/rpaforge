// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from 'vitest';
import { ipcMain } from 'electron';

import { makeEvent } from './testUtils';

vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn(), on: vi.fn() },
  dialog: { showMessageBox: vi.fn(), showErrorBox: vi.fn() },
  app: { getPath: vi.fn(() => '/tmp'), isPackaged: false },
}));

import { registerAppUpdateHandlers } from './updateHandlers';
import { IPC_CHANNELS } from '../../src/types/ipc-contracts';
import type { AppUpdateManager } from '../appUpdate';

function managerStub(): AppUpdateManager {
  return {
    checkForUpdates: vi.fn(async () => ({
      phase: 'checking' as const,
      currentVersion: '0.7.0',
      channel: 'stable' as const,
    })),
    installUpdate: vi.fn(async () => {}),
    setChannel: vi.fn(async (channel: 'stable' | 'pre-release') => ({
      phase: 'idle' as const,
      currentVersion: '0.7.0',
      channel,
    })),
    getState: vi.fn(() => ({
      phase: 'idle' as const,
      currentVersion: '0.7.0',
      channel: 'stable' as const,
    })),
  } as unknown as AppUpdateManager;
}

function handler(channel: string) {
  const call = (ipcMain.handle as ReturnType<typeof vi.fn>).mock.calls.find(
    ([name]) => name === channel,
  );
  return call?.[1] as (event: unknown, ...args: unknown[]) => Promise<unknown>;
}

describe('appUpdateHandlers', () => {
  let manager: AppUpdateManager;

  beforeEach(() => {
    vi.clearAllMocks();
    manager = managerStub();
    registerAppUpdateHandlers(manager);
  });

  test('check delegates to the manager', async () => {
    await handler(IPC_CHANNELS.APP_UPDATE_CHECK)(makeEvent());
    expect(manager.checkForUpdates).toHaveBeenCalled();
  });

  test('install delegates without payload', async () => {
    await handler(IPC_CHANNELS.APP_UPDATE_INSTALL)(makeEvent());
    expect(manager.installUpdate).toHaveBeenCalled();
  });

  test('setChannel validates the channel enum (schema gate)', async () => {
    await expect(
      handler(IPC_CHANNELS.APP_UPDATE_SET_CHANNEL)(makeEvent(), { channel: 'nightly' }),
    ).rejects.toThrow();
    expect(manager.setChannel).not.toHaveBeenCalled();
    const state = await handler(IPC_CHANNELS.APP_UPDATE_SET_CHANNEL)(makeEvent(), { channel: 'pre-release' });
    expect(manager.setChannel).toHaveBeenCalledWith('pre-release');
    expect(state).toMatchObject({ phase: 'idle', channel: 'pre-release' });
  });

  test('getState returns the snapshot', async () => {
    const state = await handler(IPC_CHANNELS.APP_UPDATE_GET_STATE)(makeEvent());
    expect(state).toMatchObject({ phase: 'idle', currentVersion: '0.7.0' });
  });
});
