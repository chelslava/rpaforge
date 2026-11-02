/**
 * Application auto-update manager (issue #819).
 *
 * Wraps electron-updater's autoUpdater behind a small injectable surface so
 * the state machine is unit-testable without a packaged build:
 *   idle → checking → (available|not-available) → downloading → downloaded
 * with `error` reachable from any state.
 *
 * Feed resolution: the electron-builder `publish: { provider: 'github' }`
 * config drives the GitHub Releases provider. `RPAFORGE_UPDATE_FEED_URL`
 * overrides it with a generic (static HTTP) provider — used by the staged
 * E2E update test and useful for self-hosted mirrors.
 *
 * Update integrity: electron-updater verifies every downloaded artifact
 * against the sha512 recorded in latest.yml at publish time; latest.yml
 * itself is protected by repo write access + TLS (see
 * docs/developer-guide/release-verification.md for the full story).
 */

import { app, type BrowserWindow } from 'electron';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { createLogger } from '../src/utils/logger';
import { IPC_CHANNELS } from '../src/types/ipc-contracts';
import type { AppUpdateEventPayload, AppUpdatePhase } from '../src/types/ipc-contracts';

const logger = createLogger('electron-app-update');

/** Delay before the startup update check (ms) — keeps launch snappy. */
export const STARTUP_CHECK_DELAY_MS = 10_000;

export type UpdateChannel = 'stable' | 'pre-release';

export interface UpdateState {
  phase: AppUpdatePhase;
  availableVersion?: string;
  releaseNotes?: string;
  progressPercent?: number;
  error?: string;
}

/** Minimal shape of electron-updater's autoUpdater used here (tests stub it). */
export interface AutoUpdaterLike {
  autoDownload: boolean;
  autoInstallOnAppQuit: boolean;
  allowPrerelease: boolean;
  channel: string | null;
  logger: unknown | null;
  on(event: string, listener: (...args: unknown[]) => void): unknown;
  checkForUpdates(): Promise<unknown> | void;
  downloadUpdate(): Promise<unknown> | void;
  quitAndInstall?(): void;
}

export interface AppUpdateDeps {
  autoUpdater: AutoUpdaterLike;
  /** CURRENT app version (baked into the packaged build). */
  getVersion(): string;
  isPackaged(): boolean;
  getMainWindow(): BrowserWindow | null;
  /** Read/update the persisted channel setting. */
  getChannel(): UpdateChannel;
  setChannel(channel: UpdateChannel): void;
}

export class AppUpdateManager {
  private readonly deps: AppUpdateDeps;
  private state: UpdateState = { phase: 'idle' };
  private startupTimer: NodeJS.Timeout | null = null;
  private started = false;

  constructor(deps: AppUpdateDeps) {
    this.deps = deps;
    this.deps.autoUpdater.autoDownload = true;
    this.deps.autoUpdater.autoInstallOnAppQuit = true;
    this.deps.autoUpdater.logger = null;
    this.applyChannel();
    this.bindUpdaterEvents();
  }

  /** Current state snapshot (rendered by the renderer on request). */
  getState(): UpdateState & { currentVersion: string; channel: UpdateChannel } {
    return {
      ...this.state,
      currentVersion: this.deps.getVersion(),
      channel: this.deps.getChannel(),
    };
  }

  /** Apply the channel setting to the updater and clear stale state. */
  applyChannel(): void {
    const channel = this.deps.getChannel();
    // allowPrerelease follows the persisted user setting, not the version
    // suffix: a stable build may still opt into pre-release updates.
    this.deps.autoUpdater.allowPrerelease = channel === 'pre-release';
    this.deps.autoUpdater.channel = channel === 'pre-release' ? 'beta' : 'latest';
  }

  /** Persist the channel preference and re-apply it. Returns the new state. */
  async setChannel(channel: UpdateChannel): Promise<AppUpdateEventPayload> {
    this.deps.setChannel(channel);
    this.applyChannel();
    this.state = { phase: 'idle' };
    return this.emit();
  }

  /** Manual "Check for updates" — always runs, even in dev (against the override feed). */
  async checkForUpdates(): Promise<AppUpdateEventPayload> {
    if (!this.deps.isPackaged() && !process.env.RPAFORGE_UPDATE_FEED_URL) {
      this.state = {
        phase: 'error',
        error: 'Updates are disabled in development builds.',
      };
      return this.emit();
    }
    this.state = { phase: 'checking' };
    this.emit();
    try {
      // electron-updater emits update-available/not-available/error on its own;
      // the awaiting is just for immediate rejection surfacing.
      await Promise.resolve(this.deps.autoUpdater.checkForUpdates());
      return this.snapshot();
    } catch (err) {
      this.state = { phase: 'error', error: errorMessage(err) };
      return this.emit();
    }
  }

  /** Schedule the one-shot startup check (packaged builds only). */
  scheduleStartupCheck(): void {
    if (this.started || !this.deps.isPackaged()) return;
    this.started = true;
    this.startupTimer = setTimeout(() => {
      this.startupTimer = null;
      void this.checkForUpdates();
    }, STARTUP_CHECK_DELAY_MS);
  }

  cancelStartupCheck(): void {
    if (this.startupTimer) {
      clearTimeout(this.startupTimer);
      this.startupTimer = null;
    }
  }

  /** Restart the app and apply the staged update. */
  installUpdate(): void {
    if (this.state.phase !== 'downloaded') {
      logger.warn(`installUpdate ignored in phase ${this.state.phase}`);
      return;
    }
    this.deps.autoUpdater.quitAndInstall?.();
  }

  private bindUpdaterEvents(): void {
    this.deps.autoUpdater.on('checking-for-update', () => {
      this.state = { phase: 'checking' };
      this.emit();
    });
    this.deps.autoUpdater.on('update-available', (...args: unknown[]) => {
      const info = (args[0] ?? {}) as { version?: string; releaseNotes?: unknown };
      this.state = {
        phase: 'available',
        availableVersion: info.version,
        releaseNotes: normalizeNotes(info.releaseNotes),
      };
      // autoDownload=true makes electron-updater start the download right away;
      // reflect it so the UI shows the in-flight state immediately.
      this.state.phase = 'downloading';
      this.emit();
    });
    this.deps.autoUpdater.on('update-not-available', () => {
      this.state = { phase: 'not-available' };
      this.emit();
    });
    this.deps.autoUpdater.on('download-progress', (...args: unknown[]) => {
      const progress = (args[0] ?? {}) as { percent?: number };
      this.state = {
        ...this.state,
        phase: 'downloading',
        progressPercent: progress.percent,
      };
      this.emit();
    });
    this.deps.autoUpdater.on('update-downloaded', (...args: unknown[]) => {
      const info = (args[0] ?? {}) as { version?: string; releaseNotes?: unknown };
      this.state = {
        phase: 'downloaded',
        availableVersion: info.version ?? this.state.availableVersion,
        releaseNotes: normalizeNotes(info.releaseNotes) ?? this.state.releaseNotes,
        progressPercent: 100,
      };
      this.emit();
    });
    this.deps.autoUpdater.on('error', (...args: unknown[]) => {
      this.state = { phase: 'error', error: errorMessage(args[0]) };
      this.emit();
    });
  }

  private snapshot(): AppUpdateEventPayload {
    return {
      phase: this.state.phase,
      currentVersion: this.deps.getVersion(),
      channel: this.deps.getChannel(),
      availableVersion: this.state.availableVersion,
      releaseNotes: this.state.releaseNotes,
      progressPercent: this.state.progressPercent,
      error: this.state.error,
    };
  }

  private emit(): AppUpdateEventPayload {
    const payload = this.snapshot();
    const mainWindow = this.deps.getMainWindow();
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(IPC_CHANNELS.APP_UPDATE_EVENT, payload);
    }
    return payload;
  }
}

function normalizeNotes(notes: unknown): string | undefined {
  if (typeof notes === 'string' && notes.trim()) return notes.trim();
  if (Array.isArray(notes)) {
    return notes
      .map((part) => (typeof part === 'string' ? part : ''))
      .join('\n')
      .trim() || undefined;
  }
  return undefined;
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  return 'Unknown update error';
}

/**
 * Build the production dependency graph: real electron-updater + a
 * userData-file-backed channel preference. Kept separate so tests can
 * construct AppUpdateManager with stubs instead of importing
 * electron-updater. The channel is persisted here (not in the renderer's
 * settings store) because the store module drags the i18n bundle into the
 * main-process build.
 */
export async function createAppUpdateManager(
  getMainWindow: () => BrowserWindow | null,
): Promise<AppUpdateManager> {
  const { autoUpdater } = await import('electron-updater');
  const feedUrl = process.env.RPAFORGE_UPDATE_FEED_URL?.trim();
  if (feedUrl) {
    autoUpdater.setFeedURL({ provider: 'generic', url: feedUrl });
  }
  const channelFile = path.join(app.getPath('userData'), 'update-channel.json');

  const readChannel = (): UpdateChannel => {
    try {
      const parsed = JSON.parse(fs.readFileSync(channelFile, 'utf-8')) as {
        channel?: string;
      };
      return parsed.channel === 'pre-release' ? 'pre-release' : 'stable';
    } catch {
      return 'stable';
    }
  };
  const writeChannel = (channel: UpdateChannel): void => {
    try {
      fs.mkdirSync(path.dirname(channelFile), { recursive: true });
      fs.writeFileSync(channelFile, JSON.stringify({ channel }), 'utf-8');
    } catch (err) {
      logger.warn('Failed to persist update channel', err);
    }
  };

  return new AppUpdateManager({
    autoUpdater,
    getVersion: () => app.getVersion(),
    isPackaged: () => app.isPackaged,
    getMainWindow,
    getChannel: readChannel,
    setChannel: writeChannel,
  });
}
