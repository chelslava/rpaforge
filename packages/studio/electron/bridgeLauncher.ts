/**
 * Python bridge launch and lifecycle (extracted from main.ts, issue #828).
 *
 * Resolves how to spawn the engine in dev (editable install) vs packaged
 * (PyInstaller bundle under resources/bridge), initializes PythonBridge,
 * and forwards bridge events to the renderer.
 */

import { app } from 'electron';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { PythonBridge, type BridgeLaunchSpec, type PythonBridgeConfig } from './python-bridge';
import { IPC_CHANNELS } from '../src/types/ipc-contracts';
import type { BridgeStatus } from '../src/types/events';
import { createLogger } from '../src/utils/logger';
import { getMainWindow } from './windows';
import { recordSecurityEvent } from './audit/securityAudit';
import { syncLibraryUpdates } from './librarySync';

const logger = createLogger('electron-bridge');

let pythonBridge: PythonBridge | null = null;
let bridgeEventCleanup: (() => void) | null = null;

export function getPythonBridge(): PythonBridge | null {
  return pythonBridge;
}

export function getDefaultBridgeStatus(): BridgeStatus {
  return {
    timestamp: new Date().toISOString(),
    state: 'stopped',
    isOperational: false,
    maxReconnectAttempts: 0,
    consecutiveHeartbeatFailures: 0,
    fatal: false,
  };
}

/**
 * Resolve how to launch the Python engine.
 *
 * In development we run the editable packages via `python -m rpaforge.bridge.server`
 * (returning null lets PythonBridge fall back to that default). In a packaged
 * build the engine ships as a PyInstaller bundle under `resources/bridge`, copied
 * there by electron-builder `extraResources`, so we spawn that executable directly
 * and no Python installation is required on the user's machine.
 */
export function resolveBridgeLaunchSpec(): BridgeLaunchSpec | null {
  if (process.env.NODE_ENV === 'development' || !app.isPackaged) {
    return null;
  }

  const exeName =
    process.platform === 'win32' ? 'rpaforge-bridge.exe' : 'rpaforge-bridge';
  const command = path.join(process.resourcesPath, 'bridge', exeName);

  if (!fs.existsSync(command)) {
    logger.error(
      `Bundled Python bridge not found at: ${command}. ` +
        'Activities will be unavailable until the engine is rebuilt.'
    );
  }

  // Point bundled optional tooling at the resources shipped via extraResources.
  // These directories may be empty in a plain `pnpm build` (no engine assets);
  // the corresponding activities degrade gracefully when the tools are absent.
  const tesseractDir = path.join(process.resourcesPath, 'tesseract');
  const env: Record<string, string> = {
    // Playwright (WebUI) resolves browser binaries from this directory.
    PLAYWRIGHT_BROWSERS_PATH: path.join(process.resourcesPath, 'pw-browsers'),
    // Tesseract language data for pytesseract (OCR).
    TESSDATA_PREFIX: path.join(tesseractDir, 'tessdata'),
    // Make the bundled tesseract executable discoverable; pytesseract invokes
    // `tesseract` via the system PATH.
    PATH: `${tesseractDir}${path.delimiter}${process.env.PATH ?? ''}`,
  };

  // The engine creates CWD-relative paths (e.g. `.rpaforge_checkpoints`). An app
  // launched from Program Files has a read-only CWD, so the engine would crash on
  // startup with a permission error. Run it in a writable per-user directory.
  const workingDir = path.join(app.getPath('userData'), 'engine');
  try {
    fs.mkdirSync(workingDir, { recursive: true });
  } catch (error) {
    logger.error(`Failed to create engine working directory: ${workingDir}`, error);
  }

  return { command, args: [], env, cwd: workingDir };
}

export async function initializePythonBridge(): Promise<void> {
  const launchSpec = resolveBridgeLaunchSpec();
  // The bundled (frozen) engine has a much slower cold first launch than the
  // editable dev install — the OS/AV scans the executable and its hundreds of
  // bundled DLLs the first time it runs, which can take far longer than the 5s
  // dev default. Without extra headroom the initial launch would time out and
  // the bridge would go fatal (no auto-reconnect), so give production builds a
  // generous startup window.
  const bridgeConfig: Partial<PythonBridgeConfig> = launchSpec
    ? { startupTimeoutMs: 60_000 }
    : {};
  pythonBridge = new PythonBridge(bridgeConfig, undefined, launchSpec);

  if (bridgeEventCleanup) {
    bridgeEventCleanup();
    bridgeEventCleanup = null;
  }

  bridgeEventCleanup = pythonBridge.onEvent('*', (event) => {
    if (event.type === 'bridgeState' && event.state === 'reconnecting' &&
        (event.reason === 'process_exit' || event.reason === 'process_error')) {
      void recordSecurityEvent('bridge_restart', { reason: 'crash', trigger: event.reason });
    }
    const mainWindow = getMainWindow();
    if (mainWindow && !mainWindow.isDestroyed()) {
      logger.debug(`Forwarding event to renderer: ${event.type}`, event);
      mainWindow.webContents.send(IPC_CHANNELS.BRIDGE_EVENT, event);
    }
  });

  try {
    await pythonBridge.start();
    logger.info('Python bridge initialized');
    void syncLibraryUpdates();
  } catch (error) {
    logger.error('Failed to start Python bridge', error);
  }
}

export async function restartBridge(): Promise<void> {
  if (pythonBridge) {
    await pythonBridge.restart().catch((err: Error) => {
      logger.error('Failed to restart Python bridge', err);
    });
  } else {
    await initializePythonBridge();
  }
}

export function stopPythonBridge(): void {
  pythonBridge?.stop();
}
