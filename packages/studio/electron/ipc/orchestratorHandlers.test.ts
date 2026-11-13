// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from 'vitest';
import { ipcMain } from 'electron';

import { makeEvent } from './testUtils';

const netFetchMock = vi.fn(async () => new Response('{}', { status: 200 }));

vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn(), on: vi.fn() },
  app: { getPath: vi.fn(() => '/tmp-rpaforge-test-home') },
  net: {
    get fetch() {
      return (...args: unknown[]) => netFetchMock(...(args as []));
    },
  },
  safeStorage: {
    isEncryptionAvailable: vi.fn(() => true),
    encryptString: vi.fn((value: string) => Buffer.from(`enc:${value}`)),
    decryptString: vi.fn((buffer: Buffer) =>
      buffer.toString('utf-8').replace(/^enc:/, ''),
    ),
  },
}));

vi.mock('../orchestrator/connectionStore', () => {
  const connections: Array<{
    id: string;
    name: string;
    baseUrl: string;
    token: string;
  }> = [
    { id: 'conn-1', name: 'local', baseUrl: 'http://127.0.0.1:8765', token: 'secret' },
  ];
  return {
    listConnections: vi.fn(() =>
      connections.map(({ id, name, baseUrl, token }) => ({
        id,
        name,
        baseUrl,
        hasToken: token.length > 0,
      })),
    ),
    getTokenForProxy: vi.fn((id: string) => connections.find((c) => c.id === id)?.token ?? ''),
    saveConnection: vi.fn(),
    deleteConnection: vi.fn(),
  };
});

import { IPC_CHANNELS } from '../../src/types/ipc-contracts';
import {
  proxyServeRequest,
  registerOrchestratorHandlers,
  stopLogStream,
} from './orchestratorHandlers';

function handler(channel: string) {
  const call = (ipcMain.handle as ReturnType<typeof vi.fn>).mock.calls.find(
    ([name]) => name === channel,
  );
  return call?.[1] as (event: unknown, ...args: unknown[]) => Promise<unknown>;
}

describe('orchestratorHandlers', () => {
  beforeEach(() => {
    (ipcMain.handle as ReturnType<typeof vi.fn>).mockClear();
    netFetchMock.mockClear();
    registerOrchestratorHandlers();
  });

  test('registers connection and proxy channels', () => {
    const channels = (ipcMain.handle as ReturnType<typeof vi.fn>).mock.calls.map(
      ([name]) => name,
    );
    expect(channels).toContain(IPC_CHANNELS.ORCH_CONN_LIST);
    expect(channels).toContain(IPC_CHANNELS.ORCH_CONN_SAVE);
    expect(channels).toContain(IPC_CHANNELS.ORCH_CONN_DELETE);
    expect(channels).toContain(IPC_CHANNELS.ORCH_PROXY_REQUEST);
  });

  test('proxy attaches bearer token from the main-process store', async () => {
    await proxyServeRequest({ connectionId: 'conn-1', method: 'GET', path: '/runs' });
    const [, init] = netFetchMock.mock.calls[0] as unknown as [
      string,
      { headers: Record<string, string> },
    ];
    expect(init.headers.Authorization).toBe('Bearer secret');
    expect(netFetchMock.mock.calls[0][0]).toBe('http://127.0.0.1:8765/runs');
  });

  test('proxy without stored token sends no Authorization header', async () => {
    const { getTokenForProxy } = await import('../orchestrator/connectionStore');
    (getTokenForProxy as ReturnType<typeof vi.fn>).mockReturnValueOnce('');
    await proxyServeRequest({ connectionId: 'conn-1', method: 'GET', path: '/healthz' });
    const [, init] = netFetchMock.mock.calls[0] as unknown as [
      string,
      { headers: Record<string, string> },
    ];
    expect(init.headers.Authorization).toBeUndefined();
  });

  test('proxy rejects paths outside the serve surface', async () => {
    await expect(
      proxyServeRequest({ connectionId: 'conn-1', method: 'GET', path: '/admin/secrets' }),
    ).rejects.toThrow('Path not allowed');
    expect(netFetchMock).not.toHaveBeenCalled();
  });

  test('proxy rejects unknown connections without fetching', async () => {
    await expect(
      proxyServeRequest({ connectionId: 'missing', method: 'GET', path: '/runs' }),
    ).rejects.toThrow('Unknown daemon connection.');
    expect(netFetchMock).not.toHaveBeenCalled();
  });

  test('proxy returns parsed JSON with status', async () => {
    netFetchMock.mockResolvedValueOnce(
      new Response('{"runs": []}', {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    const result = await proxyServeRequest({
      connectionId: 'conn-1',
      method: 'GET',
      path: '/runs',
    });
    expect(result).toEqual({
      status: 200,
      body: { runs: [] },
      contentType: 'application/json',
    });
  });

  test('proxy forwards PUT bodies (schedule upsert)', async () => {
    netFetchMock.mockResolvedValueOnce(
      new Response('{"status": "upserted"}', {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    await proxyServeRequest({
      connectionId: 'conn-1',
      method: 'PUT',
      path: '/schedules/nightly',
      body: { cron: '0 2 * * *', diagram_path: 'n.process' },
    });
    const [url, init] = netFetchMock.mock.calls[0] as unknown as [
      string,
      { method: string; body: string; headers: Record<string, string> },
    ];
    expect(url).toBe('http://127.0.0.1:8765/schedules/nightly');
    expect(init.method).toBe('PUT');
    expect(JSON.parse(init.body)).toEqual({
      cron: '0 2 * * *',
      diagram_path: 'n.process',
    });
    expect(init.headers['Content-Type'] ?? init.headers['content-type']).toBeUndefined();
  });

  test('proxy forwards POST bodies (trigger run, issue #875)', async () => {
    netFetchMock.mockResolvedValueOnce(
      new Response('{"status": "queued", "item_id": "item-9", "queue": "jobs"}', {
        status: 202,
        headers: { 'content-type': 'application/json' },
      }),
    );
    const result = await proxyServeRequest({
      connectionId: 'conn-1',
      method: 'POST',
      path: '/trigger',
      body: { diagram_path: 'jobs/process.forge' },
    });
    const [url, init] = netFetchMock.mock.calls[0] as unknown as [
      string,
      { method: string; body: string },
    ];
    expect(url).toBe('http://127.0.0.1:8765/trigger');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ diagram_path: 'jobs/process.forge' });
    expect(result.status).toBe(202);
  });

  test('proxy allows /queues paths (dead-letter list, issue #877)', async () => {
    netFetchMock.mockResolvedValueOnce(
      new Response('{"queue": "jobs", "items": []}', {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    const result = await proxyServeRequest({
      connectionId: 'conn-1',
      method: 'GET',
      path: '/queues/jobs/items?status=DeadLetter',
    });
    expect(result.status).toBe(200);
    expect(netFetchMock.mock.calls[0][0]).toBe(
      'http://127.0.0.1:8765/queues/jobs/items?status=DeadLetter',
    );
  });

  test('log stream forwards complete NDJSON lines (issue #878)', async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('{"a":1}\n{"b'));
        controller.enqueue(new TextEncoder().encode(':2}\n'));
        controller.close();
      },
    });
    netFetchMock.mockResolvedValueOnce(
      new Response(stream, {
        status: 200,
        headers: { 'content-type': 'application/x-ndjson' },
      }),
    );
    const send = vi.fn();
    const event = {
      sender: { send, once: vi.fn(), isDestroyed: () => false },
    } as never;
    const startHandler = handler(IPC_CHANNELS.ORCH_LOG_STREAM_START);
    await startHandler(event, { connectionId: 'conn-1', itemId: 'item-1', tail: 200 });
    await vi.waitFor(() => expect(send).toHaveBeenCalled());
    const chunks = send.mock.calls.map(([, chunk]) => chunk);
    expect(chunks.some((c) => c.text === '{"a":1}')).toBe(true);
    expect(chunks.some((c) => c.text === '{"b:2}')).toBe(true);
    expect(chunks[chunks.length - 1].done).toBe(true);
    expect(netFetchMock.mock.calls[0][0]).toBe(
      'http://127.0.0.1:8765/runs/item-1/logs?follow=1&tail=200',
    );
  });

  test('stopLogStream aborts the running stream fetch (issue #878)', async () => {
    netFetchMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          setTimeout(
            () =>
              resolve(
                new Response(
                  new ReadableStream<Uint8Array>({
                    start(c) {
                      c.enqueue(new TextEncoder().encode('x\n'));
                    },
                  }),
                  { status: 200 },
                ),
              ),
            50,
          );
        }),
    );
    const send = vi.fn();
    const event = {
      sender: { send, once: vi.fn(), isDestroyed: () => false },
    } as never;
    const startHandler = handler(IPC_CHANNELS.ORCH_LOG_STREAM_START);
    await startHandler(event, { connectionId: 'conn-1', itemId: 'item-2', tail: 50 });
    // Wait for the fetch promise to hand us the init object with the signal.
    await vi.waitFor(() => {
      const [, init] = netFetchMock.mock.calls[0] as unknown as [
        string,
        { signal: AbortSignal },
      ];
      return init?.signal;
    });
    const [, init] = netFetchMock.mock.calls[0] as unknown as [
      string,
      { signal: AbortSignal },
    ];
    expect(init.signal.aborted).toBe(false);
    stopLogStream('item-2');
    expect(init.signal.aborted).toBe(true);
  });

  test('registered proxy handler validates payload schema', async () => {
    const proxyHandler = handler(IPC_CHANNELS.ORCH_PROXY_REQUEST);
    await expect(
      proxyHandler(makeEvent(), {
        connectionId: 'conn-1',
        method: 'GET',
        path: 'http://evil/unauthorized',
      }),
    ).rejects.toThrow();
  });

  test('registered proxy handler rejects disallowed paths at the schema boundary', async () => {
    const proxyHandler = handler(IPC_CHANNELS.ORCH_PROXY_REQUEST);
    await expect(
      proxyHandler(makeEvent(), {
        connectionId: 'conn-1',
        method: 'GET',
        path: '/etc/passwd',
      }),
    ).rejects.toThrow('Path not allowed');
  });
});
