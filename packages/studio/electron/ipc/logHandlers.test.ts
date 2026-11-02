// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from 'vitest';
import { ipcMain } from 'electron';

import { makeEvent } from './testUtils';

const pushLogBuffer = vi.fn();
const getLogBuffer = vi.fn(() => [{ level: 'info', scope: 'renderer', message: 'buffered' }]);
const writeLogToFile = vi.fn(async () => {});
const getStoredLogs = vi.fn(async () => [{ level: 'error', scope: 'renderer', message: 'stored' }]);
const exportAllLogs = vi.fn(async () => '[]');
const clearLogBuffer = vi.fn();
const clearStoredLogs = vi.fn(async () => {});

vi.mock('../logging', () => ({
  pushLogBuffer: (...args: unknown[]) => pushLogBuffer(...(args as [])),
  getLogBuffer: () => getLogBuffer(),
  writeLogToFile: (...args: unknown[]) => writeLogToFile(...(args as [])),
  getStoredLogs: (...args: unknown[]) => getStoredLogs(...(args as [])),
  exportAllLogs: () => exportAllLogs(),
  clearLogBuffer: () => clearLogBuffer(),
  clearStoredLogs: () => clearStoredLogs(),
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
import { registerLogHandlers } from './logHandlers';
import type { LogEntry } from '../../src/types/ipc-contracts';

const ENTRY: LogEntry = {
  level: 'info',
  scope: 'renderer',
  message: 'hello',
  timestamp: new Date().toISOString(),
} as LogEntry;

function handler(channel: string) {
  const call = (ipcMain.handle as ReturnType<typeof vi.fn>).mock.calls.find(
    ([name]) => name === channel,
  );
  const onCall = (ipcMain.on as ReturnType<typeof vi.fn>).mock.calls.find(
    ([name]) => name === channel,
  );
  return (call ?? onCall)?.[1] as (event: unknown, ...args: unknown[]) => Promise<unknown>;
}

describe('logHandlers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getLogBuffer.mockReturnValue([{ level: 'info', scope: 'renderer', message: 'buffered' }]);
    registerLogHandlers();
  });

  test('LOG_WRITE validates and persists the entry (ipcMain.on channel)', async () => {
    await handler(IPC_CHANNELS.LOG_WRITE)(makeEvent(), ENTRY);
    expect(pushLogBuffer).toHaveBeenCalledWith(ENTRY);
    expect(writeLogToFile).toHaveBeenCalledWith(ENTRY);
  });

  test('LOG_WRITE rejects payloads without a level (schema validation)', async () => {
    await expect(handler(IPC_CHANNELS.LOG_WRITE)(makeEvent(), { message: 'no level' })).rejects.toThrow();
    expect(pushLogBuffer).not.toHaveBeenCalled();
  });

  test('LOG_GET merges the ring buffer with the stored file', async () => {
    const result = await handler(IPC_CHANNELS.LOG_GET)(makeEvent(), { level: 'error' });
    expect(getStoredLogs).toHaveBeenCalledWith({ level: 'error' });
    expect(result).toHaveLength(2);
    expect((result as Array<{ message: string }>)[1].message).toBe('stored');
  });

  test('LOG_EXPORT returns the serialized log store', async () => {
    await expect(handler(IPC_CHANNELS.LOG_EXPORT)(makeEvent())).resolves.toBe('[]');
    expect(exportAllLogs).toHaveBeenCalled();
  });

  test('LOG_CLEAR empties the buffer and deletes the stored file', async () => {
    await handler(IPC_CHANNELS.LOG_CLEAR)(makeEvent());
    expect(clearLogBuffer).toHaveBeenCalled();
    expect(clearStoredLogs).toHaveBeenCalled();
  });
});
