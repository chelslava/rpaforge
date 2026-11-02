// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from 'vitest';
import { ipcMain } from 'electron';

import { makeEvent } from './testUtils';
import type { IpcContext } from './context';
import type { PythonBridge } from '../python-bridge';

vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn(), on: vi.fn() },
  dialog: {
    showMessageBox: vi.fn(),
    showOpenDialog: vi.fn(),
    showSaveDialog: vi.fn(),
    showErrorBox: vi.fn(),
  },
  app: {
    getPath: vi.fn(() => '/tmp-rpaforge-test-home'),
    isPackaged: false,
    getAppPath: vi.fn(() => '/tmp-rpaforge-test-app'),
    whenReady: vi.fn(() => Promise.resolve()),
  },
  screen: {
    getCursorScreenPoint: vi.fn(() => ({ x: 10, y: 20 })),
    getPrimaryDisplay: vi.fn(() => ({ workAreaSize: { width: 800, height: 600 } })),
  },
  shell: {
    openPath: vi.fn(async () => ''),
    showItemInFolder: vi.fn(),
    openExternal: vi.fn(),
  },
  globalShortcut: {
    register: vi.fn(() => true),
    unregisterAll: vi.fn(),
  },
  BrowserWindow: class {
    webContents = {
      setWindowOpenHandler: vi.fn(),
      on: vi.fn(),
      send: vi.fn(),
      executeJavaScript: vi.fn(async () => undefined),
      session: { webRequest: { onHeadersReceived: vi.fn() } },
    };
    loadFile = vi.fn(async () => undefined);
    loadURL = vi.fn(async () => undefined);
    setIgnoreMouseEvents = vi.fn();
    isDestroyed = () => false;
    close = vi.fn();
    on = vi.fn();
  },
}));

import { registerSpyHandlers } from './spyHandlers';
import { IPC_CHANNELS } from '../../src/types/ipc-contracts';

const ctx: IpcContext = {
  getMainWindow: () => null,
  getPythonBridge: () => null,
  restartBridge: async () => {},
};

function handler(channel: string) {
  const call = (ipcMain.handle as ReturnType<typeof vi.fn>).mock.calls.find(
    ([name]) => name === channel,
  );
  return call?.[1] as (event: unknown, ...args: unknown[]) => Promise<unknown>;
}

describe('spyHandlers', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    registerSpyHandlers(ctx);
    // Ensure spy mode is stopped before each case (SPY_STOP is idempotent).
    await handler(IPC_CHANNELS.SPY_STOP)(makeEvent());
  });

  test('SPY_START reports success (sync handler)', () => {
    expect(handler(IPC_CHANNELS.SPY_START)(makeEvent(), 'desktop')).toEqual({ success: true });
  });

  test('clickAtPosition is rejected while spy mode is inactive', async () => {
    const result = await handler(IPC_CHANNELS.SPY_CLICK_AT_POSITION)(makeEvent(), 5, 5);
    expect(result).toEqual({ success: false, error: 'Spy mode not active' });
  });

  test('clickAtPosition proxies capture and reports the element when active', async () => {
    await handler(IPC_CHANNELS.SPY_START)(makeEvent(), 'desktop');
    const bridge = {
      sendRequest: vi.fn(async () => ({ role: 'button', name: 'OK' })),
    } as unknown as PythonBridge;
    ctx.getPythonBridge = () => bridge;
    const result = await handler(IPC_CHANNELS.SPY_CLICK_AT_POSITION)(makeEvent(), 5, 5);
    expect(bridge.sendRequest).toHaveBeenCalledWith('captureDesktopElement', { x: 5, y: 5 });
    expect(result).toEqual({ success: true, element: { role: 'button', name: 'OK' } });
  });

  test('mouse position handler returns cursor coordinates', async () => {
    const result = await handler(IPC_CHANNELS.SPY_GET_MOUSE_POSITION)(makeEvent());
    expect(result).toEqual({ x: 10, y: 20 });
  });
});
