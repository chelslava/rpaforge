// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from 'vitest';
import { ipcMain } from 'electron';

import { makeEvent } from './testUtils';
import type { IpcContext } from './context';
import type { PythonBridge } from '../python-bridge';

vi.mock('../bridgeLauncher', () => ({
  getDefaultBridgeStatus: () => ({ state: 'stopped', isOperational: false }),
}));
vi.mock('../audit/securityAudit', () => ({
  recordSecurityEvent: vi.fn(),
}));

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

import { registerBridgeHandlers } from './bridgeHandlers';
import { IPC_CHANNELS } from '../../src/types/ipc-contracts';

function makeBridge(overrides: Partial<PythonBridge> = {}): PythonBridge {
  return {
    isReady: () => true,
    isOperational: () => true,
    state: 'running',
    getStatus: () => ({ state: 'running', isOperational: true }),
    sendRequest: vi.fn(async () => ({ ok: true })),
  } as unknown as PythonBridge;
}

function handler(channel: string) {
  const call = (ipcMain.handle as ReturnType<typeof vi.fn>).mock.calls.find(
    ([name]) => name === channel,
  );
  return call?.[1] as (event: unknown, ...args: unknown[]) => Promise<unknown>;
}

describe('bridgeHandlers', () => {
  let ctx: IpcContext;
  let restartBridge: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    restartBridge = vi.fn(async () => {});
    ctx = {
      getMainWindow: () => null,
      getPythonBridge: () => makeBridge(),
      restartBridge,
    };
    registerBridgeHandlers(ctx);
  });

  test('isReady delegates to the bridge', async () => {
    await expect(handler(IPC_CHANNELS.BRIDGE_IS_READY)(makeEvent())).resolves.toBe(true);
  });

  test('isReady is false when no bridge exists', async () => {
    ctx.getPythonBridge = () => null;
    await expect(handler(IPC_CHANNELS.BRIDGE_IS_READY)(makeEvent())).resolves.toBe(false);
  });

  test('send forwards validated requests to the bridge', async () => {
    const bridge = makeBridge();
    ctx.getPythonBridge = () => bridge;
    const result = await handler(IPC_CHANNELS.BRIDGE_SEND)(makeEvent(), 'getActivities', {});
    expect(bridge.sendRequest).toHaveBeenCalledWith('getActivities', {});
    expect(result).toEqual({ ok: true });
  });

  test('send rejects method names with invalid characters', async () => {
    await expect(handler(IPC_CHANNELS.BRIDGE_SEND)(makeEvent(), 'bad method;', {})).rejects.toThrow();
  });

  test('send rejects when the bridge is not operational', async () => {
    const bridge = makeBridge();
    (bridge.isOperational as () => boolean) = () => false;
    ctx.getPythonBridge = () => bridge;
    await expect(handler(IPC_CHANNELS.BRIDGE_SEND)(makeEvent(), 'ping', {})).rejects.toThrow(/not operational/);
  });

  test('restart records the security event and delegates to restartBridge', async () => {
    await handler(IPC_CHANNELS.BRIDGE_RESTART)(makeEvent());
    expect(restartBridge).toHaveBeenCalled();
  });
});
