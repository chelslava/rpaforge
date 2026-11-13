import { beforeEach, describe, expect, test, vi } from 'vitest';

import { useOrchestratorStore, OrchestratorRequestError } from './orchestratorStore';
import type { OrchestratorLogStreamChunk } from '../types/ipc-contracts';
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

let logStreamListener: ((chunk: OrchestratorLogStreamChunk) => void) | null = null;
const onLogStreamChunkMock = vi.fn((listener: (chunk: OrchestratorLogStreamChunk) => void) => {
  logStreamListener = listener;
  return () => {
    logStreamListener = null;
  };
});
const startLogStreamMock = vi.fn(async () => ({ started: true }));
const stopLogStreamMock = vi.fn(async () => ({ stopped: true }));

vi.stubGlobal('window', {
  rpaforge: {
    orchestrator: {
      proxy: (request: Parameters<typeof proxyMock>[0]) => proxyMock(request),
      listConnections: listConnectionsMock,
      saveConnection: saveConnectionMock,
      deleteConnection: deleteConnectionMock,
      onLogStreamChunk: onLogStreamChunkMock,
      startLogStream: startLogStreamMock,
      stopLogStream: stopLogStreamMock,
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
    queueItems: [],
    queueItemsLoading: false,
    queueItemsError: null,
  });
};

describe('orchestratorStore', () => {
  beforeEach(() => {
    proxyMock.mockReset();
    logStreamListener = null;
    onLogStreamChunkMock.mockClear();
    startLogStreamMock.mockClear();
    stopLogStreamMock.mockClear();
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

  test('triggerRun POSTs the diagram path to /trigger', async () => {
    useOrchestratorStore.setState({ activeConnectionId: 'conn-1' });
    proxyMock.mockResolvedValueOnce(
      jsonResponse({ status: 'queued', item_id: 'item-9', queue: 'jobs' }, 202),
    );
    const result = await useOrchestratorStore.getState().triggerRun('  jobs/process.forge  ');
    expect(result).toEqual({ item_id: 'item-9', queue: 'jobs' });
    expect(proxyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        connectionId: 'conn-1',
        method: 'POST',
        path: '/trigger',
        body: { diagram_path: 'jobs/process.forge' },
      }),
    );
  });

  test('triggerRun rejects an empty diagram path without calling the proxy', async () => {
    useOrchestratorStore.setState({ activeConnectionId: 'conn-1' });
    await expect(useOrchestratorStore.getState().triggerRun('   ')).rejects.toThrow(
      'Diagram path is required',
    );
    expect(proxyMock).not.toHaveBeenCalled();
  });

  test('triggerRun requires an active connection', async () => {
    await expect(useOrchestratorStore.getState().triggerRun('p.forge')).rejects.toThrow(
      'No active daemon connection',
    );
    expect(proxyMock).not.toHaveBeenCalled();
  });

  test('triggerRun surfaces serve validation errors', async () => {
    useOrchestratorStore.setState({ activeConnectionId: 'conn-1' });
    proxyMock.mockResolvedValueOnce(
      jsonResponse({ error: "'variables' must be an object" }, 400),
    );
    await expect(useOrchestratorStore.getState().triggerRun('p.forge')).rejects.toThrow(
      "'variables' must be an object",
    );
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

  test('deleteSchedule DELETEs the schedule and refreshes (issue #876)', async () => {
    useOrchestratorStore.setState({ activeConnectionId: 'conn-1' });
    proxyMock.mockResolvedValue(jsonResponse({ status: 'deleted', name: 'nightly' }));
    await useOrchestratorStore.getState().deleteSchedule('nightly');
    expect(proxyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        connectionId: 'conn-1',
        method: 'DELETE',
        path: '/schedules/nightly',
      }),
    );
    expect(proxyMock).toHaveBeenCalledWith(
      expect.objectContaining({ method: 'GET', path: '/schedules' }),
    );
  });

  test('deleteSchedule requires an active connection', async () => {
    await expect(useOrchestratorStore.getState().deleteSchedule('x')).rejects.toThrow(
      'No active daemon connection',
    );
    expect(proxyMock).not.toHaveBeenCalled();
  });

  test('fetchQueueItems lists dead-letter items for the metrics queue', async () => {
    useOrchestratorStore.setState({
      activeConnectionId: 'conn-1',
      metrics: { queue: 'jobs', stats: { DeadLetter: 1 } },
    });
    proxyMock.mockResolvedValueOnce(
      jsonResponse({ queue: 'jobs', items: [{ id: 'dl-1', status: 'DeadLetter' }] }),
    );
    await useOrchestratorStore.getState().fetchQueueItems();
    expect(proxyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        connectionId: 'conn-1',
        method: 'GET',
        path: '/queues/jobs/items?limit=25&status=DeadLetter',
      }),
    );
    expect(useOrchestratorStore.getState().queueItems[0].id).toBe('dl-1');
  });

  test('requeueItem POSTs the single requeue endpoint and refetches', async () => {
    useOrchestratorStore.setState({
      activeConnectionId: 'conn-1',
      metrics: { queue: 'jobs', stats: {} },
    });
    proxyMock.mockResolvedValue(jsonResponse({ status: 'requeued', requeued: 1 }));
    await useOrchestratorStore.getState().requeueItem('dl-1');
    expect(proxyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'POST',
        path: '/queues/jobs/items/dl-1/requeue',
      }),
    );
    expect(proxyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'GET',
        path: expect.stringContaining('/queues/jobs/items'),
      }),
    );
  });

  test('requeueAllDeadLetter POSTs the bulk requeue endpoint', async () => {
    useOrchestratorStore.setState({
      activeConnectionId: 'conn-1',
      metrics: { queue: 'jobs', stats: {} },
    });
    proxyMock.mockResolvedValue(jsonResponse({ status: 'requeued', requeued: 3 }));
    await useOrchestratorStore.getState().requeueAllDeadLetter();
    expect(proxyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'POST',
        path: '/queues/jobs/requeue',
      }),
    );
  });

  test('requeueItem requires an active connection and queue', async () => {
    await expect(useOrchestratorStore.getState().requeueItem('dl-1')).rejects.toThrow(
      'No active daemon connection',
    );
    expect(proxyMock).not.toHaveBeenCalled();
  });

  test('subscribeRunLogs wires the stream subscription and stop (issue #878)', async () => {
    useOrchestratorStore.setState({ activeConnectionId: 'conn-1' });
    const received: OrchestratorLogStreamChunk[] = [];
    const unsubscribe = useOrchestratorStore
      .getState()
      .subscribeRunLogs('item-1', (chunk) => received.push(chunk));
    expect(startLogStreamMock).toHaveBeenCalledWith({
      connectionId: 'conn-1',
      itemId: 'item-1',
      tail: 200,
    });
    logStreamListener?.({ itemId: 'item-1', text: 'line-1' });
    logStreamListener?.({ itemId: 'other', text: 'noise' });
    expect(received).toEqual([{ itemId: 'item-1', text: 'line-1' }]);
    unsubscribe();
    expect(stopLogStreamMock).toHaveBeenCalledWith('item-1');
  });

  test('subscribeRunLogs reports an error chunk when streaming is unavailable', async () => {
    const api = (window as unknown as { rpaforge: { orchestrator: Record<string, unknown> } })
      .rpaforge.orchestrator;
    const saved = api.onLogStreamChunk;
    api.onLogStreamChunk = undefined;
    const received: OrchestratorLogStreamChunk[] = [];
    const unsubscribe = useOrchestratorStore
      .getState()
      .subscribeRunLogs('item-1', (chunk) => received.push(chunk));
    expect(received).toEqual([{ itemId: 'item-1', error: 'log streaming is unavailable' }]);
    unsubscribe();
    api.onLogStreamChunk = saved;
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
