/**
 * Control Tower IPC handlers (issue #858).
 *
 * The renderer never talks to `rpaforge-runner serve` directly: requests go
 * through this proxy so the bearer token stays in the main process, CSP
 * `connect-src` stays untouched, and CORS does not apply (Electron `net.fetch`
 * runs in main). Every endpoint maps 1:1 to a serve v2 contract — the panel
 * invents nothing (ADR-007).
 */

import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../../src/types/ipc-contracts';
import type {
  OrchestratorLogStreamChunk,
  OrchestratorProxyRequest,
  OrchestratorProxyResponse,
} from '../../src/types/ipc-contracts';
import { validateIPCPayload } from '../ipc-validator';
import {
  deleteConnection,
  getTokenForProxy,
  listConnections,
  saveConnection,
} from '../orchestrator/connectionStore';

/** Serve control-plane is a local/lan service; bounded request timeout. */
const PROXY_TIMEOUT_MS = 15_000;

/** Paths the proxy is allowed to fetch (serve v2 surface, issue #857 + #875/#877). */
const ALLOWED_PATH_PREFIXES = [
  '/healthz',
  '/metrics',
  '/runs',
  '/schedules',
  '/trigger',
  '/queues',
] as const;

function isAllowedPath(path: string): boolean {
  const bare = path.split('?')[0];
  return ALLOWED_PATH_PREFIXES.some(
    (prefix) => bare === prefix || bare.startsWith(`${prefix}/`)
  );
}

export async function proxyServeRequest(
  request: OrchestratorProxyRequest
): Promise<OrchestratorProxyResponse> {
  if (!isAllowedPath(request.path)) {
    throw new Error(`Path not allowed on the serve proxy: ${request.path}`);
  }

  const { net } = await import('electron');
  const token = getTokenForProxy(request.connectionId);
  const connection = listConnections().find((c) => c.id === request.connectionId);
  if (!connection) {
    throw new Error('Unknown daemon connection.');
  }

  const url = `${connection.baseUrl}${request.path}`;
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await net.fetch(url, {
    method: request.method,
    headers,
    body:
      request.body !== undefined && request.method !== 'GET'
        ? JSON.stringify(request.body)
        : undefined,
    signal: AbortSignal.timeout(PROXY_TIMEOUT_MS),
  });

  const contentType = response.headers.get('content-type') ?? '';
  const raw = await response.text();
  let body: unknown = raw;
  if (contentType.includes('application/json')) {
    try {
      body = JSON.parse(raw);
    } catch {
      body = raw;
    }
  }
  return { status: response.status, body, contentType };
}

/**
 * Live run-log streams (issue #878). One stream per run item: the main
 * process consumes the serve `follow=1` NDJSON response and pushes complete
 * text chunks to the renderer. The token and the socket stay in main.
 */
const activeLogStreams = new Map<
  string,
  { controller: AbortController; sender: Electron.WebContents }
>();

function pushChunk(sender: Electron.WebContents, chunk: OrchestratorLogStreamChunk): void {
  if (!sender.isDestroyed()) {
    sender.send(IPC_CHANNELS.ORCH_LOG_STREAM_CHUNK, chunk);
  }
}

export function stopLogStream(itemId: string): void {
  const active = activeLogStreams.get(itemId);
  if (active) {
    active.controller.abort();
    activeLogStreams.delete(itemId);
  }
}

export async function startLogStream(
  sender: Electron.WebContents,
  request: { connectionId: string; itemId: string; tail: number }
): Promise<{ started: boolean }> {
  // Allow-list by construction: the path is built here from validated
  // pieces, never taken from the renderer.
  const itemId = request.itemId;
  const tail = Math.floor(request.tail);
  const { net } = await import('electron');
  const token = getTokenForProxy(request.connectionId);
  const connection = listConnections().find((c) => c.id === request.connectionId);
  if (!connection) {
    throw new Error('Unknown daemon connection.');
  }

  stopLogStream(itemId);
  const controller = new AbortController();
  activeLogStreams.set(itemId, { controller, sender });
  sender.once('destroyed', () => stopLogStream(itemId));

  void (async () => {
    try {
      const response = await net.fetch(
        `${connection.baseUrl}/runs/${encodeURIComponent(itemId)}/logs?follow=1&tail=${tail}`,
        {
          method: 'GET',
          headers: {
            Accept: 'application/x-ndjson',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          signal: controller.signal,
        },
      );
      if (!response.ok || !response.body) {
        pushChunk(sender, {
          itemId,
          error: `log stream failed with status ${response.status}`,
        });
        return;
      }
      const decoder = new TextDecoder();
      let buffer = '';
      for await (const raw of response.body) {
        if (controller.signal.aborted) return;
        buffer += decoder.decode(raw as Uint8Array, { stream: true });
        const parts = buffer.split('\n');
        buffer = parts.pop() ?? '';
        const text = parts.join('\n');
        if (text) {
          pushChunk(sender, { itemId, text });
        }
      }
      const tailText = (buffer + decoder.decode()).replace(/\n$/, '');
      if (tailText && !controller.signal.aborted) {
        pushChunk(sender, { itemId, text: tailText });
      }
      if (!controller.signal.aborted) {
        pushChunk(sender, { itemId, done: true });
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        pushChunk(sender, {
          itemId,
          error: error instanceof Error ? error.message : 'log stream failed',
        });
      }
    } finally {
      activeLogStreams.delete(itemId);
    }
  })();

  return { started: true };
}

export function registerOrchestratorHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.ORCH_CONN_LIST, (event) => {
    validateIPCPayload(event, 'orchestrator:connList', {});
    return { connections: listConnections() };
  });

  ipcMain.handle(
    IPC_CHANNELS.ORCH_CONN_SAVE,
    (event, request: { id?: string; name: string; baseUrl: string; token?: string }) => {
      validateIPCPayload(event, 'orchestrator:connSave', request);
      return {
        connection: saveConnection({
          id: request.id,
          name: request.name,
          baseUrl: request.baseUrl,
          token: request.token,
        }),
      };
    }
  );

  ipcMain.handle(IPC_CHANNELS.ORCH_CONN_DELETE, (event, request: { id: string }) => {
    validateIPCPayload(event, 'orchestrator:connDelete', request);
    return { success: deleteConnection(request.id) };
  });

  ipcMain.handle(
    IPC_CHANNELS.ORCH_PROXY_REQUEST,
    async (event, request: OrchestratorProxyRequest) => {
      validateIPCPayload(event, 'orchestrator:proxy', request);
      return proxyServeRequest(request);
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.ORCH_LOG_STREAM_START,
    async (
      event,
      request: { connectionId: string; itemId: string; tail: number }
    ) => {
      validateIPCPayload(event, 'orchestrator:logStreamStart', request);
      return startLogStream(event.sender, request);
    }
  );

  ipcMain.handle(IPC_CHANNELS.ORCH_LOG_STREAM_STOP, (event, request: { itemId: string }) => {
    validateIPCPayload(event, 'orchestrator:logStreamStop', request);
    stopLogStream(request.itemId);
    return { stopped: true };
  });
}
