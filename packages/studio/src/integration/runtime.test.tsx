import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mockElectronAPI } from '../test/integration-setup';
import { MockBridgeAdapter } from '../bridge/mock-bridge';

describe('Studio Runtime Integration', () => {
  beforeEach(() => {
    mockElectronAPI();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('MockBridgeAdapter happy path', () => {
    it('starts and reports ready state', async () => {
      const bridge = new MockBridgeAdapter();
      const events: unknown[] = [];

      const status = await bridge.start((e) => events.push(e));

      expect(status.state).toBe('ready');
      expect(status.isOperational).toBe(true);
      expect(bridge.isReady()).toBe(true);
    });

    it('stops and reports not ready', async () => {
      const bridge = new MockBridgeAdapter();
      await bridge.start(() => {});

      bridge.stop();

      expect(bridge.isReady()).toBe(false);
    });

    it('sends ping and receives pong', async () => {
      const bridge = new MockBridgeAdapter();
      await bridge.start(() => {});

      const result = await bridge.send<{ pong: boolean }>('ping', {});

      expect(result.pong).toBe(true);
    });

    it('fetches capabilities with expected feature flags', async () => {
      const bridge = new MockBridgeAdapter();
      await bridge.start(() => {});

      const caps = await bridge.send<{ version: string; features: Record<string, boolean> }>(
        'getCapabilities',
        {}
      );

      expect(caps.version).toBeTruthy();
      expect(caps.features.debugger).toBe(true);
      expect(caps.features.breakpoints).toBe(true);
    });

    it('fetches activities list', async () => {
      const bridge = new MockBridgeAdapter();
      await bridge.start(() => {});

      const result = await bridge.send<{ activities: unknown[] }>('getActivities', {});

      expect(Array.isArray(result.activities)).toBe(true);
      expect(result.activities.length).toBeGreaterThan(0);
    });

    it('generates code for empty diagram', async () => {
      const bridge = new MockBridgeAdapter();
      await bridge.start(() => {});

      const result = await bridge.send<{ code: string; language: string }>('generateCode', {
        diagram: {},
      });

      expect(result.code).toBeTruthy();
      expect(result.language).toBe('python');
    });

    it('returns empty variables and call stack', async () => {
      const bridge = new MockBridgeAdapter();
      await bridge.start(() => {});

      const vars = await bridge.send<{ variables: unknown[] }>('getVariables', {});
      const stack = await bridge.send<{ callStack: unknown[] }>('getCallStack', {});

      expect(vars.variables).toHaveLength(0);
      expect(stack.callStack).toHaveLength(0);
    });
  });

  describe('ElectronBridgeAdapter with mocked window.rpaforge', () => {
    it('start() resolves to ready status when window.rpaforge is present', async () => {
      const { ElectronBridgeAdapter } = await import('../bridge/electron-bridge');
      const bridge = new ElectronBridgeAdapter();

      const status = await bridge.start(() => {});

      expect(status.isOperational).toBe(true);
      expect(bridge.isReady()).toBe(true);
    });

    it('stop() unsubscribes from events', async () => {
      const { ElectronBridgeAdapter } = await import('../bridge/electron-bridge');
      const bridge = new ElectronBridgeAdapter();
      await bridge.start(() => {});

      bridge.stop();

      expect(bridge.isReady()).toBe(false);
    });

    it('send() delegates to window.rpaforge.bridge.send', async () => {
      const { ElectronBridgeAdapter } = await import('../bridge/electron-bridge');
      const bridge = new ElectronBridgeAdapter();
      await bridge.start(() => {});

      await bridge.send('ping', {});

      expect(window.rpaforge!.bridge.send).toHaveBeenCalledWith('ping', {});
    });
  });

  describe('bridge factory routing', () => {
    it('creates MockBridgeAdapter when window.rpaforge is absent', async () => {
      const saved = window.rpaforge;
      Object.defineProperty(window, 'rpaforge', { value: undefined, writable: true, configurable: true });

      const { createBridgeAdapter } = await import('../bridge/factory');
      const bridge = createBridgeAdapter();

      expect(bridge.transport).toBe('mock');

      Object.defineProperty(window, 'rpaforge', { value: saved, writable: true, configurable: true });
    });

    it('creates ElectronBridgeAdapter when window.rpaforge is present', async () => {
      const { createBridgeAdapter } = await import('../bridge/factory');
      const bridge = createBridgeAdapter();

      expect(bridge.transport).toBe('electron');
    });
  });
});
