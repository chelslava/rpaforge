// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from 'vitest';
import { ipcMain, dialog } from 'electron';

import { makeEvent } from './testUtils';
import type { IpcContext } from './context';
import type { PythonBridge } from '../python-bridge';

vi.mock('../audit/securityAudit', () => ({
  recordSecurityEvent: vi.fn(),
  anonymize: vi.fn((value: string) => `anon:${value}`),
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

import { IPC_CHANNELS } from '../../src/types/ipc-contracts';
import { registerEngineHandlers } from './engineHandlers';

function makeBridge(): PythonBridge {
  return {
    isReady: () => true,
    sendRequest: vi.fn(async (method: string) => ({ method, ok: true })),
  } as unknown as PythonBridge;
}

function handler(channel: string) {
  const call = (ipcMain.handle as ReturnType<typeof vi.fn>).mock.calls.find(
    ([name]) => name === channel,
  );
  return call?.[1] as (event: unknown, ...args: unknown[]) => Promise<unknown>;
}

describe('engineHandlers', () => {
  const ctx: IpcContext = {
    getMainWindow: () => null,
    getPythonBridge: () => makeBridge(),
    restartBridge: async () => {},
  };
  let bridge: PythonBridge;

  beforeEach(() => {
    vi.clearAllMocks();
    bridge = makeBridge();
    ctx.getPythonBridge = () => bridge;
    registerEngineHandlers(ctx);
  });

  test('engine ping proxies through the bridge', async () => {
    const result = await handler(IPC_CHANNELS.ENGINE_PING)(makeEvent());
    expect(bridge.sendRequest).toHaveBeenCalledWith('ping', {});
    expect(result).toEqual({ method: 'ping', ok: true });
  });

  test('runProcess validates source strings before dispatch', async () => {
    await expect(handler(IPC_CHANNELS.ENGINE_RUN_PROCESS)(makeEvent(), 12345)).rejects.toThrow(/must be a string/);
  });

  test('setBreakpoint validates the file path', async () => {
    await expect(
      handler(IPC_CHANNELS.DEBUGGER_SET_BREAKPOINT)(makeEvent(), '/bad\x00file', 12),
    ).rejects.toThrow();
  });

  test('editor formatCode delegates with the validated code payload', async () => {
    await handler(IPC_CHANNELS.EDITOR_FORMAT_CODE)(makeEvent(), 'x = 1');
    expect(bridge.sendRequest).toHaveBeenCalledWith('formatCode', { code: 'x = 1' });
  });

  test('dialog showOpen throws when the main window is gone', async () => {
    ctx.getMainWindow = () => null;
    await expect(
      handler(IPC_CHANNELS.DIALOG_SHOW_OPEN)(makeEvent(), { title: 'Open' }),
    ).rejects.toThrow(/Main window is not available/);
  });

  test('dialog showOpen forwards options to electron', async () => {
    const win = { isDestroyed: () => false };
    ctx.getMainWindow = () => win as unknown as import('electron').BrowserWindow;
    (dialog.showOpenDialog as ReturnType<typeof vi.fn>).mockResolvedValue({
      canceled: false,
      filePaths: ['/proj/a.rf'],
    });
    const result = await handler(IPC_CHANNELS.DIALOG_SHOW_OPEN)(makeEvent(), { title: 'Open' });
    expect(dialog.showOpenDialog).toHaveBeenCalledWith(win, { title: 'Open' });
    expect(result).toEqual({ canceled: false, filePaths: ['/proj/a.rf'] });
  });
});
