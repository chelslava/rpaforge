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
}
