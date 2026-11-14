// @vitest-environment node

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { AppUpdateManager, STARTUP_CHECK_DELAY_MS } from './appUpdate';
import type { AppUpdateDeps, AutoUpdaterLike, UpdateChannel } from './appUpdate';

type Listener = (...args: unknown[]) => void;

interface StubUpdater extends AutoUpdaterLike {
  listeners: Map<string, Listener[]>;
  emit(event: string, ...args: unknown[]): void;
}

function makeStubUpdater(): StubUpdater {
  const listeners = new Map<string, Listener[]>();
  return {
    listeners,
    autoDownload: false,
    autoInstallOnAppQuit: false,
    allowPrerelease: false,
    channel: null,
    logger: null,
    on(event: string, listener: Listener) {
      listeners.set(event, [...(listeners.get(event) ?? []), listener]);
      return this;
    },
    emit(event: string, ...args: unknown[]) {
      (listeners.get(event) ?? []).forEach((listener) => listener(...args));
    },
    checkForUpdates: vi.fn(),
    downloadUpdate: vi.fn(),
    quitAndInstall: vi.fn(),
  };
}

function makeDeps(
  updater: StubUpdater,
  overrides: Partial<AppUpdateDeps> = {},
): AppUpdateDeps & { channels: UpdateChannel[] } {
  const channels: UpdateChannel[] = [];
  return {
    autoUpdater: updater,
    getVersion: () => '0.7.0',
    isPackaged: () => true,
    getMainWindow: () => null,
    getChannel: () => channels[channels.length - 1] ?? 'stable',
    setChannel: (channel) => channels.push(channel),
    ...overrides,
    channels,
  } as AppUpdateDeps & { channels: UpdateChannel[] };
}

describe('AppUpdateManager', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    delete process.env.RPAFORGE_UPDATE_FEED_URL;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test('constructor applies defaults and the current channel', () => {
    const updater = makeStubUpdater();
    const deps = makeDeps(updater, { getChannel: () => 'pre-release' });
    new AppUpdateManager(deps);

    expect(updater.autoDownload).toBe(true);
    expect(updater.autoInstallOnAppQuit).toBe(true);
    expect(updater.allowPrerelease).toBe(true);
    expect(updater.channel).toBe('beta');
  });

  test('stable channel maps to latest with allowPrerelease=false', () => {
    const updater = makeStubUpdater();
    new AppUpdateManager(makeDeps(updater, { getChannel: () => 'stable' }));
    expect(updater.allowPrerelease).toBe(false);
    expect(updater.channel).toBe('latest');
  });

  test('checkForUpdates in dev without a feed override reports the dev error', async () => {
    const updater = makeStubUpdater();
    const manager = new AppUpdateManager(
      makeDeps(updater, { isPackaged: () => false }),
    );
    const state = await manager.checkForUpdates();
    expect(state.phase).toBe('error');
    expect(state.error).toMatch(/development/);
    expect(updater.checkForUpdates).not.toHaveBeenCalled();
  });

  test('checkForUpdates runs against the feed override even in dev', async () => {
    process.env.RPAFORGE_UPDATE_FEED_URL = 'http://127.0.0.1:9000';
    const updater = makeStubUpdater();
    const manager = new AppUpdateManager(
      makeDeps(updater, { isPackaged: () => false }),
    );
    await manager.checkForUpdates();
    expect(updater.checkForUpdates).toHaveBeenCalled();
  });

  test('checkForUpdates surfaces rejection as the error phase', async () => {
    const updater = makeStubUpdater();
    updater.checkForUpdates = vi.fn(async () => {
      throw new Error('net down');
    });
    const manager = new AppUpdateManager(makeDeps(updater));
    const state = await manager.checkForUpdates();
    expect(state.phase).toBe('error');
    expect(state.error).toBe('net down');
  });

  test('update-available flips to downloading and forwards version', () => {
    const updater = makeStubUpdater();
    const manager = new AppUpdateManager(makeDeps(updater));
    updater.emit('update-available', { version: '0.8.0', releaseNotes: 'Notes' });

    const state = manager.getState();
    expect(state.phase).toBe('downloading');
    expect(state.availableVersion).toBe('0.8.0');
    expect(state.releaseNotes).toBe('Notes');
    expect(state.currentVersion).toBe('0.7.0');
  });

  test('update-not-available and download-progress update the snapshot', () => {
    const updater = makeStubUpdater();
    const manager = new AppUpdateManager(makeDeps(updater));

    updater.emit('update-not-available');
    expect(manager.getState().phase).toBe('not-available');

    updater.emit('update-available', { version: '0.9.0' });
    updater.emit('download-progress', { percent: 42.7 });
    const state = manager.getState();
    expect(state.phase).toBe('downloading');
    expect(state.progressPercent).toBeCloseTo(42.7);
  });

  test('update-downloaded reaches the installable phase', () => {
    const updater = makeStubUpdater();
    const manager = new AppUpdateManager(makeDeps(updater));
    updater.emit('update-downloaded', { version: '0.9.0' });
    expect(manager.getState().phase).toBe('downloaded');
    expect(manager.getState().progressPercent).toBe(100);
  });

  test('updater error event records the message', () => {
    const updater = makeStubUpdater();
    const manager = new AppUpdateManager(makeDeps(updater));
    updater.emit('error', new Error('sha512 mismatch'));
    expect(manager.getState().phase).toBe('error');
    expect(manager.getState().error).toBe('sha512 mismatch');
  });

  test('installUpdate only fires quitAndInstall when downloaded', () => {
    const updater = makeStubUpdater();
    const manager = new AppUpdateManager(makeDeps(updater));

    manager.installUpdate();
    expect(updater.quitAndInstall).not.toHaveBeenCalled();

    updater.emit('update-downloaded', { version: '0.9.0' });
    manager.installUpdate();
    expect(updater.quitAndInstall).toHaveBeenCalledTimes(1);
  });

  test('setChannel persists, re-applies allowPrerelease and resets state', async () => {
    const updater = makeStubUpdater();
    const deps = makeDeps(updater);
    const manager = new AppUpdateManager(deps);
    updater.emit('error', new Error('stale'));

    const state = await manager.setChannel('pre-release');

    expect(deps.channels).toEqual(['pre-release']);
    expect(updater.allowPrerelease).toBe(true);
    expect(state.phase).toBe('idle');
    expect(state.channel).toBe('pre-release');
  });

  test('startup check is scheduled only for packaged builds and fires once', () => {
    vi.useFakeTimers();
    const updater = makeStubUpdater();
    const deps = makeDeps(updater, { isPackaged: () => false });
    const manager = new AppUpdateManager(deps);

    manager.scheduleStartupCheck();
    vi.advanceTimersByTime(STARTUP_CHECK_DELAY_MS * 2);
    expect(updater.checkForUpdates).not.toHaveBeenCalled();
    manager.cancelStartupCheck();

    const depsPackaged = makeDeps(updater);
    const managerPackaged = new AppUpdateManager(depsPackaged);
    managerPackaged.scheduleStartupCheck();
    managerPackaged.scheduleStartupCheck();
    vi.advanceTimersByTime(STARTUP_CHECK_DELAY_MS + 10);
    expect(updater.checkForUpdates).toHaveBeenCalledTimes(1);
  });
});
