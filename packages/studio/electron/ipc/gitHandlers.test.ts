// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from 'vitest';
import { ipcMain } from 'electron';

import { makeEvent } from './testUtils';
import type { IpcContext } from './context';

vi.mock('../git/gitService', () => ({
  GitService: class {
    async stage(): Promise<{ staged: number }> {
      return { staged: 1 };
    }
    async setRemoteUrl(): Promise<{ success: boolean }> {
      return { success: true };
    }
  },
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

import { registerGitHandlers } from './gitHandlers';
import { setProjectRoot } from '../ipc-validator';

const ctx: IpcContext = {
  getMainWindow: () => null,
  getPythonBridge: () => null,
  restartBridge: async () => {},
};

describe('gitHandlers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setProjectRoot(null);
    registerGitHandlers();
  });

  const handler = (channel: string) => {
    const call = (ipcMain.handle as ReturnType<typeof vi.fn>).mock.calls.find(
      ([name]) => name === channel,
    );
    return call?.[1] as (event: unknown, ...args: unknown[]) => Promise<unknown>;
  };

  test('rejects absolute paths in git stage (repository-relative enforcement)', async () => {
    setProjectRoot('/tmp-rpaforge-test-home');
    const stage = handler('git:stage');
    await expect(stage(makeEvent(), ['/abs/path/file.txt'])).rejects.toThrow(/repository-relative/);
  });

  test('rejects .. traversal inside repository-relative paths', async () => {
    setProjectRoot('/tmp-rpaforge-test-home');
    const stage = handler('git:stage');
    await expect(stage(makeEvent(), ['../escape.txt'])).rejects.toThrow(/traversal/);
  });

  test('delegates relative paths to GitService when the project root is set', async () => {
    setProjectRoot('/tmp-rpaforge-test-home');
    const stage = handler('git:stage');
    await expect(stage(makeEvent(), ['src/main.py'])).resolves.toEqual({ staged: 1 });
  });

  test('blocks git operations entirely when no project root is set', async () => {
    const isRepo = handler('git:isRepo');
    await expect(isRepo(makeEvent())).rejects.toThrow(/project root not set/);
  });

  test('rejects remote arguments starting with "-" (flag injection)', async () => {
    setProjectRoot('/tmp-rpaforge-test-home');
    const setRemoteUrl = handler('git:setRemoteUrl');
    await expect(setRemoteUrl(makeEvent(), '--upload-pack=evil')).rejects.toThrow(/must not start with "-"/);
  });
});
