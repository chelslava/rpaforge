import { app, BrowserWindow, ipcMain, dialog, shell, globalShortcut, screen } from 'electron';
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as fsp from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import chokidar, { type FSWatcher } from 'chokidar';
import { PythonBridge } from './python-bridge';
import { IPC_CHANNELS } from '../src/types/ipc-contracts';
import type { LogEntry, OpenDialogOptions, SaveDialogOptions, FileInfo } from '../src/types/ipc-contracts';
import type { BridgeState, BridgeStatus, FsEvent } from '../src/types/events';
import { createLogger } from '../src/utils/logger';
import { config } from '../src/config/app.config';
import { validateMethodName, validateSafeString, validateFilePath, validateIPCPayload, setProjectRoot, getProjectRoot, validateProjectFilePath } from './ipc-validator';

// ESM polyfill for __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow: BrowserWindow | null = null;
let pythonBridge: PythonBridge | null = null;
const fsWatchers: Map<string, FSWatcher> = new Map();
let bridgeEventCleanup: (() => void) | null = null;
const debouncedSend: Map<string, NodeJS.Timeout> = new Map();
let spyOverlayWindow: BrowserWindow | null = null;
let isSpyModeActive = false;
let spyMode: 'web' | 'desktop' = 'desktop';

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
const logger = createLogger('electron-main');
const FS_DEBOUNCE_MS = 100;

const LOG_DIR = path.join(app.getPath('userData'), 'logs');
const LOG_FILE = path.join(LOG_DIR, 'app.log');
const MAX_LOG_SIZE = 5 * 1024 * 1024;
const MAX_LOG_FILES = 5;
const logBuffer: LogEntry[] = [];
const MAX_BUFFER_SIZE = 100;

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
      ].join('; ')
    : [
        "default-src 'self'",
        "script-src 'self'",
        "style-src 'self' 'unsafe-inline'",
        "style-src-elem 'self' 'unsafe-inline'",
        "worker-src 'self' blob:",
        "img-src 'self' data:",
        "font-src 'self'",
        "connect-src 'self' http://localhost:* ws://localhost:*",
        "frame-ancestors 'none'",
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

  if (isDev) {
    const devServerUrl = process.env.VITE_DEV_SERVER_URL ?? 'http://127.0.0.1:5173';
    mainWindow.loadURL(devServerUrl);
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
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

async function initializePythonBridge() {
  pythonBridge = new PythonBridge();

  if (bridgeEventCleanup) {
    bridgeEventCleanup();
    bridgeEventCleanup = null;
  }

  bridgeEventCleanup = pythonBridge.onEvent('*', (event) => {
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
  ipcMain.handle(IPC_CHANNELS.BRIDGE_IS_READY, () => {
    return pythonBridge?.isReady() ?? false;
  });

  ipcMain.handle(IPC_CHANNELS.BRIDGE_GET_STATE, (): BridgeState => {
    return pythonBridge?.state ?? 'stopped';
  });

  ipcMain.handle(IPC_CHANNELS.BRIDGE_GET_STATUS, (): BridgeStatus => {
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

  ipcMain.handle(IPC_CHANNELS.ENGINE_PING, async () => {
    return pythonBridge?.sendRequest('ping', {});
  });

  ipcMain.handle(IPC_CHANNELS.ENGINE_GET_CAPABILITIES, async () => {
    return pythonBridge?.sendRequest('getCapabilities', {});
  });

  ipcMain.handle(IPC_CHANNELS.ENGINE_RUN_PROCESS, async (event, source: string, name?: string, sourcemap?: Record<number, string>) => {
    validateSafeString(source, 'source');
    if (name) validateSafeString(name, 'name');
    validateIPCPayload(event, 'engine:runProcess', { source, name, sourcemap });
    return pythonBridge?.sendRequest('runProcess', { source, name, sourcemap });
  });

  ipcMain.handle(IPC_CHANNELS.ENGINE_RUN_FILE, async (event, filePath: string) => {
    validateFilePath(filePath, 'filePath');
    validateIPCPayload(event, 'engine:runFile', { path: filePath });
    return pythonBridge?.sendRequest('runFile', { path: filePath });
  });

  ipcMain.handle(IPC_CHANNELS.ENGINE_STOP_PROCESS, async () => {
    return pythonBridge?.sendRequest('stopProcess', {});
  });

  ipcMain.handle(IPC_CHANNELS.ENGINE_PAUSE_PROCESS, async () => {
    return pythonBridge?.sendRequest('pauseProcess', {});
  });

  ipcMain.handle(IPC_CHANNELS.ENGINE_RESUME_PROCESS, async () => {
    return pythonBridge?.sendRequest('resumeProcess', {});
  });

  ipcMain.handle(IPC_CHANNELS.ENGINE_GET_ACTIVITIES, async () => {
    return pythonBridge?.sendRequest('getActivities', {});
  });

  ipcMain.handle(IPC_CHANNELS.SPY_CAPTURE_WEB, async (event, x: number, y: number) => {
    validateIPCPayload(event, 'spy:captureWeb', { x, y });
    return pythonBridge?.sendRequest('captureWebElement', { x, y });
  });

  ipcMain.handle(IPC_CHANNELS.SPY_CAPTURE_DESKTOP, async (event, x: number, y: number) => {
    validateIPCPayload(event, 'spy:captureDesktop', { x, y });
    return pythonBridge?.sendRequest('captureDesktopElement', { x, y });
  });

  ipcMain.handle('spy_start', (_, mode: 'web' | 'desktop') => {
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

  ipcMain.handle('spy_stop', () => {
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

  ipcMain.handle('spy:clickAtPosition', async (_, x: number, y: number) => {
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

  ipcMain.handle('spy:getElementAtMouse', async (_, mode: 'web' | 'desktop') => {
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

  ipcMain.handle('spy:getMousePosition', () => {
    const pos = screen.getCursorScreenPoint();
    return { x: pos.x, y: pos.y };
  });

  ipcMain.handle('spy:getElementAtPosition', async (_, x: number, y: number, mode: 'web' | 'desktop') => {
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

  ipcMain.handle(IPC_CHANNELS.DEBUGGER_GET_BREAKPOINTS, async () => {
    return pythonBridge?.sendRequest('getBreakpoints', {});
  });

  ipcMain.handle(IPC_CHANNELS.DEBUGGER_STEP_OVER, async () => {
    return pythonBridge?.sendRequest('stepOver', {});
  });

  ipcMain.handle(IPC_CHANNELS.DEBUGGER_STEP_INTO, async () => {
    return pythonBridge?.sendRequest('stepInto', {});
  });

  ipcMain.handle(IPC_CHANNELS.DEBUGGER_STEP_OUT, async () => {
    return pythonBridge?.sendRequest('stepOut', {});
  });

  ipcMain.handle(IPC_CHANNELS.DEBUGGER_CONTINUE, async () => {
    return pythonBridge?.sendRequest('continue', {});
  });

  ipcMain.handle(IPC_CHANNELS.DEBUGGER_GET_VARIABLES, async () => {
    return pythonBridge?.sendRequest('getVariables', {});
  });

  ipcMain.handle(IPC_CHANNELS.DEBUGGER_GET_CALL_STACK, async () => {
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

  ipcMain.handle(IPC_CHANNELS.EDITOR_FORMAT_CODE, async (_, code: string) => {
    validateSafeString(code, 'code');
    return pythonBridge?.sendRequest('formatCode', { code });
  });

  ipcMain.handle(IPC_CHANNELS.EDITOR_VALIDATE_CODE, async (_, code: string) => {
    validateSafeString(code, 'code');
    return pythonBridge?.sendRequest('validateCode', { code });
  });

  ipcMain.handle(IPC_CHANNELS.FS_SET_PROJECT_ROOT, async (_, rootPath: string) => {
    validateSafeString(rootPath, 'rootPath');
    validateFilePath(rootPath, 'rootPath');

    if (!fs.statSync(rootPath).isDirectory()) {
      throw new Error('Project root must be a directory');
    }

    setProjectRoot(rootPath);
    logger.info(`Project root set to: ${rootPath}`);
  });

  ipcMain.handle(IPC_CHANNELS.FS_PATH_EXISTS, async (_, filePath: string) => {
    validateProjectFilePath(filePath, 'filePath');
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

  ipcMain.on(IPC_CHANNELS.LOG_WRITE, async (_, entry: LogEntry) => {
    logBuffer.push(entry);
    if (logBuffer.length > MAX_BUFFER_SIZE) {
      logBuffer.shift();
    }
    await writeLogToFile(entry);
  });

  ipcMain.handle(IPC_CHANNELS.LOG_GET, async (_, filter?: { level?: string; scope?: string }) => {
    return [...logBuffer, ...await getStoredLogs(filter)];
  });

  ipcMain.handle(IPC_CHANNELS.LOG_EXPORT, async () => {
    return exportAllLogs();
  });

  ipcMain.handle(IPC_CHANNELS.LOG_CLEAR, async () => {
    logBuffer.length = 0;
    try {
      await fsp.unlink(LOG_FILE).catch(() => {});
    } catch {
      // Ignore
    }
  });
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
