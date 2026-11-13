/**
 * Control Tower store (issue #858) — written against the actual serve API v2
 * contracts (issue #857), per ADR-007: no invented remote types.
 *
 * Every remote call goes through the main-process proxy
 * (`window.rpaforge.orchestrator.proxy`) so bearer tokens never enter the
 * renderer and CSP/CORS stay untouched. Serve endpoints: /healthz, /metrics,
 * /runs, /runs/{id}, /runs/{id}/logs, /runs/{id}/cancel, /schedules
 * (GET/PUT/DELETE), /trigger.
 */

import { create } from 'zustand';
import type {
  OrchestratorConnectionMeta,
  OrchestratorProxyResponse,
} from '../types/ipc-contracts';

export type ConnectionHealth =
  | 'unknown'
  | 'healthy'
  | 'unreachable'
  | 'auth-error'
  | 'unsupported';

export interface ServeRun {
  item_id: string;
  queue_name: string;
  run_id: string | null;
  diagram_path: string | null;
  status: string;
  exit_code: number | null;
  started_at: string | null;
  finished_at: string | null;
  audit_path: string | null;
  error: string | null;
  steps?: Array<Record<string, unknown>>;
}

export interface ServeSchedule {
  name: string;
  cron: string;
  diagram_path: string;
  variables?: Record<string, unknown>;
  reference?: string | null;
  priority: string;
  missed_run_policy: string;
  last_enqueued?: string | null;
}

export interface ServeMetrics {
  queue: string;
  queue_backend?: string;
  stats: Record<string, number>;
}

export interface LogTailResult {
  lines: string[];
  status: number;
}

/** Proxy error with the HTTP status surfaced for precise UI messaging. */
export class OrchestratorRequestError extends Error {
  constructor(
    message: string,
    public readonly status: number | null,
  ) {
    super(message);
    this.name = 'OrchestratorRequestError';
  }
}

type ProxyFn = (request: {
  connectionId: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  path: string;
  body?: unknown;
}) => Promise<OrchestratorProxyResponse>;

function getProxy(): ProxyFn | null {
  const api = (window as unknown as { rpaforge?: { orchestrator?: { proxy: ProxyFn } } })
    .rpaforge;
  return api?.orchestrator?.proxy ?? null;
}

async function proxyJson<T>(
  connectionId: string,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  path: string,
  body?: unknown,
): Promise<T> {
  let response: OrchestratorProxyResponse;
  try {
    // Bridge-missing check lives inside the try so every caller's catch
    // handles it — never an unhandled rejection from a `void`-ed action.
    const proxy = getProxy();
    if (!proxy) {
      throw new Error('Orchestrator bridge is unavailable');
    }
    response = await proxy({ connectionId, method, path, body });
  } catch (error) {
    // Proxy-level failure: missing bridge, unknown connection, timeout.
    throw new OrchestratorRequestError(
      error instanceof Error ? error.message : 'Proxy request failed',
      null,
    );
  }
  if (response.status >= 400) {
    const payload = response.body as { error?: string } | null;
    throw new OrchestratorRequestError(
      payload?.error ?? `Serve returned ${response.status}`,
      response.status,
    );
  }
  return response.body as T;
}

interface OrchestratorState {
  connections: OrchestratorConnectionMeta[];
  activeConnectionId: string | null;
  health: Record<string, ConnectionHealth>;
  healthMessage: Record<string, string>;
  runs: ServeRun[];
  runsFilter: string | null;
  runsLoading: boolean;
  runsError: string | null;
  runDetail: ServeRun | null;
  runDetailLoading: boolean;
  schedules: ServeSchedule[];
  schedulesLoading: boolean;
  schedulesSupported: boolean;
  schedulesError: string | null;
  metrics: ServeMetrics | null;
  metricsError: string | null;

  loadConnections: () => Promise<void>;
  addConnection: (input: { name: string; baseUrl: string; token?: string }) => Promise<void>;
  updateConnection: (input: {
    id: string;
    name: string;
    baseUrl: string;
    token?: string;
  }) => Promise<void>;
  deleteConnection: (id: string) => Promise<void>;
  setActiveConnection: (id: string | null) => void;
  checkHealth: (connectionId: string) => Promise<ConnectionHealth>;
  refreshRuns: (options?: { limit?: number; status?: string | null }) => Promise<void>;
  setRunsFilter: (status: string | null) => void;
  fetchRunDetail: (itemId: string) => Promise<void>;
  fetchLogs: (itemId: string, tail?: number) => Promise<LogTailResult>;
  cancelRun: (itemId: string) => Promise<'cancelled' | 'cancel_requested'>;
  triggerRun: (diagramPath: string) => Promise<{ item_id: string; queue: string }>;
  refreshSchedules: () => Promise<void>;
  upsertSchedule: (name: string, body: Partial<ServeSchedule> & { cron: string; diagram_path: string }) => Promise<void>;
  deleteSchedule: (name: string) => Promise<void>;
  refreshMetrics: () => Promise<void>;
}

export const useOrchestratorStore = create<OrchestratorState>((set, get) => ({
  connections: [],
  activeConnectionId: null,
  health: {},
  healthMessage: {},
  runs: [],
  runsFilter: null,
  runsLoading: false,
  runsError: null,
  runDetail: null,
  runDetailLoading: false,
  schedules: [],
  schedulesLoading: false,
  schedulesSupported: true,
  schedulesError: null,
  metrics: null,
  metricsError: null,

  loadConnections: async () => {
    const api = (window as unknown as {
      rpaforge?: { orchestrator?: { listConnections: () => Promise<{ connections: OrchestratorConnectionMeta[] }> } };
    }).rpaforge;
    if (!api?.orchestrator) return;
    const { connections } = await api.orchestrator.listConnections();
    set((state) => ({
      connections,
      activeConnectionId:
        state.activeConnectionId && connections.some((c) => c.id === state.activeConnectionId)
          ? state.activeConnectionId
          : (connections[0]?.id ?? null),
    }));
  },

  addConnection: async (input) => {
    const api = (window as unknown as {
      rpaforge?: {
        orchestrator?: {
          saveConnection: (
            request: { id?: string; name: string; baseUrl: string; token?: string },
          ) => Promise<{ connection: OrchestratorConnectionMeta }>;
        };
      };
    }).rpaforge;
    if (!api?.orchestrator) {
      throw new OrchestratorRequestError('Orchestrator bridge is unavailable', null);
    }
    const { connection } = await api.orchestrator.saveConnection(input);
    set((state) => ({
      connections: [...state.connections.filter((c) => c.id !== connection.id), connection],
      activeConnectionId: state.activeConnectionId ?? connection.id,
    }));
    void get().checkHealth(connection.id);
  },

  updateConnection: async (input) => {
    const api = (window as unknown as {
      rpaforge?: { orchestrator?: { saveConnection: (request: { id?: string; name: string; baseUrl: string; token?: string }) => Promise<{ connection: OrchestratorConnectionMeta }> } };
    }).rpaforge;
    if (!api?.orchestrator) {
      throw new OrchestratorRequestError('Orchestrator bridge is unavailable', null);
    }
    const { connection } = await api.orchestrator.saveConnection(input);
    set((state) => ({
      connections: state.connections.map((c) => (c.id === connection.id ? connection : c)),
    }));
    void get().checkHealth(connection.id);
  },

  deleteConnection: async (id) => {
    const api = (window as unknown as {
      rpaforge?: { orchestrator?: { deleteConnection: (request: { id: string }) => Promise<{ success: boolean }> } };
    }).rpaforge;
    if (!api?.orchestrator) return;
    await api.orchestrator.deleteConnection({ id });
    set((state) => {
      const connections = state.connections.filter((c) => c.id !== id);
      const health = { ...state.health };
      delete health[id];
      const healthMessage = { ...state.healthMessage };
      delete healthMessage[id];
      return {
        connections,
        health,
        healthMessage,
        activeConnectionId:
          state.activeConnectionId === id ? (connections[0]?.id ?? null) : state.activeConnectionId,
      };
    });
  },

  setActiveConnection: (id) => {
    set({ activeConnectionId: id, runs: [], runDetail: null, schedules: [], metrics: null });
  },

  checkHealth: async (connectionId) => {
    try {
      const payload = await proxyJson<{ status: string; queue_backend?: string }>(connectionId,
        'GET',
        '/healthz',
      );
      const health: ConnectionHealth =
        payload.status === 'ok' ? 'healthy' : 'unreachable';
      set((state) => ({
        health: { ...state.health, [connectionId]: health },
        healthMessage: { ...state.healthMessage, [connectionId]: '' },
      }));
      return health;
    } catch (error) {
      const status = error instanceof OrchestratorRequestError ? error.status : null;
      const health: ConnectionHealth = status === 401 || status === 403 ? 'auth-error' : 'unreachable';
      const message = error instanceof Error ? error.message : 'Health check failed';
      set((state) => ({
        health: { ...state.health, [connectionId]: health },
        healthMessage: { ...state.healthMessage, [connectionId]: message },
      }));
      return health;
    }
  },

  refreshRuns: async (options) => {
    const connectionId = get().activeConnectionId;
    if (!connectionId) return;
    const status = options?.status !== undefined ? options.status : get().runsFilter;
    const limit = options?.limit ?? 25;
    set({ runsLoading: true, runsError: null });
    try {
      const params = new URLSearchParams({ limit: String(limit) });
      if (status) {
        params.set('status', status);
      }
      const payload = await proxyJson<{ runs: ServeRun[] }>(connectionId,
        'GET',
        `/runs?${params.toString()}`,
      );
      set({ runs: payload.runs, runsLoading: false });
    } catch (error) {
      set({
        runsLoading: false,
        runsError: error instanceof Error ? error.message : 'Failed to load runs',
      });
    }
  },

  setRunsFilter: (status) => {
    set({ runsFilter: status });
    void get().refreshRuns({ status });
  },

  fetchRunDetail: async (itemId) => {
    const connectionId = get().activeConnectionId;
    if (!connectionId) return;
    set({ runDetailLoading: true });
    try {
      const detail = await proxyJson<ServeRun>(connectionId, 'GET', `/runs/${itemId}`);
      set({ runDetail: detail, runDetailLoading: false });
    } catch (error) {
      set({
        runDetailLoading: false,
        runsError: error instanceof Error ? error.message : 'Failed to load run detail',
      });
    }
  },

  fetchLogs: async (itemId, tail = 200) => {
    const connectionId = get().activeConnectionId;
    if (!connectionId) {
      return { lines: [], status: 0 };
    }
    try {
      const payload = await proxyJson<{ lines: string[] }>(connectionId,
        'GET',
        `/runs/${itemId}/logs?tail=${tail}`,
      );
      return { lines: payload.lines, status: 200 };
    } catch (error) {
      const status = error instanceof OrchestratorRequestError ? error.status : null;
      if (status === 404) {
        return { lines: [], status: 404 };
      }
      throw error;
    }
  },

  cancelRun: async (itemId) => {
    const connectionId = get().activeConnectionId;
    if (!connectionId) {
      throw new OrchestratorRequestError('No active daemon connection', null);
    }
    try {
      const payload = await proxyJson<{ status: string }>(connectionId,
        'POST',
        `/runs/${itemId}/cancel`,
        {},
      );
      return payload.status === 'cancel_requested' ? 'cancel_requested' : 'cancelled';
    } catch (error) {
      if (error instanceof OrchestratorRequestError && error.status === 409) {
        throw new OrchestratorRequestError('Run already finished', 409);
      }
      throw error;
    }
  },

  triggerRun: async (diagramPath) => {
    const trimmed = diagramPath.trim();
    if (!trimmed) {
      throw new OrchestratorRequestError('Diagram path is required', null);
    }
    const connectionId = get().activeConnectionId;
    if (!connectionId) {
      throw new OrchestratorRequestError('No active daemon connection', null);
    }
    const payload = await proxyJson<{ status: string; item_id: string; queue: string }>(
      connectionId,
      'POST',
      '/trigger',
      { diagram_path: trimmed },
    );
    return { item_id: payload.item_id, queue: payload.queue };
  },

  refreshSchedules: async () => {
    const connectionId = get().activeConnectionId;
    if (!connectionId) return;
    set({ schedulesLoading: true, schedulesError: null });
    try {
      const payload = await proxyJson<{ schedules: ServeSchedule[] }>(connectionId,
        'GET',
        '/schedules',
      );
      set({ schedules: payload.schedules, schedulesLoading: false, schedulesSupported: true });
    } catch (error) {
      const status = error instanceof OrchestratorRequestError ? error.status : null;
      set({
        schedulesLoading: false,
        schedulesSupported: status !== 501,
        schedulesError:
          error instanceof Error ? error.message : 'Failed to load schedules',
      });
    }
  },

  upsertSchedule: async (name, body) => {
    const connectionId = get().activeConnectionId;
    if (!connectionId) {
      throw new OrchestratorRequestError('No active daemon connection', null);
    }
    await proxyJson(connectionId, 'PUT', `/schedules/${encodeURIComponent(name)}`, body);
    await get().refreshSchedules();
  },

  deleteSchedule: async (name) => {
    const connectionId = get().activeConnectionId;
    if (!connectionId) {
      throw new OrchestratorRequestError('No active daemon connection', null);
    }
    await proxyJson(connectionId, 'DELETE', `/schedules/${encodeURIComponent(name)}`);
    await get().refreshSchedules();
  },

  refreshMetrics: async () => {
    const connectionId = get().activeConnectionId;
    if (!connectionId) return;
    try {
      const [metrics, healthz] = await Promise.all([
        proxyJson<ServeMetrics>(connectionId, 'GET', '/metrics'),
        proxyJson<{ queue_backend?: string }>(connectionId, 'GET', '/healthz'),
      ]);
      set({
        metrics: { ...metrics, queue_backend: healthz.queue_backend },
        metricsError: null,
      });
    } catch (error) {
      set({
        metricsError: error instanceof Error ? error.message : 'Failed to load metrics',
      });
    }
  },
}));
