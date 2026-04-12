import { afterEach, describe, expect, test, vi } from 'vitest';

describe('app config', () => {
  afterEach(() => {
    delete (window as Window & { rpaforgeConfig?: unknown }).rpaforgeConfig;
    vi.resetModules();
  });

  test('exposes default history, console, and window values', async () => {
    const { config } = await import('./app.config');

    expect(config.history.maxSize).toBe(50);
    expect(config.console.defaultOpen).toBe(false);
    expect(config.console.maxLogs).toBe(10000);
    expect(config.window.width).toBe(1400);
  });

  test('applies runtime overrides from window.rpaforgeConfig', async () => {
    (window as Window & { rpaforgeConfig?: unknown }).rpaforgeConfig = {
      history: { maxSize: 25 },
      console: { defaultOpen: true },
      window: { width: 1280 },
      bridge: { heartbeatFailureThreshold: 4 },
    };

    vi.resetModules();
    const { config } = await import('./app.config');

    expect(config.history.maxSize).toBe(25);
    expect(config.console.defaultOpen).toBe(true);
    expect(config.window.width).toBe(1280);
    expect(config.bridge.heartbeatFailureThreshold).toBe(4);
  });
});
