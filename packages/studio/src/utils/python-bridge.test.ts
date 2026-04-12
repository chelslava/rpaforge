import { beforeEach, describe, expect, test, vi } from 'vitest';

import { PythonBridge } from './python-bridge';
import type { BridgeEvent, BridgeStatus } from '../types/events';

function createStatus(overrides: Partial<BridgeStatus> = {}): BridgeStatus {
  return {
    timestamp: '2026-04-12T00:00:00.000Z',
    state: 'stopped',
    isOperational: false,
    maxReconnectAttempts: 3,
    consecutiveHeartbeatFailures: 0,
    fatal: false,
    ...overrides,
  };
}

function getBridgeApi() {
  const bridgeApi = window.rpaforge?.bridge;
  if (!bridgeApi) {
    throw new Error('Expected Electron bridge API to be available in test');
  }
  return bridgeApi;
}

function emitBridgeEvent(event: BridgeEvent): void {
  const testWindow = window as Window & {
    __testBridgeEmit?: (bridgeEvent: BridgeEvent) => void;
  };

  if (!testWindow.__testBridgeEmit) {
    throw new Error('Expected test bridge emitter to be available');
  }

  testWindow.__testBridgeEmit(event);
}

describe('renderer PythonBridge', () => {
  beforeEach(() => {
    let listener: ((event: BridgeEvent) => void) | null = null;

    Object.defineProperty(window, 'rpaforge', {
      configurable: true,
      value: {
        bridge: {
          isReady: vi.fn().mockResolvedValue(false),
          getState: vi.fn().mockResolvedValue('stopped'),
          getStatus: vi.fn().mockResolvedValue(createStatus()),
          send: vi.fn(),
          onEvent: vi.fn((callback: (event: BridgeEvent) => void) => {
            listener = callback;
            return () => {
              listener = null;
            };
          }),
        },
      },
    });

    Object.defineProperty(window, '__testBridgeEmit', {
      configurable: true,
      value: (event: BridgeEvent) => listener?.(event),
    });
  });

  test('emits initial bridgeState snapshot from typed bridge status', async () => {
    const status = createStatus({
      state: 'starting',
      reason: 'startup',
    });
    getBridgeApi().getStatus = vi.fn().mockResolvedValue(status);

    const bridge = new PythonBridge();
    const onBridgeState = vi.fn();
    const onConnected = vi.fn();

    bridge.onEvent('bridgeState', onBridgeState);
    bridge.onEvent('connected', onConnected);

    await bridge.start();

    expect(onBridgeState).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'bridgeState',
        state: 'starting',
        isOperational: false,
      })
    );
    expect(onConnected).not.toHaveBeenCalled();
    expect(bridge.isReady()).toBe(false);
  });

  test('emits connectivity changes only when operational boundary changes', async () => {
    const status = createStatus({
      state: 'ready',
      previousState: 'starting',
      isOperational: true,
      reason: 'ready_check',
    });
    getBridgeApi().getStatus = vi.fn().mockResolvedValue(status);

    const bridge = new PythonBridge();
    const onConnected = vi.fn();
    const onDisconnected = vi.fn();

    bridge.onEvent('connected', onConnected);
    bridge.onEvent('disconnected', onDisconnected);

    await bridge.start();

    expect(onConnected).toHaveBeenCalledTimes(1);

    emitBridgeEvent({
      type: 'bridgeState',
      ...createStatus({
        state: 'degraded',
        previousState: 'ready',
        isOperational: true,
        reason: 'heartbeat',
        consecutiveHeartbeatFailures: 1,
      }),
    });

    expect(onConnected).toHaveBeenCalledTimes(1);
    expect(onDisconnected).not.toHaveBeenCalled();

    emitBridgeEvent({
      type: 'bridgeState',
      ...createStatus({
        state: 'stopped',
        previousState: 'degraded',
        isOperational: false,
        reason: 'reconnect_exhausted',
        fatal: true,
        error: 'Python bridge stopped after exhausting reconnect attempts',
      }),
    });

    expect(onDisconnected).toHaveBeenCalledTimes(1);
    expect(bridge.isReady()).toBe(false);
  });
});
