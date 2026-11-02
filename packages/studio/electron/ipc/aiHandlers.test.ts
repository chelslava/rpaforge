// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from 'vitest';
import { ipcMain } from 'electron';

import { makeEvent } from './testUtils';
import type { IpcContext } from './context';

const generateDiagramMock = vi.fn(async () => ({
  success: true,
  diagram: { nodes: [], edges: [] },
  attempts: 1,
  tokenUsage: { prompt: 10, completion: 20, total: 30 },
}));

vi.mock('../ai/providers', () => ({
  getProvider: vi.fn(() => ({ id: 'openai-compatible' })),
}));
vi.mock('../ai/generateDiagram', () => ({
  generateDiagram: (...args: unknown[]) => generateDiagramMock(...(args as [])),
}));
vi.mock('../ai/suggestions', () => ({ getActivitySuggestions: vi.fn() }));
vi.mock('../ai/keyStore', () => ({
  getProviderConfig: vi.fn(() => ({ apiKey: 'k', model: 'm', baseUrl: 'https://remote.test' })),
  setProviderConfig: vi.fn(),
  removeProviderConfig: vi.fn(),
  getProviderStatuses: vi.fn(async () => []),
}));
vi.mock('../ai/consentStore', () => ({
  hasAiConsent: vi.fn(() => true),
  grantAiConsent: vi.fn(),
}));
vi.mock('../ai/privacy', () => ({ isLocalEndpoint: vi.fn(() => false) }));
vi.mock('../ai/paramFill', () => ({ autoFillParams: vi.fn() }));
vi.mock('../ai/tokenCost', () => ({ estimateTokenCost: vi.fn(() => 0.0003) }));
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
import type { AiGenerateDiagramRequest } from '../../src/types/ai';
import { registerAiHandlers } from './aiHandlers';

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

const REQUEST: AiGenerateDiagramRequest = {
  requestId: 'req-1',
  providerId: 'openai-compatible',
  prompt: 'open a browser',
  activities: [],
  language: 'en',
};

describe('aiHandlers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    generateDiagramMock.mockResolvedValue({
      success: true,
      diagram: { nodes: [], edges: [] },
      attempts: 1,
      tokenUsage: { prompt: 10, completion: 20, total: 30 },
    });
    registerAiHandlers(ctx);
  });

  test('generateDiagram result is annotated with the cost estimate', async () => {
    const result = (await handler(IPC_CHANNELS.AI_GENERATE_DIAGRAM)(makeEvent(), REQUEST)) as {
      tokenUsage?: { costEstimate?: number; total?: number };
      success: boolean;
    };
    expect(result.success).toBe(true);
    expect(result.tokenUsage?.costEstimate).toBe(0.0003);
    expect(result.tokenUsage?.total).toBe(30);
  });

  test('provider deltas are forwarded over the AI_PROGRESS channel (issue #820)', async () => {
    const sent: unknown[] = [];
    const event = {
      sender: {
        isDestroyed: () => false,
        send: (channel: string, payload: unknown) => sent.push(payload),
      },
    };
    generateDiagramMock.mockImplementation(
      async (
        _provider: unknown,
        _creds: unknown,
        _request: unknown,
        _signal: unknown,
        _onProgress: unknown,
        onDelta: (delta: string, attempt: number) => void,
      ) => {
        onDelta('{"star', 1);
        onDelta('t}', 1);
        return {
          success: true,
          diagram: { nodes: [], edges: [] },
          attempts: 1,
          tokenUsage: { prompt: 1, completion: 2, total: 3 },
        };
      },
    );
    await handler(IPC_CHANNELS.AI_GENERATE_DIAGRAM)(event, REQUEST);
    expect(sent).toContainEqual({ kind: 'delta', attempt: 1, delta: '{"star' });
    expect(sent).toContainEqual({ kind: 'delta', attempt: 1, delta: 't}' });
  });

  test('cancel resolves cleanly for an in-flight requestId', async () => {
    generateDiagramMock.mockImplementation(
      () => new Promise(() => { /* never resolves: in-flight */ }),
    );
    void handler(IPC_CHANNELS.AI_GENERATE_DIAGRAM)(makeEvent(), REQUEST);
    await vi.waitFor(() => expect(generateDiagramMock).toHaveBeenCalled());
    await expect(
      handler(IPC_CHANNELS.AI_CANCEL_GENERATE)(makeEvent(), 'req-1'),
    ).resolves.toBeUndefined();
  });

  test('unconfigured provider short-circuits with an error result', async () => {
    const { getProviderConfig } = await import('../ai/keyStore');
    (getProviderConfig as ReturnType<typeof vi.fn>).mockReturnValueOnce(null);
    const result = (await handler(IPC_CHANNELS.AI_GENERATE_DIAGRAM)(makeEvent(), REQUEST)) as {
      success: boolean;
      errors: string[];
    };
    expect(result.success).toBe(false);
    expect(result.errors[0]).toMatch(/not configured/);
  });
});
