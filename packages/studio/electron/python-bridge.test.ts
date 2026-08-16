// @vitest-environment node

import { EventEmitter } from 'events';
import { PassThrough } from 'stream';
import { afterEach, beforeEach, describe, expect, jest, test, vi } from 'vitest';

import { PythonBridge, type PythonBridgeConfig } from './python-bridge';
import type { BridgeStateEvent } from '../src/types/events';

type RequestHandler = (
  request: { id: number | string; method: string; params?: Record<string, unknown> },
  process: FakeProcess
) => void;

type FakeProcess = EventEmitter & {
  stdin: PassThrough;
  stdout: PassThrough;
  stderr: PassThrough;
  kill: ReturnType<typeof vi.fn>;
};

function createFakeProcess(handler: RequestHandler): FakeProcess {
  const process = new EventEmitter() as FakeProcess;
  process.stdin = new PassThrough();
  process.stdout = new PassThrough();
  process.stderr = new PassThrough();
  process.kill = vi.fn(() => {
    process.emit('close', 0);
    return true;
  });

  let buffer = '';
  process.stdin.on('data', (chunk) => {
    buffer += chunk.toString();

    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    lines
      .map((line) => line.trim())
      .filter(Boolean)
      .forEach((line) => {
        handler(JSON.parse(line) as { id: number | string; method: string; params?: Record<string, unknown> }, process);
      });
  });

  return process;
}

function respond(process: FakeProcess, id: number | string, result: unknown): void {
  process.stdout.write(
    `${JSON.stringify({ jsonrpc: '2.0', id, result })}\n`,
    'utf8'
  );
}

function createBridgeConfig(overrides: Partial<PythonBridgeConfig> = {}): Partial<PythonBridgeConfig> {
  return {
    startupTimeoutMs: 120,
    heartbeatIntervalMs: 25,
    heartbeatFailureThreshold: 2,
    reconnectDelayMs: 10,
    requestTimeoutMs: 15,
    maxReconnectAttempts: 2,
    ...overrides,
  };
}

describe('electron PythonBridge lifecycle', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test('reaches ready state on successful startup', async () => {
    const process = createFakeProcess((request, fakeProcess) => {
      if (request.method === 'ping') {
        respond(fakeProcess, request.id, { pong: true });
      }
    });

    const bridge = new PythonBridge(
      createBridgeConfig(),
      vi.fn(() => process) as unknown as typeof import('child_process').spawn
    );
    const states: BridgeStateEvent[] = [];
    bridge.onEvent('bridgeState', (event) => {
      states.push(event as BridgeStateEvent);
    });

    await bridge.start();

    expect(bridge.state).toBe('ready');
    expect(bridge.getStatus()).toMatchObject({
      state: 'ready',
      isOperational: true,
      consecutiveHeartbeatFailures: 0,
    });
    expect(states.map((event) => event.state)).toEqual(['starting', 'ready']);
  });

  test('transitions to degraded and recovers when heartbeat resumes', async () => {
    let respondToPing = true;
    const process = createFakeProcess((request, fakeProcess) => {
      if (request.method === 'ping' && respondToPing) {
        respond(fakeProcess, request.id, { pong: true });
      }
    });

    const bridge = new PythonBridge(
      createBridgeConfig(),
      vi.fn(() => process) as unknown as typeof import('child_process').spawn
    );
    const states: BridgeStateEvent[] = [];
    bridge.onEvent('bridgeState', (event) => {
      states.push(event as BridgeStateEvent);
    });

    await bridge.start();

    respondToPing = false;
    await vi.advanceTimersByTimeAsync(50);

    expect(bridge.state).toBe('degraded');
    expect(bridge.getStatus()).toMatchObject({
      state: 'degraded',
      isOperational: true,
      consecutiveHeartbeatFailures: 1,
      reason: 'heartbeat',
    });

    respondToPing = true;
    await vi.advanceTimersByTimeAsync(50);

    expect(bridge.state).toBe('ready');
    expect(states.map((event) => event.state)).toContain('degraded');
    expect(states.at(-1)?.state).toBe('ready');
  });

  test('reconnects deterministically after process exit', async () => {
    const firstProcess = createFakeProcess((request, fakeProcess) => {
      if (request.method === 'ping') {
        respond(fakeProcess, request.id, { pong: true });
      }
    });
    const secondProcess = createFakeProcess((request, fakeProcess) => {
      if (request.method === 'ping') {
        respond(fakeProcess, request.id, { pong: true });
      }
    });

    const spawnMock = vi
      .fn()
      .mockReturnValueOnce(firstProcess)
      .mockReturnValueOnce(secondProcess);

    const bridge = new PythonBridge(
      createBridgeConfig(),
      spawnMock as unknown as typeof import('child_process').spawn
    );
    const states: BridgeStateEvent[] = [];
    bridge.onEvent('bridgeState', (event) => {
      states.push(event as BridgeStateEvent);
    });

    await bridge.start();

    firstProcess.emit('close', 1);
    await vi.advanceTimersByTimeAsync(40);

    expect(spawnMock).toHaveBeenCalledTimes(2);
    expect(bridge.state).toBe('ready');
    expect(states.map((event) => event.state)).toEqual([
      'starting',
      'ready',
      'reconnecting',
      'starting',
      'ready',
    ]);
  });

  test('surfaces fatal startup failure when ping never succeeds', async () => {
    const unresponsiveProcess = createFakeProcess(() => undefined);

    const bridge = new PythonBridge(
      createBridgeConfig({ startupTimeoutMs: 90 }),
      vi.fn(() => unresponsiveProcess) as unknown as typeof import('child_process').spawn
    );

    const startPromise = bridge.start();
    const assertion = expect(startPromise).rejects.toThrow(
      'Python engine failed to start within timeout'
    );
    await vi.advanceTimersByTimeAsync(200);

    await assertion;
    expect(bridge.getStatus()).toMatchObject({
      state: 'stopped',
      fatal: true,
      reason: 'startup',
    });
  });

  test('rejects pending requests when stopped', async () => {
    const process = createFakeProcess((request, fakeProcess) => {
      if (request.method === 'ping') {
        respond(fakeProcess, request.id, { pong: true });
      }
    });

    const bridge = new PythonBridge(
      createBridgeConfig(),
      vi.fn(() => process) as unknown as typeof import('child_process').spawn
    );

    await bridge.start();

    const pending = bridge.sendRequest('longRunning', {}, 1000);
    bridge.stop();

    await expect(pending).rejects.toThrow('Bridge stopped');
  });
});

describe('electron PythonBridge SIGTERM cascade', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test('stopInternal sends SIGTERM first, then schedules SIGKILL after 5s', async () => {
    const process = createFakeProcess((request, fakeProcess) => {
      if (request.method === 'ping') {
        respond(fakeProcess, request.id, { pong: true });
      }
    });
    process.kill = vi.fn(() => {});

    const bridge = new PythonBridge(
      createBridgeConfig(),
      vi.fn(() => process) as unknown as typeof import('child_process').spawn
    );

    await bridge.start();
    bridge.stop();

    expect(process.kill).toHaveBeenCalledWith('SIGTERM');
    expect(process.kill).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(4999);
    expect(process.kill).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1);
    expect(process.kill).toHaveBeenCalledWith('SIGKILL');
    expect(process.kill).toHaveBeenCalledTimes(2);
  });

  test('stopInternal sends SIGKILL after 5s if process does not exit', async () => {
    const process = createFakeProcess((request, fakeProcess) => {
      if (request.method === 'ping') {
        respond(fakeProcess, request.id, { pong: true });
      }
    });
    process.kill = vi.fn(() => {});

    const bridge = new PythonBridge(
      createBridgeConfig(),
      vi.fn(() => process) as unknown as typeof import('child_process').spawn
    );

    await bridge.start();
    bridge.stop();

    expect(process.kill).toHaveBeenCalledWith('SIGTERM');
    expect(process.kill).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(4999);
    expect(process.kill).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1);
    expect(process.kill).toHaveBeenCalledWith('SIGKILL');
    expect(process.kill).toHaveBeenCalledTimes(2);
  });

  test('forceReconnectFromHeartbeat sends SIGTERM first, then schedules SIGKILL after 2s', async () => {
    const process = createFakeProcess((request, fakeProcess) => {
      if (request.method === 'ping') {
        respond(fakeProcess, request.id, { pong: true });
      }
    });
    process.kill = vi.fn(() => {});

    const bridge = new PythonBridge(
      createBridgeConfig(),
      vi.fn(() => process) as unknown as typeof import('child_process').spawn
    );

    await bridge.start();

    vi.spyOn(bridge, 'forceReconnectFromHeartbeat' as any);
    (bridge as any).forceReconnectFromHeartbeat('heartbeat failed');

    expect(process.kill).toHaveBeenCalledWith('SIGTERM');
    expect(process.kill).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1999);
    expect(process.kill).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1);
    expect(process.kill).toHaveBeenCalledWith('SIGKILL');
    expect(process.kill).toHaveBeenCalledTimes(2);
  });

  test('rejects in-flight requests with BRIDGE_RESTARTED_FATAL on process crash', async () => {
    let fakeProcessRef: FakeProcess | null = null;
    const process = createFakeProcess((request, fakeProcess) => {
      fakeProcessRef = fakeProcess;
      if (request.method === 'ping') {
        respond(fakeProcess, request.id, { pong: true });
      }
      // do not respond to long_running_task to leave it in-flight
    });

    const bridge = new PythonBridge(
      createBridgeConfig(),
      vi.fn(() => process) as unknown as typeof import('child_process').spawn
    );

    await bridge.start();

    const inFlightPromise = bridge.sendRequest('long_running_task', { task: 'heavy' });

    // Simulate process crash
    process.emit('close', 1);

    await expect(inFlightPromise).rejects.toMatchObject({
      code: 'BRIDGE_RESTARTED_FATAL',
      message: expect.stringContaining('BRIDGE_RESTARTED_FATAL'),
    });
  });

  test('emits bridgeReconnected event upon successful recovery', async () => {
    let spawnCount = 0;
    const bridge = new PythonBridge(
      createBridgeConfig({ reconnectDelayMs: 10 }),
      vi.fn(() => {
        spawnCount++;
        return createFakeProcess((request, fakeProcess) => {
          if (request.method === 'ping') {
            respond(fakeProcess, request.id, { pong: true });
          }
        });
      }) as unknown as typeof import('child_process').spawn
    );

    const reconnectedEvents: any[] = [];
    bridge.onEvent('bridgeReconnected', (evt) => {
      reconnectedEvents.push(evt);
    });

    await bridge.start();
    expect(reconnectedEvents).toHaveLength(0);

    // Trigger process termination
    (bridge as any).process.emit('close', 1);
    expect(bridge.state).toBe('reconnecting');

    // Advance timer for reconnect delay
    await vi.advanceTimersByTimeAsync(50);

    expect(bridge.state).toBe('ready');
    expect(reconnectedEvents).toHaveLength(1);
    expect(reconnectedEvents[0].type).toBe('bridgeReconnected');
  });
});
