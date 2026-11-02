// @vitest-environment node

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { ipcMain } from 'electron';

import { makeEvent } from './testUtils';
import type { IpcContext } from './context';
import type { PythonBridge } from '../python-bridge';

const fetchRegistryMock = vi.fn(async () => ({
  libraries: [
    { pypi_package: 'rpaforge-sap', version: '1.0.0', sha256: 'deadbeef' },
  ],
}));
const getLibraryMock = vi.fn();

vi.mock('../libraries/registry', () => ({
  fetchRegistry: () => fetchRegistryMock(),
  getLibraryFromRegistry: (...args: unknown[]) =>
    getLibraryMock(...(args as [unknown, string])),
}));
vi.mock('../audit/securityAudit', () => ({ recordSecurityEvent: vi.fn() }));

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
import { registerLibrariesHandlers } from './librariesHandlers';

const ctx: IpcContext = {
  getMainWindow: () => null,
  getPythonBridge: () => null,
  restartBridge: async () => {},
};

function makeBridge(sendResult: { success: boolean; message?: string }): PythonBridge {
  return {
    isReady: () => true,
    sendRequest: vi.fn(async () => sendResult),
    restart: vi.fn(async () => {}),
  } as unknown as PythonBridge;
}

function handler(channel: string) {
  const call = (ipcMain.handle as ReturnType<typeof vi.fn>).mock.calls.find(
    ([name]) => name === channel,
  );
  return call?.[1] as (event: unknown, ...args: unknown[]) => Promise<unknown>;
}

describe('librariesHandlers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getLibraryMock.mockReturnValue(null);
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new Error('fetch should not be reached in these tests');
    }));
    registerLibrariesHandlers(ctx);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test('install delegates to the bridge when the package is not in the registry (no hash check)', async () => {
    const bridge = makeBridge({ success: true, message: 'ok' });
    ctx.getPythonBridge = () => bridge;
    const result = await handler(IPC_CHANNELS.LIBRARIES_INSTALL)(makeEvent(), 'rpaforge-unknown');
    expect(bridge.sendRequest).toHaveBeenCalledWith('installLibrary', {
      pypiPackage: 'rpaforge-unknown',
      sha256: undefined,
    });
    expect(result).toEqual({ success: true, message: 'ok' });
  });

  test('install fails when SHA-256 verification cannot complete', async () => {
    getLibraryMock.mockReturnValue({ pypi_package: 'rpaforge-sap', version: '1.0.0', sha256: 'deadbeef' });
    ctx.getPythonBridge = () => makeBridge({ success: true });
    await expect(
      handler(IPC_CHANNELS.LIBRARIES_INSTALL)(makeEvent(), 'rpaforge-sap'),
    ).rejects.toThrow(/Security check failed/);
  });

  test('install surfaces bridge failures', async () => {
    const bridge = makeBridge({ success: false, message: 'pip error' });
    ctx.getPythonBridge = () => bridge;
    const result = (await handler(IPC_CHANNELS.LIBRARIES_INSTALL)(makeEvent(), 'rpaforge-unknown')) as {
      success: boolean;
      message: string;
    };
    expect(result.success).toBe(false);
    expect(result.message).toBe('pip error');
  });

  test('uninitialized bridge blocks every operation', async () => {
    ctx.getPythonBridge = () => null;
    await expect(handler(IPC_CHANNELS.LIBRARIES_INSTALL)(makeEvent(), 'pkg')).rejects.toThrow(/not initialized/);
    await expect(handler(IPC_CHANNELS.LIBRARIES_REFRESH)(makeEvent())).rejects.toThrow(/not initialized/);
  });

  test('refresh delegates to the bridge and normalizes the message', async () => {
    ctx.getPythonBridge = () => makeBridge({ success: true });
    const result = await handler(IPC_CHANNELS.LIBRARIES_REFRESH)(makeEvent());
    expect(result).toEqual({ success: true, message: 'Libraries refreshed' });
  });

  test('registry fetch failure falls back to an empty registry', async () => {
    fetchRegistryMock.mockRejectedValue(new Error('network down'));
    const result = await handler(IPC_CHANNELS.LIBRARIES_GET_REGISTRY)(makeEvent());
    expect(result).toEqual({ libraries: [] });
  });
});
