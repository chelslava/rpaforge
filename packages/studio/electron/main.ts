import { app, BrowserWindow, ipcMain, dialog, shell, globalShortcut, screen } from 'electron';
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as fsp from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import chokidar, { type FSWatcher } from 'chokidar';
import { PythonBridge, type BridgeLaunchSpec, type PythonBridgeConfig } from './python-bridge';
import { IPC_CHANNELS } from '../src/types/ipc-contracts';
import type { LogEntry, OpenDialogOptions, SaveDialogOptions, FileInfo } from '../src/types/ipc-contracts';
import type { BridgeState, BridgeStatus, FsEvent } from '../src/types/events';
import { createLogger } from '../src/utils/logger';
import { config } from '../src/config/app.config';
import { validateMethodName, validateSafeString, validateFilePath, validateIPCPayload, setProjectRoot, validateProjectFilePath, validateProjectRoot, getProjectRoot } from './ipc-validator';
import { GitService } from './git/gitService';
import { getProvider } from './ai/providers';
import { generateDiagram } from './ai/generateDiagram';
import { getActivitySuggestions } from './ai/suggestions';
import { getProviderConfig, setProviderConfig, removeProviderConfig, getProviderStatuses } from './ai/keyStore';
import { getProviderConfig as getStoredProviderConfig } from './ai/keyStore';
import { grantAiConsent, hasAiConsent, type AiConsentFeature } from './ai/consentStore';
import { isLocalEndpoint } from './ai/privacy';
import { deleteSecret, getSecret, getSecretStoreStatus, setSecret } from './secret-variable-store';
import { autoFillParams } from './ai/paramFill';
import { fetchRegistry, getLibraryFromRegistry, validateLibrary } from './libraries/registry';
import type { AiGenerateDiagramRequest, AiSetProviderKeyRequest, AiAutoFillRequest, AiAutoFillResult, AiProviderId, SuggestionContext } from '../src/types/ai';
import type { RegistryManifest, CommunityLibrary } from '../src/types/ipc-contracts';
import { readSecurityEvents, recordSecurityEvent, anonymize } from './audit/securityAudit';
import { fetchTemplateRegistry } from './templates/registry';
import { estimateTokenCost } from './ai/tokenCost';

import type { AiGenerateDiagramRequest, AiSetProviderKeyRequest, AiProviderId, AiCompareRequest, AiCompareResult, SuggestionContext } from '../src/types/ai';
import type { RegistryManifest, CommunityLibrary } from '../src/types/ipc-contracts';

// ESM polyfill for __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Download package from PyPI and compute SHA-256 hash.
 * Uses Node.js built-in crypto module - no NPM dependencies required.
 *
 * @param pypiPackage The PyPI package name (e.g., 'rpaforge-sap')
 * @param expectedSha256 The expected SHA-256 hash to verify against
 * @returns Promise<void> Resolves if hash matches or verification skipped, rejects on mismatch
 */
async function verifyPackageHash(pypiPackage: string, expectedSha256?: string): Promise<void> {
  // Skip verification if no hash provided (backward compatibility)
  if (!expectedSha256 || expectedSha256.trim() === '') {
    return;
  }

  // Download from PyPI using fetch
  const pypiUrl = `https://pypi.org/pypi/${encodeURIComponent(pypiPackage)}/json`;
  let response: Response;
  try {
    response = await fetch(pypiUrl, { signal: AbortSignal.timeout(10000) });
    if (!response.ok) {
      throw new Error(`Failed to fetch package info from PyPI: ${response.status} ${response.statusText}`);
    }
  } catch (err) {
    throw new Error(`Failed to fetch package info from PyPI: ${err instanceof Error ? err.message : String(err)}`);
  }

  const data = await response.json();
  
  // Extract the URL for the main distribution file (wheel or sdist)
  const urls = data?.info?.urls || [];
  if (urls.length === 0) {
    throw new Error('No distribution files found for package');
  }
  
  // Prefer wheel files, fall back to sdist
  const distUrl = urls.find((u: any) => u.url.endsWith('.whl'))?.url || urls[0].url;
  
  // Download the actual distribution file
  let distResponse: Response;
  try {
    distResponse = await fetch(distUrl, { signal: AbortSignal.timeout(120000) });
    if (!distResponse.ok) {
      throw new Error(`Failed to download distribution: ${distResponse.status} ${distResponse.statusText}`);
    }
  } catch (err) {
    throw new Error(`Failed to download distribution: ${err instanceof Error ? err.message : String(err)}`);
  }
  
  // Compute SHA-256 of downloaded content
  const arrayBuffer = await distResponse.arrayBuffer();
  const crypto = (await import('crypto')).default;
  const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
  const hashHex = Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  
  // Compare hashes (case-insensitive)
  if (hashHex.toLowerCase() !== expectedSha256.toLowerCase()) {
    throw new Error(
      `Checksum mismatch for '${pypiPackage}': expected '${expectedSha256}', got '${hashHex}'. ` +
      'The package may be corrupted or tampered with. Installation blocked.'
    );
  }
}

let mainWindow: BrowserWindow | null = null;
let pythonBridge: PythonBridge | null = null;
const fsWatchers: Map<string, FSWatcher> = new Map();
let bridgeEventCleanup: (() => void) | null = null;
const debouncedSend: Map<string, NodeJS.Timeout> = new Map();
let spyOverlayWindow: BrowserWindow | null = null;
let isSpyModeActive = false;
let spyMode: 'web' | 'desktop' = 'desktop';

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
// Explicit opt-in for opening DevTools in a production build (e.g. to debug a
// startup/load failure). Leaks renderer internals, so it must not be automatic.
const enableProdDevTools = process.env.RPAFORGE_DEVTOOLS === '1';
const logger = createLogger('electron-main');
const FS_DEBOUNCE_MS = 100;

function isAllowedNavigation(url: string, devServerUrl?: string): boolean {
  try {
    const urlObj = new URL(url);

    if (isDev && devServerUrl) {
      const devUrl = new URL(devServerUrl);
      return urlObj.origin === devUrl.origin;
    }

    return urlObj.protocol === 'file:';
  } catch {
    return false;
  }
}

const LOG_DIR = path.join(app.getPath('userData'), 'logs');
const LOG_FILE = path.join(LOG_DIR, 'app.log');
const MAX_LOG_SIZE = 5 * 1024 * 1024;
const MAX_LOG_FILES = 5;
const logBuffer: LogEntry[] = [];
const MAX_BUFFER_SIZE = 100;
const aiAbortControllers: Map<string, AbortController> = new Map();

const AI_CONSENT_CATEGORIES = ['prompt text', 'activity metadata', 'variable names and defaults'];

async function ensureAiConsent(
  feature: AiConsentFeature,
  providerId: AiProviderId,
  baseUrl: string | undefined,
  language?: string,
): Promise<boolean> {
  if (isLocalEndpoint(providerId, baseUrl) || hasAiConsent(feature)) return true;

  const russian = language?.toLowerCase().startsWith('ru') ?? false;
  const title = russian ? 'Передача данных в AI-провайдер' : 'AI data sharing disclosure';
  const message = russian
    ? `Для функции «${feature}» данные будут отправлены удалённому провайдеру:\n\n• ${AI_CONSENT_CATEGORIES.join('\n• ')}\n\nПродолжить?`
    : `The “${feature}” feature will send data to a remote AI provider:\n\n• ${AI_CONSENT_CATEGORIES.join('\n• ')}\n\nContinue?`;
  const result = await dialog.showMessageBox(mainWindow ?? undefined, {
    type: 'warning',
    title,
    message,
    buttons: russian ? ['Продолжить', 'Отмена'] : ['Continue', 'Cancel'],
    defaultId: 1,
    cancelId: 1,
    noLink: true,
  });
  if (result.response !== 0) return false;
  await grantAiConsent(feature);
  return true;
}

async function ensureLogDir(): Promise<void> {
  try {
    await fsp.mkdir(LOG_DIR, { recursive: true });
  } catch {
    // Ignore if exists
  }
}

async function writeLogToFile(entry: LogEntry): Promise<void> {
  try {
    await ensureLogDir();
    const line = JSON.stringify(entry) + '\n';
    const stats = await fsp.stat(LOG_FILE).catch(() => null);

    if (stats && stats.size >= MAX_LOG_SIZE) {
      await rotateLogs();
    }

    await fsp.appendFile(LOG_FILE, line, 'utf-8');
  } catch {
    // Ignore write errors
  }
}

async function rotateLogs(): Promise<void> {
  try {
    for (let i = MAX_LOG_FILES - 1; i >= 1; i--) {
      const oldFile = path.join(LOG_DIR, `app.${i}.log`);
      const newFile = path.join(LOG_DIR, `app.${i + 1}.log`);
      try {
        await fsp.rename(oldFile, newFile);
      } catch {
        // Ignore if doesn't exist
      }
    }
    const firstBackup = path.join(LOG_DIR, 'app.1.log');
    try {
      await fsp.rename(LOG_FILE, firstBackup);
    } catch {
      // Ignore
    }
  } catch {
    // Ignore rotation errors
  }
}

async function getStoredLogs(filter?: { level?: string; scope?: string }): Promise<LogEntry[]> {
  try {
    const content = await fsp.readFile(LOG_FILE, 'utf-8');
    const lines = content.split('\n').filter(Boolean);
    let logs: LogEntry[] = lines.map((line) => JSON.parse(line));
    
    if (filter?.level) {
      logs = logs.filter((l) => l.level === filter.level);
    }
    if (filter?.scope) {
      logs = logs.filter((l) => l.scope === filter.scope);
    }
    
    return logs;
  } catch {
    return [];
  }
}

async function exportAllLogs(): Promise<string> {
  try {
    const logs = await getStoredLogs();
    return JSON.stringify(logs, null, 2);
  } catch {
    return '[]';
  }
}

function debouncedSendEvent(channel: string, event: FsEvent, key: string): void {
  const timeoutKey = `${channel}:${key}`;
  const existing = debouncedSend.get(timeoutKey);
  if (existing) {
    clearTimeout(existing);
  }
  const timeout = setTimeout(() => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(channel, event);
    }
    debouncedSend.delete(timeoutKey);
  }, FS_DEBOUNCE_MS);
  debouncedSend.set(timeoutKey, timeout);
}

function getDefaultBridgeStatus(): BridgeStatus {
  return {
    timestamp: new Date().toISOString(),
    state: 'stopped',
    isOperational: false,
    maxReconnectAttempts: 0,
    consecutiveHeartbeatFailures: 0,
    fatal: false,
  };
}

function createWindow() {
  let preloadPath: string;
  
  if (isDev) {
    preloadPath = path.join(process.cwd(), 'dist-electron', 'electron', 'preload.cjs');
  } else {
    preloadPath = path.join(__dirname, 'preload.cjs');
  }

  const iconPath = path.join(
    isDev ? process.cwd() : app.getAppPath(),
    'build',
    process.platform === 'win32' ? 'icon.ico' : 'icon.png'
  );

  mainWindow = new BrowserWindow({
    width: config.window.width,
    height: config.window.height,
    minWidth: config.window.minWidth,
    minHeight: config.window.minHeight,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
    title: 'RPAForge Studio',
    autoHideMenuBar: true,
    icon: fs.existsSync(iconPath) ? iconPath : undefined,
  });

  const csp = isDev
    ? [
        "default-src 'self' http://localhost:* ws://localhost:*",
        "script-src 'self' 'unsafe-eval' 'unsafe-inline' https://cdn.jsdelivr.net",
        "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net",
        "style-src-elem 'self' 'unsafe-inline' https://cdn.jsdelivr.net",
        "worker-src 'self' blob:",
        "img-src 'self' data:",
        "font-src 'self' data:",
        "connect-src 'self' http://localhost:* ws://localhost:* https://cdn.jsdelivr.net",
        "frame-ancestors 'none'",
        "media-src 'self' data: blob:",
        "object-src 'none'",
        "child-src 'self'",
        "base-uri 'self'",
        "form-action 'self'",
      ].join('; ')
    : [
        // Production CSP: keep connect-src tight ('self'). All outbound network
        // operations (AI providers incl. Ollama/Gemini/Anthropic, the library
        // registry, PyPI, template marketplace) are performed by the MAIN process
        // over IPC — they are NOT subject to this renderer CSP, so they keep
        // working. If any network call is ever moved into the renderer, add the
        // required endpoints here explicitly instead of loosening to '*'.
        "default-src 'self'",
        "script-src 'self'",
        "style-src 'self' 'unsafe-inline'",
        "style-src-elem 'self' 'unsafe-inline'",
        "worker-src 'self' blob:",
        "img-src 'self' data:",
        "font-src 'self'",
        "connect-src 'self'",
        "frame-ancestors 'none'",
        "media-src 'self' data: blob:",
        "object-src 'none'",
        "child-src 'self'",
        "base-uri 'self'",
        "form-action 'self'",
      ].join('; ');

  mainWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [csp],
      },
    });
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const urlObj = new URL(url);
      if (urlObj.protocol === 'https:' || urlObj.protocol === 'http:') {
        shell.openExternal(url);
      }
    } catch {
      logger.warn(`Invalid URL in window.open: ${url}`);
    }
    return { action: 'deny' };
  });

  const devServerUrl = isDev ? process.env.VITE_DEV_SERVER_URL ?? 'http://127.0.0.1:5173' : '';
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!isAllowedNavigation(url, devServerUrl)) {
      logger.warn(`Blocked navigation to: ${url}`);
      event.preventDefault();
    }
  });

  if (isDev) {
    mainWindow.loadURL(devServerUrl);
    mainWindow.webContents.openDevTools();
  } else {
    // In production, use app.getAppPath() to get the correct path in ASAR
    // app.getAppPath() returns the root of the app (either dist-electron or the ASAR root)
    const appPath = app.getAppPath();
    const indexPath = path.join(appPath, 'dist', 'index.html');

    logger.info('Loading index.html from:', indexPath);

    mainWindow.loadFile(indexPath).catch(err => {
      logger.error(`Failed to load index.html from: ${indexPath}`, err);

      // Open dev tools to see the error — only with an explicit debug flag in
      // production (leaks internals to end users otherwise).
      if (enableProdDevTools) {
        mainWindow!.webContents.openDevTools();
      }

      // Show a blank page with error info
      const errorHtml = `
        <html>
          <body style="background: white; color: red; font-family: monospace; padding: 20px;">
            <h1>Failed to load application</h1>
            <p>Expected path: ${indexPath}</p>
            <p>App path: ${appPath}</p>
            <p>Error: ${err.message}</p>
            <p>Try rebuilding with: npm run build</p>
          </body>
        </html>
      `;
      mainWindow!.webContents.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(errorHtml)}`);
    });
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function createSpyOverlay(): BrowserWindow {
  const display = screen.getPrimaryDisplay();
  const { width, height } = display.workAreaSize;
  logger.info(`Creating spy overlay: ${width}x${height}`);

  const preloadPath = isDev
    ? path.join(process.cwd(), 'dist-electron', 'electron', 'preload.cjs')
    : path.join(__dirname, 'preload.cjs');

  spyOverlayWindow = new BrowserWindow({
    width,
    height,
    x: 0,
    y: 0,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    focusable: false,
    hasShadow: false,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  spyOverlayWindow.webContents.setWindowOpenHandler(({ url }) => {
    logger.warn(`Blocked window.open attempt in spy overlay: ${url}`);
    return { action: 'deny' };
  });

  spyOverlayWindow.webContents.on('will-navigate', (event, url) => {
    const overlayPath = path.join(__dirname, '..', '..', 'dist', 'spy-overlay.html');
    const overlayFileUrl = `file://${overlayPath}`;
    if (!url.startsWith('file://') || url !== overlayFileUrl) {
      logger.warn(`Blocked navigation in spy overlay: ${url}`);
      event.preventDefault();
    }
  });

  const overlayPath = path.join(__dirname, '..', '..', 'dist', 'spy-overlay.html');
  logger.info(`Loading overlay from: ${overlayPath}`);
  spyOverlayWindow.loadFile(overlayPath);

  spyOverlayWindow.webContents.on('did-finish-load', () => {
    logger.info('Spy overlay loaded successfully');
  });

  spyOverlayWindow.webContents.on('did-fail-load', (_, errorCode, errorDesc) => {
    logger.error(`Spy overlay failed to load: ${errorCode} - ${errorDesc}`);
  });

  spyOverlayWindow.setIgnoreMouseEvents(true, { forward: true });

  return spyOverlayWindow;
}

function setupSpyShortcuts() {
  globalShortcut.register('Control+Shift+S', () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;

    isSpyModeActive = !isSpyModeActive;

    if (isSpyModeActive) {
      mainWindow.webContents.send('spy:modeChanged', { active: true });
      if (!spyOverlayWindow || spyOverlayWindow.isDestroyed()) {
        createSpyOverlay();
      }
    } else {
      mainWindow.webContents.send('spy:modeChanged', { active: false });
      if (spyOverlayWindow && !spyOverlayWindow.isDestroyed()) {
        spyOverlayWindow.close();
        spyOverlayWindow = null;
      }
    }
  });

  globalShortcut.register('Control+Shift+C', async () => {
    if (!isSpyModeActive || !mainWindow || mainWindow.isDestroyed()) return;

    try {
      const pos = screen.getCursorScreenPoint();
      const method = spyMode === 'desktop' ? 'captureDesktopElement' : 'captureWebElement';
      const element = await pythonBridge?.sendRequest(method, { x: pos.x, y: pos.y });

      if (element) {
        mainWindow.webContents.send('spy:elementCaptured', { element, mode: spyMode });
        if (spyOverlayWindow && !spyOverlayWindow.isDestroyed()) {
          spyOverlayWindow.webContents.send('spy:elementCaptured', { element, mode: spyMode });
        }
      }
    } catch (err) {
      logger.error('Failed to capture element on shortcut', err);
    }
  });

  const freezeRegistered = globalShortcut.register('Control+Alt+Space', () => {
    if (!isSpyModeActive || !spyOverlayWindow || spyOverlayWindow.isDestroyed()) return;
    spyOverlayWindow.webContents
      .executeJavaScript('window.toggleFreeze && window.toggleFreeze()')
      .catch(() => {});
  });
  if (!freezeRegistered) {
    logger.error('Failed to register Control+Alt+Space — may conflict with system AltGr key');
  }

  globalShortcut.register('Escape', () => {
    if (!isSpyModeActive) return;

    isSpyModeActive = false;
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('spy:modeChanged', { active: false });
    }
    if (spyOverlayWindow && !spyOverlayWindow.isDestroyed()) {
      spyOverlayWindow.close();
      spyOverlayWindow = null;
    }
    logger.info('Spy mode stopped by Escape');
  });
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
function resolveBridgeLaunchSpec(): BridgeLaunchSpec | null {
  if (isDev) {
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

async function initializePythonBridge() {
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
    if (mainWindow && !mainWindow.isDestroyed()) {
      logger.debug(`Forwarding event to renderer: ${event.type}`, event);
      mainWindow.webContents.send(IPC_CHANNELS.BRIDGE_EVENT, event);
    }
  });

  try {
    await pythonBridge.start();
    logger.info('Python bridge initialized');
  } catch (error) {
    logger.error('Failed to start Python bridge', error);
  }
}

function setupIPCHandlers() {
  ipcMain.handle(IPC_CHANNELS.BRIDGE_IS_READY, async (event) => {
    validateIPCPayload(event, 'bridge:isReady', {});
    // Read-only, no payload validation needed
    return pythonBridge?.isReady() ?? false;
  });

  ipcMain.handle(IPC_CHANNELS.BRIDGE_GET_STATE, async (event) => {
    validateIPCPayload(event, 'bridge:getState', {});
    // Read-only, no payload validation needed
    return pythonBridge?.state ?? 'stopped';
  });

  ipcMain.handle(IPC_CHANNELS.BRIDGE_GET_STATUS, async (event) => {
    validateIPCPayload(event, 'bridge:getStatus', {});
    // Read-only, no payload validation needed
    return pythonBridge?.getStatus() ?? getDefaultBridgeStatus();
  });

  ipcMain.handle(IPC_CHANNELS.BRIDGE_SEND, async (event, method: string, params: unknown) => {
    validateMethodName(method);
    validateIPCPayload(event, 'bridge:send', { method, params });
    if (!pythonBridge?.isOperational()) {
      throw new Error(`Python bridge not operational (state: ${pythonBridge?.state ?? 'null'})`);
    }
    return pythonBridge.sendRequest(method, params as Record<string, unknown>);
  });

  ipcMain.handle(IPC_CHANNELS.BRIDGE_RESTART, async (event) => {
    validateIPCPayload(event, 'bridge:restart', {});
    await recordSecurityEvent('bridge_restart', { reason: 'user-initiated' });
    if (pythonBridge) {
      await pythonBridge.restart().catch((err: Error) => {
        logger.error('Failed to restart Python bridge', err);
      });
    } else {
      await initializePythonBridge();
    }
    return pythonBridge?.getStatus() ?? getDefaultBridgeStatus();
  });

  ipcMain.handle(IPC_CHANNELS.ENGINE_PING, async (event) => {
    validateIPCPayload(event, 'engine:ping', {});
    // Read-only, no payload validation needed
    return pythonBridge?.sendRequest('ping', {});
  });

  ipcMain.handle(IPC_CHANNELS.ENGINE_GET_CAPABILITIES, async (event) => {
    validateIPCPayload(event, 'engine:getCapabilities', {});
    return pythonBridge?.sendRequest('getCapabilities', {});
  });

  ipcMain.handle(IPC_CHANNELS.ENGINE_RUN_PROCESS, async (event, source: string, name?: string, sourcemap?: Record<number, string>) => {
    validateSafeString(source, 'source');
    if (name) validateSafeString(name, 'name');
    validateIPCPayload(event, 'engine:runProcess', { source, name, sourcemap });
    await recordSecurityEvent('process_execution', {
      action: 'start',
      processNameHash: anonymize(name ?? 'inline-process'),
      userHash: anonymize(process.env.USERNAME ?? process.env.USER ?? 'unknown'),
    });
    try {
      const result = await pythonBridge?.sendRequest('runProcess', { source, name, sourcemap });
      await recordSecurityEvent('process_execution', {
        action: 'stop',
        processNameHash: anonymize(name ?? 'inline-process'),
        status: 'completed',
      });
      return result;
    } catch (error) {
      await recordSecurityEvent('process_execution', {
        action: 'stop',
        processNameHash: anonymize(name ?? 'inline-process'),
        status: 'failed',
      });
      throw error;
    }
  });

  ipcMain.handle(IPC_CHANNELS.ENGINE_RUN_FILE, async (event, filePath: string) => {
    validateFilePath(filePath, 'filePath');
    validateIPCPayload(event, 'engine:runFile', { path: filePath });
    await recordSecurityEvent('process_execution', {
      action: 'start',
      processNameHash: anonymize(path.basename(filePath)),
      userHash: anonymize(process.env.USERNAME ?? process.env.USER ?? 'unknown'),
    });
    try {
      const result = await pythonBridge?.sendRequest('runFile', { path: filePath });
      await recordSecurityEvent('process_execution', {
        action: 'stop',
        processNameHash: anonymize(path.basename(filePath)),
        status: 'completed',
      });
      return result;
    } catch (error) {
      await recordSecurityEvent('process_execution', {
        action: 'stop',
        processNameHash: anonymize(path.basename(filePath)),
        status: 'failed',
      });
      throw error;
    }
  });

  ipcMain.handle(IPC_CHANNELS.ENGINE_STOP_PROCESS, async (event) => {
    validateIPCPayload(event, 'engine:stopProcess', {});
    const result = await pythonBridge?.sendRequest('stopProcess', {});
    await recordSecurityEvent('process_execution', { action: 'stop', status: 'user-stopped' });
    return result;
  });

  ipcMain.handle(IPC_CHANNELS.ENGINE_PAUSE_PROCESS, async (event) => {
    validateIPCPayload(event, 'engine:pauseProcess', {});
    return pythonBridge?.sendRequest('pauseProcess', {});
  });

  ipcMain.handle(IPC_CHANNELS.ENGINE_RESUME_PROCESS, async (event) => {
    validateIPCPayload(event, 'engine:resumeProcess', {});
    return pythonBridge?.sendRequest('resumeProcess', {});
  });

  ipcMain.handle(IPC_CHANNELS.ENGINE_GET_ACTIVITIES, async (event) => {
    validateIPCPayload(event, 'engine:getActivities', {});
    return pythonBridge?.sendRequest('getActivities', {});
  });

  ipcMain.handle(IPC_CHANNELS.ENGINE_CHECK_STATEFUL_LIBRARIES, async (_event, diagram: unknown) => {
    validateIPCPayload(_event, 'engine:checkStatefulLibraries', { diagram });
    const statefulLibraries = pythonBridge?.sendRequest('checkStatefulLibraries', { diagram });
    return statefulLibraries;
  });

  // Execution audit log handlers
  ipcMain.handle(IPC_CHANNELS.AUDIT_RUNS_LIST, async (event) => {
    validateIPCPayload(event, 'audit:runsList', {});
    try {
      const runsDir = path.join(app.getPath('home'), '.rpaforge', 'runs');
      if (!fs.existsSync(runsDir)) {
        return [];
      }

      const files = fs.readdirSync(runsDir).filter((f) => f.endsWith('.json'));
      const runs = files
        .sort()
        .reverse()
        .slice(0, 50)
        .map((filename) => {
          const filepath = path.join(runsDir, filename);
          const stats = fs.statSync(filepath);
          return {
            filename,
            size: stats.size,
            modified: stats.mtime.toISOString(),
          };
        });

      return runs;
    } catch (error) {
      logger.error('Failed to list audit runs', error);
      return [];
    }
  });

  ipcMain.handle(IPC_CHANNELS.AUDIT_RUNS_GET, async (event, filename: string) => {
    validateIPCPayload(event, 'audit:runsGet', { runId: filename });
    try {
      validateSafeString(filename, 'run filename');
      const runsDir = path.join(app.getPath('home'), '.rpaforge', 'runs');
      const filepath = path.join(runsDir, filename);

      // Prevent directory traversal
      if (!filepath.startsWith(runsDir)) {
        throw new Error('Invalid path');
      }

      if (!fs.existsSync(filepath)) {
        throw new Error('Run file not found');
      }

      const content = fs.readFileSync(filepath, 'utf-8');
      return JSON.parse(content);
    } catch (error) {
      logger.error(`Failed to get audit run ${filename}`, error);
      throw error;
    }
  });

  ipcMain.handle(IPC_CHANNELS.AUDIT_RUNS_DELETE, async (event, filename: string) => {
    validateIPCPayload(event, 'audit:runsDelete', { runId: filename });
    try {
      validateSafeString(filename, 'run filename');
      const runsDir = path.join(app.getPath('home'), '.rpaforge', 'runs');
      const filepath = path.join(runsDir, filename);

      // Prevent directory traversal
      if (!filepath.startsWith(runsDir)) {
        throw new Error('Invalid path');
      }

      if (fs.existsSync(filepath)) {
        fs.unlinkSync(filepath);
      }

      return { success: true };
    } catch (error) {
      logger.error(`Failed to delete audit run ${filename}`, error);
      throw error;
    }
  });

  ipcMain.handle(IPC_CHANNELS.AUDIT_SECURITY_LIST, async (event) => {
    validateIPCPayload(event, 'audit:securityList', {});
    return readSecurityEvents();
  });

  ipcMain.handle(IPC_CHANNELS.TEMPLATES_GET_REGISTRY, async (event) => {
    validateIPCPayload(event, 'templates:getRegistry', {});
    return fetchTemplateRegistry();
  });

  ipcMain.handle(IPC_CHANNELS.SPY_CAPTURE_WEB, async (event, x: number, y: number) => {
    validateIPCPayload(event, 'spy:captureWeb', { x, y });
    return pythonBridge?.sendRequest('captureWebElement', { x, y });
  });

  ipcMain.handle(IPC_CHANNELS.SPY_CAPTURE_DESKTOP, async (event, x: number, y: number) => {
    validateIPCPayload(event, 'spy:captureDesktop', { x, y });
    return pythonBridge?.sendRequest('captureDesktopElement', { x, y });
  });

  ipcMain.handle(IPC_CHANNELS.SPY_START, (event, mode: 'web' | 'desktop') => {
    validateIPCPayload(event, 'spy_start', { mode });
    spyMode = mode;
    isSpyModeActive = true;
    if (!spyOverlayWindow || spyOverlayWindow.isDestroyed()) {
      createSpyOverlay();
    }
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('spy:modeChanged', { active: true, mode });
    }
    logger.info(`Spy mode started: ${mode}`);
    return { success: true };
  });

  ipcMain.handle(IPC_CHANNELS.SPY_STOP, (event) => {
    validateIPCPayload(event, 'spy_stop', {});
    isSpyModeActive = false;
    if (spyOverlayWindow && !spyOverlayWindow.isDestroyed()) {
      spyOverlayWindow.close();
      spyOverlayWindow = null;
    }
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('spy:modeChanged', { active: false });
    }
    logger.info('Spy mode stopped');
    return { success: true };
  });

  ipcMain.handle(IPC_CHANNELS.SPY_CLICK_AT_POSITION, async (event, x: number, y: number) => {
    validateIPCPayload(event, 'spy:clickAtPosition', { coordinates: { x, y } });
    if (!isSpyModeActive) {
      return { success: false, error: 'Spy mode not active' };
    }

    try {
      const method = spyMode === 'desktop' ? 'captureDesktopElement' : 'captureWebElement';
      const element = await pythonBridge?.sendRequest(method, { x, y });

      if (element) {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('spy:elementCaptured', { element, mode: spyMode });
        }
        if (spyOverlayWindow && !spyOverlayWindow.isDestroyed()) {
          spyOverlayWindow.webContents.send('spy:elementCaptured', { element, mode: spyMode });
        }
        return { success: true, element };
      }
      return { success: false, error: 'No element found at position' };
    } catch (err) {
      logger.error('Failed to capture element', err);
      return { success: false, error: String(err) };
    }
  });

  ipcMain.handle(IPC_CHANNELS.SPY_GET_ELEMENT_AT_MOUSE, async (event, mode: 'web' | 'desktop') => {
    validateIPCPayload(event, 'spy:getElementAtMouse', { mode });
    if (!isSpyModeActive) {
      return null;
    }

    try {
      const pos = screen.getCursorScreenPoint();
      const method = mode === 'desktop' ? 'captureDesktopElement' : 'captureWebElement';
      return await pythonBridge?.sendRequest(method, { x: pos.x, y: pos.y });
    } catch (err) {
      logger.error('Failed to get element at mouse', err);
      return null;
    }
  });

  ipcMain.handle(IPC_CHANNELS.SPY_GET_MOUSE_POSITION, (event) => {
    validateIPCPayload(event, 'spy:getMousePosition', {});
    const pos = screen.getCursorScreenPoint();
    return { x: pos.x, y: pos.y };
  });

  ipcMain.handle(IPC_CHANNELS.SPY_GET_ELEMENT_AT_POSITION, async (event, x: number, y: number, mode: 'web' | 'desktop') => {
    validateIPCPayload(event, 'spy:getElementAtPosition', { coordinates: { x, y } });
    try {
      const method = mode === 'desktop' ? 'captureDesktopElement' : 'captureWebElement';
      return await pythonBridge?.sendRequest(method, { x, y });
    } catch (err) {
      logger.error('Failed to get element at position', err);
      return null;
    }
  });

  ipcMain.handle(IPC_CHANNELS.DEBUGGER_SET_BREAKPOINT, async (event, file: string, line: number, condition?: string) => {
    validateFilePath(file, 'file');
    validateIPCPayload(event, 'debugger:setBreakpoint', { file, line, condition });
    return pythonBridge?.sendRequest('setBreakpoint', { file, line, condition });
  });

  ipcMain.handle(IPC_CHANNELS.DEBUGGER_REMOVE_BREAKPOINT, async (event, id: string) => {
    validateSafeString(id, 'id');
    validateIPCPayload(event, 'debugger:removeBreakpoint', { id });
    return pythonBridge?.sendRequest('removeBreakpoint', { id });
  });

  ipcMain.handle(IPC_CHANNELS.DEBUGGER_TOGGLE_BREAKPOINT, async (event, id: string) => {
    validateSafeString(id, 'id');
    validateIPCPayload(event, 'debugger:toggleBreakpoint', { id });
    return pythonBridge?.sendRequest('toggleBreakpoint', { id });
  });

  ipcMain.handle(IPC_CHANNELS.DEBUGGER_GET_BREAKPOINTS, async (event) => {
    validateIPCPayload(event, 'debugger:getBreakpoints', {});
    return pythonBridge?.sendRequest('getBreakpoints', {});
  });

  ipcMain.handle(IPC_CHANNELS.DEBUGGER_STEP_OVER, async (event) => {
    validateIPCPayload(event, 'debugger:stepOver', {});
    return pythonBridge?.sendRequest('stepOver', {});
  });

  ipcMain.handle(IPC_CHANNELS.DEBUGGER_STEP_INTO, async (event) => {
    validateIPCPayload(event, 'debugger:stepInto', {});
    return pythonBridge?.sendRequest('stepInto', {});
  });

  ipcMain.handle(IPC_CHANNELS.DEBUGGER_STEP_OUT, async (event) => {
    validateIPCPayload(event, 'debugger:stepOut', {});
    return pythonBridge?.sendRequest('stepOut', {});
  });

  ipcMain.handle(IPC_CHANNELS.DEBUGGER_CONTINUE, async (event) => {
    validateIPCPayload(event, 'debugger:continue', {});
    return pythonBridge?.sendRequest('continue', {});
  });

  ipcMain.handle(IPC_CHANNELS.DEBUGGER_GET_VARIABLES, async (event) => {
    validateIPCPayload(event, 'debugger:getVariables', {});
    return pythonBridge?.sendRequest('getVariables', {});
  });

  ipcMain.handle(IPC_CHANNELS.DEBUGGER_GET_CALL_STACK, async (event) => {
    validateIPCPayload(event, 'debugger:getCallStack', {});
    return pythonBridge?.sendRequest('getCallStack', {});
  });

  ipcMain.handle(IPC_CHANNELS.DIALOG_SHOW_OPEN, async (event, options: OpenDialogOptions) => {
    validateIPCPayload(event, 'dialog:showOpen', options);
    if (!mainWindow || mainWindow.isDestroyed()) {
      throw new Error('Main window is not available');
    }
    const result = await dialog.showOpenDialog(mainWindow, {
      title: options.title,
      defaultPath: options.defaultPath,
      filters: options.filters,
      properties: options.properties as ('openFile' | 'openDirectory' | 'multiSelections')[],
    });
    return { canceled: result.canceled, filePaths: result.filePaths };
  });

  ipcMain.handle(IPC_CHANNELS.DIALOG_SHOW_SAVE, async (event, options: SaveDialogOptions) => {
    validateIPCPayload(event, 'dialog:showSave', options);
    if (!mainWindow || mainWindow.isDestroyed()) {
      throw new Error('Main window is not available');
    }
    const result = await dialog.showSaveDialog(mainWindow, {
      title: options.title,
      defaultPath: options.defaultPath,
      filters: options.filters,
    });
    return { canceled: result.canceled, filePath: result.filePath };
  });

  ipcMain.handle(IPC_CHANNELS.EDITOR_FORMAT_CODE, async (event, code: string) => {
    validateSafeString(code, 'code');
    validateIPCPayload(event, 'editor:formatCode', { code });
    return pythonBridge?.sendRequest('formatCode', { code });
  });

  ipcMain.handle(IPC_CHANNELS.EDITOR_VALIDATE_CODE, async (event, code: string) => {
    validateSafeString(code, 'code');
    validateIPCPayload(event, 'editor:validateCode', { code });
    return pythonBridge?.sendRequest('validateCode', { code });
  });

  ipcMain.handle(IPC_CHANNELS.FS_SET_PROJECT_ROOT, async (event, rootPath: string) => {
    validateSafeString(rootPath, 'rootPath');
    validateIPCPayload(event, 'fs:setProjectRoot', { rootPath });
    // Establish the project directory: for a brand-new project this is where its
    // folder first comes into existence (the renderer sets the root before any
    // file lives in it). Creating it here also breaks the chicken-and-egg with
    // fs:createDir, which requires a project root to already be set.
    await fsp.mkdir(rootPath, { recursive: true });

    // Validate the chosen root without confining it to process.cwd(): the user
    // explicitly picked this folder (e.g. under Documents), and all later file
    // operations are confined to it by validateProjectFilePath.
    const resolved = validateProjectRoot(rootPath, 'rootPath');

    setProjectRoot(resolved);
    logger.info(`Project root set to: ${resolved}`);
  });

  ipcMain.handle(IPC_CHANNELS.FS_PATH_EXISTS, async (event, filePath: string) => {
    validateProjectFilePath(filePath, 'filePath');
    validateIPCPayload(event, 'fs:pathExists', { filePath });
    return fs.existsSync(filePath);
  });

  ipcMain.handle(IPC_CHANNELS.FS_READ_DIR, async (event, dirPath: string): Promise<FileInfo[]> => {
    validateProjectFilePath(dirPath, 'dirPath');
    validateIPCPayload(event, 'fs:readDir', { dirPath });
    const entries = await fsp.readdir(dirPath, { withFileTypes: true });
    return entries.map((entry) => ({
      name: entry.name,
      path: path.join(dirPath, entry.name),
      isDirectory: entry.isDirectory(),
      isFile: entry.isFile(),
      extension: entry.isFile() ? path.extname(entry.name) : '',
    }));
  });

  ipcMain.handle(IPC_CHANNELS.FS_READ_FILE, async (event, filePath: string): Promise<string> => {
    validateProjectFilePath(filePath, 'filePath');
    validateIPCPayload(event, 'fs:readFile', { filePath });
    return fsp.readFile(filePath, 'utf-8');
  });

  ipcMain.handle(IPC_CHANNELS.FS_WRITE_FILE, async (event, filePath: string, content: string) => {
    validateProjectFilePath(filePath, 'filePath');
    validateSafeString(content, 'content');
    validateIPCPayload(event, 'fs:writeFile', { filePath, content });
    validateSafeString(content, 'content');
    await fsp.writeFile(filePath, content, 'utf-8');
  });

  ipcMain.handle(IPC_CHANNELS.FS_READ_BINARY, async (event, filePath: string): Promise<Buffer> => {
    validateProjectFilePath(filePath, 'filePath');
    validateIPCPayload(event, 'fs:readBinary', { filePath });
    return fsp.readFile(filePath);
  });

  ipcMain.handle(IPC_CHANNELS.FS_WRITE_BINARY, async (event, filePath: string, content: Buffer | Uint8Array) => {
    validateProjectFilePath(filePath, 'filePath');
    validateIPCPayload(event, 'fs:writeBinary', { filePath });
    await fsp.writeFile(filePath, Buffer.from(content));
  });

  ipcMain.handle(IPC_CHANNELS.FS_CREATE_DIR, async (event, dirPath: string) => {
    validateProjectFilePath(dirPath, 'dirPath');
    validateIPCPayload(event, 'fs:createDir', { dirPath });
    await fsp.mkdir(dirPath, { recursive: true });
  });

  ipcMain.handle(IPC_CHANNELS.FS_DELETE, async (event, targetPath: string, recursive = false) => {
    validateProjectFilePath(targetPath, 'targetPath');
    validateIPCPayload(event, 'fs:delete', { targetPath, recursive });
    await fsp.rm(targetPath, { recursive, force: true });
  });

  ipcMain.handle(IPC_CHANNELS.FS_RENAME, async (event, oldPath: string, newPath: string) => {
    validateProjectFilePath(oldPath, 'oldPath');
    validateProjectFilePath(newPath, 'newPath');
    validateIPCPayload(event, 'fs:rename', { oldPath, newPath });
    await fsp.rename(oldPath, newPath);
  });

  ipcMain.handle(IPC_CHANNELS.FS_COPY, async (event, source: string, destination: string) => {
    validateProjectFilePath(source, 'source');
    validateProjectFilePath(destination, 'destination');
    validateIPCPayload(event, 'fs:copy', { source, destination });
    await fsp.cp(source, destination, { recursive: true });
  });

  ipcMain.handle(IPC_CHANNELS.FS_OPEN_WITH_SYSTEM, async (event, filePath: string) => {
    validateProjectFilePath(filePath, 'filePath');
    validateIPCPayload(event, 'fs:openWithSystem', { filePath });
    await shell.openPath(filePath);
  });

  ipcMain.handle(IPC_CHANNELS.FS_SHOW_IN_FOLDER, async (event, filePath: string) => {
    validateProjectFilePath(filePath, 'filePath');
    validateIPCPayload(event, 'fs:showInFolder', { filePath });
    shell.showItemInFolder(filePath);
  });

  ipcMain.handle(IPC_CHANNELS.FS_GET_FILE_INFO, async (event, filePath: string): Promise<FileInfo> => {
    validateProjectFilePath(filePath, 'filePath');
    validateIPCPayload(event, 'fs:getFileInfo', { filePath });
    const stats = await fsp.stat(filePath);
    const name = path.basename(filePath);
    return {
      name,
      path: filePath,
      isDirectory: stats.isDirectory(),
      isFile: stats.isFile(),
      extension: stats.isFile() ? path.extname(name) : '',
      size: stats.size,
      modifiedAt: stats.mtime.toISOString(),
    };
  });

  ipcMain.handle(IPC_CHANNELS.FS_WATCH_DIR, async (event, dirPath: string) => {
    validateProjectFilePath(dirPath, 'dirPath');
    validateIPCPayload(event, 'fs:watchDir', { dirPath });
    if (fsWatchers.has(dirPath)) {
      return;
    }

    const watcher = chokidar.watch(dirPath, {
      ignored: /(^|[\\/])\../,
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 100,
        pollInterval: 50,
      },
    });

    watcher.on('add', (filePath) => {
      debouncedSendEvent(IPC_CHANNELS.FS_EVENT, {
        type: 'add',
        path: filePath,
      } as FsEvent, `add:${filePath}`);
    });

    watcher.on('addDir', (filePath) => {
      debouncedSendEvent(IPC_CHANNELS.FS_EVENT, {
        type: 'addDir',
        path: filePath,
      } as FsEvent, `addDir:${filePath}`);
    });

    watcher.on('change', (filePath) => {
      debouncedSendEvent(IPC_CHANNELS.FS_EVENT, {
        type: 'change',
        path: filePath,
      } as FsEvent, `change:${filePath}`);
    });

    watcher.on('unlink', (filePath) => {
      debouncedSendEvent(IPC_CHANNELS.FS_EVENT, {
        type: 'unlink',
        path: filePath,
      } as FsEvent, `unlink:${filePath}`);
    });

    watcher.on('unlinkDir', (filePath) => {
      debouncedSendEvent(IPC_CHANNELS.FS_EVENT, {
        type: 'unlinkDir',
        path: filePath,
      } as FsEvent, `unlinkDir:${filePath}`);
    });

    watcher.on('error', (error) => {
      logger.error(`Watcher error for ${dirPath}:`, error);
    });

    fsWatchers.set(dirPath, watcher);
    logger.info(`Started watching directory: ${dirPath}`);
  });

  ipcMain.handle(IPC_CHANNELS.FS_UNWATCH_DIR, async (event, dirPath: string) => {
    validateProjectFilePath(dirPath, 'dirPath');
    validateIPCPayload(event, 'fs:unwatchDir', { dirPath });
    const watcher = fsWatchers.get(dirPath);
    if (watcher) {
      await watcher.close();
      fsWatchers.delete(dirPath);
      logger.info(`Stopped watching directory: ${dirPath}`);
    }
  });

  ipcMain.on(IPC_CHANNELS.LOG_WRITE, async (event, entry: LogEntry) => {
    // LOG_WRITE is renderer→main; validate the payload like every other
    // inbound channel so a compromised renderer cannot inject arbitrary
    // log/file input (was the only unvalidated inbound channel).
    validateIPCPayload(event, 'log:write', entry);
    logBuffer.push(entry);
    if (logBuffer.length > MAX_BUFFER_SIZE) {
      logBuffer.shift();
    }
    await writeLogToFile(entry);
  });

  ipcMain.handle(IPC_CHANNELS.LOG_GET, async (event, filter?: { level?: string; scope?: string }) => {
    validateIPCPayload(event, 'log:get', filter ?? {});
    // Read-only, no payload validation needed
    return [...logBuffer, ...await getStoredLogs(filter)];
  });

  ipcMain.handle(IPC_CHANNELS.LOG_EXPORT, async (event) => {
    validateIPCPayload(event, 'log:export', {});
    // Read-only, no payload validation needed
    return exportAllLogs();
  });

  ipcMain.handle(IPC_CHANNELS.LOG_CLEAR, async (event) => {
    validateIPCPayload(event, 'log:clear', {});
    // Read-only, no payload validation needed
    logBuffer.length = 0;
    try {
      await fsp.unlink(LOG_FILE).catch(() => {});
    } catch {
      // Ignore
    }
  });

  ipcMain.handle(IPC_CHANNELS.AI_GENERATE_DIAGRAM, async (event, request: AiGenerateDiagramRequest) => {
    validateIPCPayload(event, 'ai:generateDiagram', request);

    const config = getProviderConfig(request.providerId);
    if (!config) {
      return {
        success: false,
        errors: [`Provider "${request.providerId}" is not configured.`],
        attempts: 0,
      };
    }

    if (!(await ensureAiConsent('diagram', request.providerId, config.baseUrl, request.language))) {
      return {
        success: false,
        consentRequired: true,
        consentFeature: 'diagram',
        consentCategories: AI_CONSENT_CATEGORIES,
        errors: [],
        attempts: 0,
      };
    }

    const controller = new AbortController();
    aiAbortControllers.set(request.requestId, controller);

    try {
      const result = await generateDiagram(
        getProvider(request.providerId),
        config,
        { prompt: request.prompt, activities: request.activities, language: request.language },
        controller.signal,
        (progressEvent) => {
          if (!event.sender.isDestroyed()) {
            event.sender.send(IPC_CHANNELS.AI_PROGRESS, progressEvent);
          }
        }
      );
      if (!result.success) {
        logger.error(`AI diagram generation failed (provider=${request.providerId}, attempts=${result.attempts})`, {
          errorCount: result.errors?.length ?? 0,
        });
      }
      const resultWithCost = result.tokenUsage
        ? { ...result, tokenUsage: { ...result.tokenUsage, costEstimate: estimateTokenCost(request.providerId, config.model, result.tokenUsage) } }
        : result;
      await recordSecurityEvent('ai_generation', {
        provider: request.providerId,
        success: resultWithCost.success,
        tokenCount: resultWithCost.tokenUsage?.total ?? 0,
      });
      return resultWithCost;
    } finally {
      aiAbortControllers.delete(request.requestId);
    }
  });

  ipcMain.handle(IPC_CHANNELS.AI_CANCEL_GENERATE, async (event, requestId: string) => {
    validateIPCPayload(event, 'ai:cancelGenerate', { requestId });
    aiAbortControllers.get(requestId)?.abort();
    aiAbortControllers.delete(requestId);
  });

  ipcMain.handle(IPC_CHANNELS.AI_SET_PROVIDER_KEY, async (event, request: AiSetProviderKeyRequest) => {
    validateIPCPayload(event, 'ai:setProviderKey', request);
    await setProviderConfig(request.provider, {
      apiKey: request.apiKey,
      baseUrl: request.baseUrl,
      model: request.model,
    });
    await recordSecurityEvent('ai_provider_key_change', { provider: request.provider, action: 'set' });
  });

  ipcMain.handle(IPC_CHANNELS.AI_REMOVE_PROVIDER_KEY, async (event, provider: AiProviderId) => {
    validateIPCPayload(event, 'ai:removeProviderKey', { provider });
    await removeProviderConfig(provider);
    await recordSecurityEvent('ai_provider_key_change', { provider, action: 'remove' });
  });

  ipcMain.handle(IPC_CHANNELS.AI_TEST_PROVIDER, async (event, provider: AiProviderId) => {
    validateIPCPayload(event, 'ai:testProvider', { provider });
    const config = getProviderConfig(provider);
    if (!config) {
      return { ok: false, error: `Provider "${provider}" is not configured.` };
    }
    try {
      await getProvider(provider).test(config);
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  ipcMain.handle(IPC_CHANNELS.AI_GET_PROVIDER_STATUS, async (event) => {
    validateIPCPayload(event, 'ai:getProviderStatus', {});
    return getProviderStatuses();
  });

  ipcMain.handle(IPC_CHANNELS.AI_COMPARE_PROVIDERS, async (event, request: AiCompareRequest) => {
    validateIPCPayload(event, 'ai:compareProviders', request);

    const remoteProvider = request.providers
      .map((providerReq) => ({ providerReq, config: getProviderConfig(providerReq.providerId) }))
      .find(({ providerReq, config }) => config && !isLocalEndpoint(providerReq.providerId, config.baseUrl));
    if (remoteProvider && !(await ensureAiConsent(
      'compare',
      remoteProvider.providerReq.providerId,
      remoteProvider.config?.baseUrl,
      remoteProvider.providerReq.language,
    ))) {
      return {
        results: [],
        requestId: request.requestId,
        consentRequired: true,
        consentFeature: 'compare',
        consentCategories: AI_CONSENT_CATEGORIES,
      };
    }

    const controllers: AbortController[] = [];
    try {
      const results = await Promise.all(
        request.providers.map(async (providerReq) => {
          const config = getProviderConfig(providerReq.providerId);
          if (!config) {
            return {
              providerId: providerReq.providerId,
              success: false,
              errors: [`Provider "${providerReq.providerId}" is not configured.`],
            };
          }
          const controller = new AbortController();
          controllers.push(controller);

          const result = await generateDiagram(
            getProvider(providerReq.providerId),
            config,
            { prompt: providerReq.prompt, activities: providerReq.activities, language: providerReq.language },
            controller.signal,
          );
          return {
            providerId: providerReq.providerId,
            ...result,
            tokenUsage: result.tokenUsage
              ? { ...result.tokenUsage, costEstimate: estimateTokenCost(providerReq.providerId, config.model, result.tokenUsage) }
              : undefined,
          };
        })
      );

      const compareResult: AiCompareResult = { results, requestId: request.requestId };
      await Promise.all(results.map((result) => recordSecurityEvent('ai_generation', {
        provider: result.providerId,
        success: result.success,
        tokenCount: result.tokenUsage?.total ?? 0,
      })));
      return compareResult;
    } finally {
      for (const controller of controllers) {
        try { controller.abort(); } catch { /* ignore */ }
      }
    }
  });

  ipcMain.handle(IPC_CHANNELS.AI_GET_SUGGESTIONS, async (event, context: SuggestionContext) => {
    validateIPCPayload(event, 'ai:getSuggestions', context);

    const providerStatuses = await getProviderStatuses();
    const configuredProvider = providerStatuses.find(p => p.configured);

    if (!configuredProvider) {
      return { suggestions: [] };
    }

    const providerConfig = getProviderConfig(configuredProvider.provider);
    if (!providerConfig) {
      return { suggestions: [] };
    }

    if (!(await ensureAiConsent('suggestions', configuredProvider.provider, providerConfig.baseUrl, context.language))) {
      return {
        suggestions: [],
        consentRequired: true,
        consentFeature: 'suggestions',
        consentCategories: AI_CONSENT_CATEGORIES,
      };
    }

    const provider = getProvider(configuredProvider.provider);

    try {
      const signal = AbortSignal.timeout(30000);
      const result = await getActivitySuggestions(provider, providerConfig, context, signal);
      return result;
    } catch (err) {
      logger.warn(`AI suggestions failed for provider ${configuredProvider.provider}`, {
        errorType: err instanceof Error ? err.name : 'unknown',
      });
      return { suggestions: [] };
    }
  });

  ipcMain.handle(IPC_CHANNELS.AI_AUTO_FILL_PARAMS, async (event, request: AiAutoFillRequest) => {
    validateIPCPayload(event, 'ai:autoFillParams', request);

    const providerStatuses = await getProviderStatuses();
    const configuredProvider = providerStatuses.find(p => p.configured);
    if (!configuredProvider) {
      return { suggestions: {} };
    }

    const providerConfig = getProviderConfig(configuredProvider.provider);
    if (!providerConfig) {
      return { suggestions: {} };
    }

    if (!(await ensureAiConsent('auto-fill', configuredProvider.provider, providerConfig.baseUrl, request.language))) {
      return {
        suggestions: {},
        consentRequired: true,
        consentFeature: 'auto-fill',
        consentCategories: AI_CONSENT_CATEGORIES,
      };
    }

    const provider = getProvider(configuredProvider.provider);

    try {
      const result = await autoFillParams(provider, providerConfig, request);
      return result;
    } catch (err) {
      logger.warn(`AI param fill failed for ${request.activityName}`, {
        errorType: err instanceof Error ? err.name : 'unknown',
      });
      return { suggestions: {} };
    }
  });

  ipcMain.handle(IPC_CHANNELS.GIT_IS_REPO, async (event) => {
    validateIPCPayload(event, 'git:isRepo', {});
    return getGitService().isGitRepo();
  });

  ipcMain.handle(IPC_CHANNELS.GIT_INIT, async (event) => {
    validateIPCPayload(event, 'git:init', {});
    return getGitService().init();
  });

  ipcMain.handle(IPC_CHANNELS.GIT_STATUS, async (event) => {
    validateIPCPayload(event, 'git:status', {});
    return getGitService().status();
  });

  ipcMain.handle(IPC_CHANNELS.GIT_STAGE, async (event, paths: string[]) => {
    validateIPCPayload(event, 'git:stage', { paths });
    paths.forEach((p) => assertRepoRelativePath(p));
    return getGitService().stage(paths);
  });

  ipcMain.handle(IPC_CHANNELS.GIT_UNSTAGE, async (event, paths: string[]) => {
    validateIPCPayload(event, 'git:unstage', { paths });
    paths.forEach((p) => assertRepoRelativePath(p));
    return getGitService().unstage(paths);
  });

  ipcMain.handle(IPC_CHANNELS.GIT_COMMIT, async (event, message: string) => {
    validateIPCPayload(event, 'git:commit', { message });
    return getGitService().commit(message);
  });

  ipcMain.handle(IPC_CHANNELS.GIT_PUSH, async (event) => {
    validateIPCPayload(event, 'git:push', {});
    return getGitService().push();
  });

  ipcMain.handle(IPC_CHANNELS.GIT_PULL, async (event) => {
    validateIPCPayload(event, 'git:pull', {});
    return getGitService().pull();
  });

  ipcMain.handle(IPC_CHANNELS.GIT_LOG, async (event, limit?: number) => {
    validateIPCPayload(event, 'git:log', limit === undefined ? {} : { limit });
    return getGitService().log(limit);
  });

  ipcMain.handle(IPC_CHANNELS.GIT_DIFF, async (event, filePath: string, staged: boolean) => {
    validateIPCPayload(event, 'git:diff', { filePath, staged });
    assertRepoRelativePath(filePath);
    return getGitService().diff(filePath, staged);
  });

  ipcMain.handle(IPC_CHANNELS.GIT_CURRENT_BRANCH, async (event) => {
    validateIPCPayload(event, 'git:currentBranch', {});
    return getGitService().currentBranch();
  });

  ipcMain.handle(IPC_CHANNELS.GIT_DISCARD_CHANGES, async (event, paths: string[]) => {
    validateIPCPayload(event, 'git:discardChanges', { paths });
    paths.forEach((p) => assertRepoRelativePath(p));
    return getGitService().discardChanges(paths);
  });

  ipcMain.handle(IPC_CHANNELS.GIT_GET_REMOTE_URL, async (event, name?: string) => {
    validateIPCPayload(event, 'git:getRemoteUrl', name === undefined ? {} : { name });
    if (name !== undefined) assertSafeRemoteArg(name);
    return getGitService().getRemoteUrl(name);
  });

  ipcMain.handle(IPC_CHANNELS.GIT_SET_REMOTE_URL, async (event, url: string, name?: string) => {
    validateIPCPayload(event, 'git:setRemoteUrl', name === undefined ? { url } : { url, name });
    assertSafeRemoteArg(url);
    if (name !== undefined) assertSafeRemoteArg(name);
    const result = await getGitService().setRemoteUrl(url, name);
    await recordSecurityEvent('git_remote_change', { remote: name ?? 'origin', urlChanged: true });
    return result;
  });

  ipcMain.handle(IPC_CHANNELS.SECRET_SET, async (event, request: { variableId: string; value: string }) => {
    validateIPCPayload(event, 'secret:set', request);
    return { secretRef: await setSecret(request.variableId, request.value) };
  });
  ipcMain.handle(IPC_CHANNELS.SECRET_GET, async (event, request: { secretRef: string }) => {
    validateIPCPayload(event, 'secret:get', request);
    return { value: getSecret(request.secretRef) };
  });
  ipcMain.handle(IPC_CHANNELS.SECRET_DELETE, async (event, request: { secretRef: string }) => {
    validateIPCPayload(event, 'secret:delete', request);
    await deleteSecret(request.secretRef);
  });
  ipcMain.handle(IPC_CHANNELS.SECRET_STATUS, async (event) => {
    validateIPCPayload(event, 'secret:status', {});
    return getSecretStoreStatus();
  });

  // Libraries management
  ipcMain.handle(IPC_CHANNELS.LIBRARIES_LIST_INSTALLED, async (event) => {
    validateIPCPayload(event, 'libraries:listInstalled', {});
    if (!pythonBridge) {
      throw new Error('Python bridge not initialized');
    }
    try {
      const result = await pythonBridge.sendRequest<{ libraries: unknown[] }>('listLibraries', {});
      return result.libraries || [];
    } catch (error) {
      logger.error('Failed to list installed libraries', error);
      throw error;
    }
  });

  ipcMain.handle(IPC_CHANNELS.LIBRARIES_GET_REGISTRY, async (event) => {
    validateIPCPayload(event, 'libraries:getRegistry', {});
    try {
      const registry = await fetchRegistry();
      return registry;
    } catch (error) {
      logger.error('Failed to fetch library registry', error);
      // Return empty registry on error
      return { libraries: [] };
    }
  });

  ipcMain.handle(IPC_CHANNELS.LIBRARIES_INSTALL, async (event, pypiPackage: string) => {
    validateIPCPayload(event, 'libraries:install', { pypiPackage });
    if (!pythonBridge) {
      throw new Error('Python bridge not initialized');
    }

    // First, verify SHA-256 hash if available in registry
    try {
      const registry = await fetchRegistry();
      const library = getLibraryFromRegistry(registry, pypiPackage);
      if (library) {
        await verifyPackageHash(library.pypi_package, library.sha256);
        logger.info(`SHA-256 verification passed for ${pypiPackage}`);
        
        // Also pass hash to Python for additional verification
        const result = await pythonBridge.sendRequest<{ success: boolean; message?: string }>('installLibrary', {
          pypiPackage: library.pypi_package,
          sha256: library.sha256
        });
        if (result.success && pythonBridge.isReady()) {
          await recordSecurityEvent('bridge_restart', { reason: 'update', package: library.pypi_package });
          // Restart bridge to reload entry points after package installation
          try {
            await pythonBridge.restart();
          } catch (restartError) {
            logger.warn(`Failed to restart bridge after install: ${restartError}`);
            // Continue with installation complete even if restart fails
          }
        }
        if (result.success) {
          await recordSecurityEvent('library_install', { package: library.pypi_package, version: library.version, action: 'install' });
        }
        return { success: result.success, message: result.message || 'Installation complete' };
      }
    } catch (error) {
      logger.error(`Failed to install library ${pypiPackage}`, error);
      throw error;
    }
  });

  ipcMain.handle(IPC_CHANNELS.LIBRARIES_UPDATE, async (event, pypiPackage: string) => {
    validateIPCPayload(event, 'libraries:update', { pypiPackage });
    if (!pythonBridge) {
      throw new Error('Python bridge not initialized');
    }

    // First, verify SHA-256 hash if available in registry
    try {
      const registry = await fetchRegistry();
      const library = getLibraryFromRegistry(registry, pypiPackage);
      if (library) {
        await verifyPackageHash(library.pypi_package, library.sha256);
        logger.info(`SHA-256 verification passed for ${pypiPackage} update`);
      } else {
        logger.warn(`Package ${pypiPackage} not found in registry, skipping hash verification`);
      }
    } catch (verifyError) {
      // Hash verification failed - block update
      logger.error(`SHA-256 verification failed for ${pypiPackage}: ${verifyError}`);
      throw new Error(`Security check failed: ${verifyError instanceof Error ? verifyError.message : String(verifyError)}`);
    }

    try {
      const registry = await fetchRegistry();
      const library = getLibraryFromRegistry(registry, pypiPackage);
      const pypiPackageForUpdate = library ? library.pypi_package : pypiPackage;
      const sha256ForUpdate = library ? library.sha256 : undefined;
      
      const result = await pythonBridge.sendRequest<{ success: boolean; message?: string }>('updateLibrary', { 
          pypiPackage: pypiPackageForUpdate,
          sha256: sha256ForUpdate
      });
      if (result.success && pythonBridge.isReady()) {
        await recordSecurityEvent('bridge_restart', { reason: 'update', package: pypiPackage });
        try {
          await pythonBridge.restart();
        } catch (restartError) {
          logger.warn(`Failed to restart bridge after update: ${restartError}`);
        }
      }
      return { success: result.success, message: result.message || 'Update complete' };
    } catch (error) {
      logger.error(`Failed to update library ${pypiPackage}`, error);
      throw error;
    }
  });

  ipcMain.handle(IPC_CHANNELS.LIBRARIES_UNINSTALL, async (event, pypiPackage: string) => {
    validateIPCPayload(event, 'libraries:uninstall', { pypiPackage });
    if (!pythonBridge) {
      throw new Error('Python bridge not initialized');
    }
    try {
      const result = await pythonBridge.sendRequest<{ success: boolean; message?: string }>('uninstallLibrary', { pypiPackage });
      if (result.success && pythonBridge.isReady()) {
        // Restart bridge to reload entry points after package removal
        try {
          await pythonBridge.restart();
        } catch (restartError) {
          logger.warn(`Failed to restart bridge after uninstall: ${restartError}`);
          // Continue with uninstall complete even if restart fails
        }
      }
      if (result.success) {
        await recordSecurityEvent('library_uninstall', { package: pypiPackage, action: 'uninstall' });
      }
      return { success: result.success, message: result.message || 'Uninstall complete' };
    } catch (error) {
      logger.error(`Failed to uninstall library ${pypiPackage}`, error);
      throw error;
    }
  });

  ipcMain.handle(IPC_CHANNELS.LIBRARIES_REFRESH, async (event) => {
    validateIPCPayload(event, 'libraries:refresh', {});
    if (!pythonBridge) {
      throw new Error('Python bridge not initialized');
    }
    try {
      const result = await pythonBridge.sendRequest<{ success: boolean; message?: string }>('refreshLibraries', {});
      return { success: result.success, message: result.message || 'Libraries refreshed' };
    } catch (error) {
      logger.error('Failed to refresh libraries', error);
      throw error;
    }
  });
}

function getGitService(): GitService {
  const root = getProjectRoot();
  if (!root) {
    throw new Error('IPC Security: project root not set — git operation blocked');
  }
  return new GitService(root);
}

/**
 * Git paths are repository-relative and resolved by git inside the repo root
 * (simple-git baseDir). Reject absolute paths and `..` traversal so a path can
 * never escape the repository; further confinement is git's own job.
 */
function assertRepoRelativePath(p: string): void {
  if (typeof p !== 'string' || p.length === 0) {
    throw new Error('Invalid git path');
  }
  if (p.includes('\x00') || /[\x00-\x1F]/.test(p)) {
    throw new Error('Invalid git path: control characters');
  }
  if (path.isAbsolute(p)) {
    throw new Error('Invalid git path: must be repository-relative');
  }
  const normalized = path.normalize(p);
  if (normalized === '..' || normalized.startsWith('..' + path.sep) || normalized.includes(path.sep + '..' + path.sep)) {
    throw new Error('Invalid git path: traversal not allowed');
  }
}

/**
 * Remote name/URL are passed by simple-git directly into the git process argv
 * (no shell), so the only real risk is flag injection via a value starting
 * with `-` (e.g. an url of `--upload-pack=...`).
 */
function assertSafeRemoteArg(value: string): void {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error('Invalid git remote argument');
  }
  if (value.includes('\x00') || /[\x00-\x1F]/.test(value)) {
    throw new Error('Invalid git remote argument: control characters');
  }
  if (value.startsWith('-')) {
    throw new Error('Invalid git remote argument: must not start with "-"');
  }
}

app.whenReady().then(async () => {
  setupIPCHandlers();
  setupSpyShortcuts();
  await initializePythonBridge();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  pythonBridge?.stop();
  fsWatchers.forEach((watcher) => watcher.close());
  fsWatchers.clear();
  debouncedSend.forEach((timeout) => clearTimeout(timeout));
  debouncedSend.clear();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  pythonBridge?.stop();
  fsWatchers.forEach((watcher) => watcher.close());
  fsWatchers.clear();
  debouncedSend.forEach((timeout) => clearTimeout(timeout));
  debouncedSend.clear();
  globalShortcut.unregisterAll();
});

app.on('will-quit', (event) => {
  // Give bridge time to drain (SIGTERM → 5s SIGKILL)
  if (pythonBridge?.state === 'stopping') {
    event.preventDefault();
    setTimeout(() => app.quit(), 3000);
  }
});
