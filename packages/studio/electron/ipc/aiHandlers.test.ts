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
const assistantChatMock = vi.fn(async () => ({
  success: true,
  answer: 'Wrapped it in a retry scope.',
  edits: [],
  attempts: 1,
  tokenUsage: { prompt: 5, completion: 7, total: 12 },
}));
vi.mock('../ai/assistant', () => ({
  assistantChat: (...args: unknown[]) => assistantChatMock(...(args as [])),
}));
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
    assistantChatMock.mockResolvedValue({
      success: true,
      answer: 'Wrapped it in a retry scope.',
      edits: [],
      attempts: 1,
      tokenUsage: { prompt: 5, completion: 7, total: 12 },
    });
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

describe('aiHandlers assistant (issue #903)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    assistantChatMock.mockResolvedValue({
      success: true,
      answer: 'Wrapped it in a retry scope.',
      edits: [],
      attempts: 1,
      tokenUsage: { prompt: 5, completion: 7, total: 12 },
    });
    registerAiHandlers(ctx);
  });

  test('assistantChat result is annotated with the cost estimate (issue #903)', async () => {
    const request = {
      requestId: 'as-1',
      providerId: 'openai-compatible',
      history: [],
      userMessage: 'add retry to click-download',
      context: { diagramNodes: [{ id: 'click-download', label: 'Click', type: 'activity' }] },
    };
    const result = (await handler(IPC_CHANNELS.AI_ASSISTANT_CHAT)(
      makeEvent(),
      request,
    )) as { success: boolean; tokenUsage?: { costEstimate?: number; total?: number } };
    expect(result.success).toBe(true);
    expect(result.tokenUsage?.total).toBe(12);
    expect(result.tokenUsage?.costEstimate).toBe(0.0003);
  });

  test('assistant deltas are forwarded over AI_ASSISTANT_PROGRESS with requestId', async () => {
    const sent: Array<{ requestId?: string; delta?: string }> = [];
    const event = {
      sender: {
        isDestroyed: () => false,
        send: (channel: string, payload: { requestId?: string; delta?: string }) =>
          sent.push(payload),
      },
    };
    assistantChatMock.mockImplementation(
      async (
        _provider: unknown,
        _creds: unknown,
        _request: unknown,
        _signal: unknown,
        onDelta: (delta: string) => void,
      ) => {
        onDelta('chunk-1');
        return {
          success: true,
          answer: 'ok',
          edits: [],
          attempts: 1,
        };
      },
    );
    const request = {
      requestId: 'as-2',
      providerId: 'openai-compatible',
      history: [],
      userMessage: 'explain',
      context: { diagramNodes: [] },
    };
    await handler(IPC_CHANNELS.AI_ASSISTANT_CHAT)(event, request);
    expect(sent).toEqual([{ requestId: 'as-2', attempt: 1, delta: 'chunk-1' }]);
  });

  test('assistantChat blocks payloads without a registered-valid shape', async () => {
    const request = {
      requestId: 'as-3',
      providerId: 'openai-compatible',
      history: [],
      // userMessage missing → Ajv schema rejects
      context: { diagramNodes: [] },
    };
    await expect(
      handler(IPC_CHANNELS.AI_ASSISTANT_CHAT)(makeEvent(), request),
    ).rejects.toThrow(/Invalid IPC payload/);
  });

  test('cancelAssistant is a no-op for unknown request ids', async () => {
    // The abort registry is module-private; verify behavior: the cancel
    // handler for an id that never existed must not throw.
    let signal: AbortSignal | undefined;
    assistantChatMock.mockImplementation(
      async (_p: unknown, _c: unknown, _r: unknown, passedSignal: AbortSignal) => {
        signal = passedSignal;
        return { success: true, answer: 'ok', edits: [], attempts: 1 };
      },
    );
    const request = {
      requestId: 'as-4',
      providerId: 'openai-compatible',
      history: [],
      userMessage: 'x',
      context: { diagramNodes: [] },
    };
    await handler(IPC_CHANNELS.AI_ASSISTANT_CHAT)(makeEvent(), request);
    expect(signal?.aborted).toBe(false);
    await handler(IPC_CHANNELS.AI_CANCEL_ASSISTANT)(makeEvent(), 'as-4');
    // The controller for as-4 was deleted after completion; a cancel for an
    // unknown id must be a no-op that does not throw.
    await handler(IPC_CHANNELS.AI_CANCEL_ASSISTANT)(makeEvent(), 'unknown-id');
    expect(signal?.aborted).toBe(false);
  });

  test('security audit events carry the prompt registry identity (issue #904)', async () => {
    const { recordSecurityEvent } = await import('../audit/securityAudit');
    assistantChatMock.mockResolvedValue({
      success: true,
      answer: 'ok',
      edits: [],
      attempts: 1,
      prompt: { id: 'assistant.system', version: 1 },
    });
    const request = {
      requestId: 'as-6',
      providerId: 'openai-compatible',
      history: [],
      userMessage: 'explain',
      context: { diagramNodes: [] },
    };
    await handler(IPC_CHANNELS.AI_ASSISTANT_CHAT)(makeEvent(), request);
    const call = (recordSecurityEvent as ReturnType<typeof vi.fn>).mock.calls.find(
      ([eventType]) => eventType === 'ai_assistant',
    );
    expect(call?.[1]).toMatchObject({ promptId: 'assistant.system', promptVersion: 1 });
  });
});
