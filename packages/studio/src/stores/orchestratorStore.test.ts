import { beforeEach, describe, expect, test, vi } from 'vitest';

import { useOrchestratorStore, OrchestratorRequestError } from './orchestratorStore';
import type { OrchestratorProxyResponse } from '../types/ipc-contracts';

const proxyMock = vi.fn<
  (request: {
    connectionId: string;
    method: 'GET' | 'POST' | 'PUT';
    path: string;
    body?: unknown;
  }) => Promise<OrchestratorProxyResponse>
>();

const listConnectionsMock = vi.fn(async () => ({
  connections: [
    { id: 'conn-1', name: 'local', baseUrl: 'http://127.0.0.1:8765', hasToken: true },
  ],
}));

const saveConnectionMock = vi.fn(async (request: { name: string; baseUrl: string; token?: string; id?: string }) => ({
  connection: {
    id: request.id ?? 'conn-new',
    name: request.name,
    baseUrl: request.baseUrl,
    hasToken: Boolean(request.token),
  },
}));

const deleteConnectionMock = vi.fn(async () => ({ success: true }));

vi.stubGlobal('window', {
  rpaforge: {
    orchestrator: {
      proxy: (request: Parameters<typeof proxyMock>[0]) => proxyMock(request),
      listConnections: listConnectionsMock,
      saveConnection: saveConnectionMock,
      deleteConnection: deleteConnectionMock,
    },
  },
});

function jsonResponse(body: unknown, status = 200): OrchestratorProxyResponse {
  return { status, body, contentType: 'application/json' };
}

const resetStore = () => {
  useOrchestratorStore.setState({
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
  });
};

describe('orchestratorStore', () => {
  beforeEach(() => {
    proxyMock.mockReset();
    listConnectionsMock.mockClear();
    saveConnectionMock.mockClear();
    deleteConnectionMock.mockClear();
    resetStore();
  });

  test('loadConnections activates the first connection', async () => {
    await useOrchestratorStore.getState().loadConnections();
    const state = useOrchestratorStore.getState();
    expect(state.connections).toHaveLength(1);
    expect(state.activeConnectionId).toBe('conn-1');
  });

  test('checkHealth maps ok to healthy', async () => {
    proxyMock.mockResolvedValueOnce(
      jsonResponse({ status: 'ok', queue: 'jobs', queue_backend: 'sqlite' }),
    );
    const health = await useOrchestratorStore.getState().checkHealth('conn-1');
    expect(health).toBe('healthy');
    expect(useOrchestratorStore.getState().health['conn-1']).toBe('healthy');
  });

  test('checkHealth maps 401 to auth-error', async () => {
    proxyMock.mockResolvedValueOnce(
      jsonResponse({ error: 'invalid or missing auth token' }, 401),
    );
    const health = await useOrchestratorStore.getState().checkHealth('conn-1');
    expect(health).toBe('auth-error');
  });

  test('checkHealth maps proxy failure to unreachable with message', async () => {
    proxyMock.mockRejectedValueOnce(new Error('fetch failed'));
    const health = await useOrchestratorStore.getState().checkHealth('conn-1');
    expect(health).toBe('unreachable');
    expect(useOrchestratorStore.getState().healthMessage['conn-1']).toBe('fetch failed');
  });

  test('refreshRuns requests the runs endpoint with query params', async () => {
    useOrchestratorStore.setState({ activeConnectionId: 'conn-1' });
    proxyMock.mockResolvedValueOnce(
      jsonResponse({ runs: [{ item_id: 'a1', status: 'success', queue_name: 'jobs' }] }),
    );
    await useOrchestratorStore.getState().refreshRuns({ limit: 10, status: 'failed' });
    const call = proxyMock.mock.calls[0][0];
    expect(call.method).toBe('GET');
    expect(call.path).toBe('/runs?limit=10&status=failed');
    expect(useOrchestratorStore.getState().runs[0].item_id).toBe('a1');
  });

  test('refreshRuns surfaces serve errors', async () => {
    useOrchestratorStore.setState({ activeConnectionId: 'conn-1' });
    proxyMock.mockResolvedValueOnce(jsonResponse({ error: 'bad limit' }, 400));
    await useOrchestratorStore.getState().refreshRuns();
    expect(useOrchestratorStore.getState().runsError).toBe('bad limit');
  });

  test('fetchRunDetail stores steps from /runs/{id}', async () => {
    useOrchestratorStore.setState({ activeConnectionId: 'conn-1' });
    proxyMock.mockResolvedValueOnce(
      jsonResponse({
        item_id: 'a1',
        status: 'success',
        steps: [{ activity: 'Log', duration_ms: 12, status: 'success' }],
      }),
    );
    await useOrchestratorStore.getState().fetchRunDetail('a1');
    expect(useOrchestratorStore.getState().runDetail?.steps?.[0].activity).toBe('Log');
  });

  test('fetchLogs returns 404 marker when the log file is missing', async () => {
    useOrchestratorStore.setState({ activeConnectionId: 'conn-1' });
    proxyMock.mockResolvedValueOnce(jsonResponse({ error: 'no log file' }, 404));
    const result = await useOrchestratorStore.getState().fetchLogs('a1');
    expect(result).toEqual({ lines: [], status: 404 });
  });

  test('cancelRun distinguishes outright cancel and cooperative request', async () => {
    useOrchestratorStore.setState({ activeConnectionId: 'conn-1' });
    proxyMock.mockResolvedValueOnce(jsonResponse({ status: 'cancelled', item_id: 'a1' }));
    expect(await useOrchestratorStore.getState().cancelRun('a1')).toBe('cancelled');
    proxyMock.mockResolvedValueOnce(
      jsonResponse({ status: 'cancel_requested', item_id: 'a1' }, 202),
    );
    expect(await useOrchestratorStore.getState().cancelRun('a1')).toBe('cancel_requested');
  });

  test('cancelRun maps 409 to a finished-run error', async () => {
    useOrchestratorStore.setState({ activeConnectionId: 'conn-1' });
    proxyMock.mockResolvedValueOnce(jsonResponse({ error: 'already finished' }, 409));
    await expect(useOrchestratorStore.getState().cancelRun('a1')).rejects.toMatchObject({
      status: 409,
    });
  });

  test('refreshSchedules marks 501 as unsupported', async () => {
    useOrchestratorStore.setState({ activeConnectionId: 'conn-1' });
    proxyMock.mockResolvedValueOnce(
      jsonResponse({ error: 'schedules endpoints require --schedules' }, 501),
    );
    await useOrchestratorStore.getState().refreshSchedules();
    const state = useOrchestratorStore.getState();
    expect(state.schedulesSupported).toBe(false);
    expect(state.schedules).toEqual([]);
  });

  test('upsertSchedule PUTs the body and refreshes the list', async () => {
    useOrchestratorStore.setState({ activeConnectionId: 'conn-1' });
    proxyMock.mockResolvedValueOnce(
      jsonResponse({ status: 'upserted', schedule: { name: 'nightly' } }),
    );
    proxyMock.mockResolvedValueOnce(
      jsonResponse({ schedules: [{ name: 'nightly', cron: '0 2 * * *', diagram_path: 'n.process', priority: 'Normal', missed_run_policy: 'skip' }] }),
    );
    await useOrchestratorStore.getState().upsertSchedule('nightly', {
      cron: '0 2 * * *',
      diagram_path: 'n.process',
    });
    expect(proxyMock.mock.calls[0][0].method).toBe('PUT');
    expect(proxyMock.mock.calls[0][0].path).toBe('/schedules/nightly');
    expect(useOrchestratorStore.getState().schedules[0].name).toBe('nightly');
  });

  test('refreshMetrics merges /metrics and /healthz backend name', async () => {
    useOrchestratorStore.setState({ activeConnectionId: 'conn-1' });
    proxyMock.mockResolvedValueOnce(jsonResponse({ queue: 'jobs', stats: { New: 2 } }));
    proxyMock.mockResolvedValueOnce(jsonResponse({ status: 'ok', queue_backend: 'postgres' }));
    await useOrchestratorStore.getState().refreshMetrics();
    expect(useOrchestratorStore.getState().metrics).toEqual({
      queue: 'jobs',
      stats: { New: 2 },
      queue_backend: 'postgres',
    });
  });

  test('addConnection saves via IPC and selects it when none active', async () => {
    await useOrchestratorStore.getState().addConnection({
      name: 'remote',
      baseUrl: 'http://10.0.0.5:8765',
      token: 'tok',
    });
    expect(saveConnectionMock).toHaveBeenCalled();
    expect(useOrchestratorStore.getState().activeConnectionId).toBe('conn-new');
  });

  test('deleteConnection clears health state and active selection', async () => {
    await useOrchestratorStore.getState().loadConnections();
    await useOrchestratorStore.getState().deleteConnection('conn-1');
    const state = useOrchestratorStore.getState();
    expect(state.connections).toHaveLength(0);
    expect(state.activeConnectionId).toBeNull();
  });

  test('OrchestratorRequestError carries the HTTP status', () => {
    const error = new OrchestratorRequestError('nope', 409);
    expect(error.status).toBe(409);
    expect(error.name).toBe('OrchestratorRequestError');
  });
});
