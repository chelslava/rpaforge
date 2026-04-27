import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MockBridgeAdapter } from '../bridge/mock-bridge';
import type { BridgeEvent } from '../types/events';
import { mockElectronAPI } from '../test/integration-setup';

describe('Bridge Lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('ready state detection', () => {
    it('reports ready after successful start', async () => {
      const bridge = new MockBridgeAdapter();

      const status = await bridge.start(() => {});

      expect(status.state).toBe('ready');
      expect(status.isOperational).toBe(true);
      expect(bridge.isReady()).toBe(true);
    });

    it('checkReady returns current status', async () => {
      const bridge = new MockBridgeAdapter();
      await bridge.start(() => {});

      const status = await bridge.checkReady();

      expect(status.isOperational).toBe(true);
    });

    it('reports not ready before start', () => {
      const bridge = new MockBridgeAdapter();

      expect(bridge.isReady()).toBe(false);
    });
  });

  describe('disconnect handling', () => {
    it('stop() transitions bridge to not-ready', async () => {
      const bridge = new MockBridgeAdapter();
      await bridge.start(() => {});
      expect(bridge.isReady()).toBe(true);

      bridge.stop();

      expect(bridge.isReady()).toBe(false);
    });

    it('stop() is idempotent — calling twice does not throw', async () => {
      const bridge = new MockBridgeAdapter();
      await bridge.start(() => {});

      bridge.stop();
      expect(() => bridge.stop()).not.toThrow();
    });

    it('send() after stop still resolves (mock always responds)', async () => {
      const bridge = new MockBridgeAdapter();
      await bridge.start(() => {});
      bridge.stop();

      await expect(bridge.send('ping', {})).resolves.toBeDefined();
    });
  });

  describe('reconnect behaviour', () => {
    it('can restart after stop', async () => {
      const bridge = new MockBridgeAdapter();
      await bridge.start(() => {});
      bridge.stop();
      expect(bridge.isReady()).toBe(false);

      const status = await bridge.start(() => {});

      expect(status.isOperational).toBe(true);
      expect(bridge.isReady()).toBe(true);
    });

    it('second start overwrites previous ready status', async () => {
      const bridge = new MockBridgeAdapter();
      await bridge.start(() => {});
      bridge.stop();

      const status = await bridge.start(() => {});

      expect(status.state).toBe('ready');
    });
  });

  describe('fatal startup failure simulation', () => {
    it('throws when ElectronBridgeAdapter used without window.rpaforge', async () => {
      const saved = window.rpaforge;
      Object.defineProperty(window, 'rpaforge', { value: undefined, writable: true, configurable: true });

      const { ElectronBridgeAdapter } = await import('../bridge/electron-bridge');
      const bridge = new ElectronBridgeAdapter();

      await expect(bridge.start(() => {})).rejects.toThrow('Electron API not available');

      Object.defineProperty(window, 'rpaforge', { value: saved, writable: true, configurable: true });
    });
  });

  describe('graceful shutdown', () => {
    it('event listener is removed after stop', async () => {
      const received: BridgeEvent[] = [];
      const { emitBridgeEvent } = mockElectronAPI();

      const { ElectronBridgeAdapter } = await import('../bridge/electron-bridge');
      const bridge = new ElectronBridgeAdapter();
      await bridge.start((e) => received.push(e));

      bridge.stop();

      emitBridgeEvent({ type: 'log', timestamp: new Date().toISOString(), level: 'info', message: 'after stop' });

      expect(received).toHaveLength(0);
    });

    it('event listener receives events before stop', async () => {
      const received: BridgeEvent[] = [];
      const { emitBridgeEvent } = mockElectronAPI();

      const { ElectronBridgeAdapter } = await import('../bridge/electron-bridge');
      const bridge = new ElectronBridgeAdapter();
      await bridge.start((e) => received.push(e));

      emitBridgeEvent({ type: 'log', timestamp: new Date().toISOString(), level: 'info', message: 'hello' });

      expect(received).toHaveLength(1);
      expect((received[0] as { message: string }).message).toBe('hello');

      bridge.stop();
    });
  });
});
