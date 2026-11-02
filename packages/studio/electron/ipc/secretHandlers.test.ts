// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from 'vitest';
import { ipcMain } from 'electron';

import { makeEvent } from './testUtils';

const setSecret = vi.fn(async () => 'secret://ref-1');
const getSecret = vi.fn(() => 'value');
const deleteSecret = vi.fn(async () => {});
const getSecretStoreStatus = vi.fn(() => ({ available: true }));

vi.mock('../secret-variable-store', () => ({
  setSecret: (...args: unknown[]) => setSecret(...(args as [string, string])),
  getSecret: (...args: unknown[]) => getSecret(...(args as [string])),
  deleteSecret: (...args: unknown[]) => deleteSecret(...(args as [string])),
  getSecretStoreStatus: (...args: unknown[]) => getSecretStoreStatus(...(args as [])),
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

import { registerSecretHandlers } from './secretHandlers';

function handler(channel: string) {
  const call = (ipcMain.handle as ReturnType<typeof vi.fn>).mock.calls.find(
    ([name]) => name === channel,
  );
  return call?.[1] as (event: unknown, ...args: unknown[]) => Promise<unknown>;
}

describe('secretHandlers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    registerSecretHandlers();
  });

  test('set delegates to the secret store and returns the secretRef', async () => {
    const result = await handler('secret:set')(makeEvent(), { variableId: 'v1', value: 's3cret' });
    expect(setSecret).toHaveBeenCalledWith('v1', 's3cret');
    expect(result).toEqual({ secretRef: 'secret://ref-1' });
  });

  test('get returns the decrypted value for a secretRef', async () => {
    const result = await handler('secret:get')(makeEvent(), { secretRef: 'secret://ref-1' });
    expect(getSecret).toHaveBeenCalledWith('secret://ref-1');
    expect(result).toEqual({ value: 'value' });
  });

  test('delete forwards the secretRef and resolves void', async () => {
    await expect(handler('secret:delete')(makeEvent(), { secretRef: 'secret://ref-1' })).resolves.toBeUndefined();
    expect(deleteSecret).toHaveBeenCalledWith('secret://ref-1');
  });

  test('status reports the store availability', async () => {
    await expect(handler('secret:status')(makeEvent())).resolves.toEqual({ available: true });
  });
});
