import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron';
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as fsp from 'node:fs/promises';
import chokidar, { type FSWatcher } from 'chokidar';
import { PythonBridge } from './python-bridge';
import { IPC_CHANNELS } from '../src/types/ipc-contracts';
import type { BridgeState, BridgeStatus, FsEvent } from '../src/types/events';
import type { OpenDialogOptions, SaveDialogOptions, FileInfo } from '../src/types/ipc-contracts';
import { createLogger } from '../src/utils/logger';
import { config } from '../src/config/app.config';

let mainWindow: BrowserWindow | null = null;
let pythonBridge: PythonBridge | null = null;
const fsWatchers: Map<string, FSWatcher> = new Map();
let bridgeEventCleanup: (() => void) | null = null;
const debouncedSend: Map<string, NodeJS.Timeout> = new Map();

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
const logger = createLogger('electron-main');
const FS_DEBOUNCE_MS = 100;

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
    preloadPath = path.join(process.cwd(), 'dist-electron', 'electron', 'preload.js');
  } else {
    preloadPath = path.join(__dirname, 'preload.js');
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
    },
    title: 'RPAForge Studio',
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
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

  ipcMain.handle(IPC_CHANNELS.BRIDGE_SEND, async (_, method: string, params: unknown) => {
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

  ipcMain.handle(IPC_CHANNELS.ENGINE_RUN_PROCESS, async (_, source: string, name?: string, sourcemap?: Record<number, string>) => {
    return pythonBridge?.sendRequest('runProcess', { source, name, sourcemap });
  });

  ipcMain.handle(IPC_CHANNELS.ENGINE_RUN_FILE, async (_, filePath: string) => {
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

  ipcMain.handle(IPC_CHANNELS.DEBUGGER_SET_BREAKPOINT, async (_, file: string, line: number, condition?: string) => {
    return pythonBridge?.sendRequest('setBreakpoint', { file, line, condition });
  });

  ipcMain.handle(IPC_CHANNELS.DEBUGGER_REMOVE_BREAKPOINT, async (_, id: string) => {
    return pythonBridge?.sendRequest('removeBreakpoint', { id });
  });

  ipcMain.handle(IPC_CHANNELS.DEBUGGER_TOGGLE_BREAKPOINT, async (_, id: string) => {
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

  ipcMain.handle(IPC_CHANNELS.DIALOG_SHOW_OPEN, async (_, options: OpenDialogOptions) => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      title: options.title,
      defaultPath: options.defaultPath,
      filters: options.filters,
      properties: options.properties as ('openFile' | 'openDirectory' | 'multiSelections')[],
    });
    return { canceled: result.canceled, filePaths: result.filePaths };
  });

  ipcMain.handle(IPC_CHANNELS.DIALOG_SHOW_SAVE, async (_, options: SaveDialogOptions) => {
    const result = await dialog.showSaveDialog(mainWindow!, {
      title: options.title,
      defaultPath: options.defaultPath,
      filters: options.filters,
    });
    return { canceled: result.canceled, filePath: result.filePath };
  });

  ipcMain.handle(IPC_CHANNELS.FS_PATH_EXISTS, async (_, filePath: string) => {
    return fs.existsSync(filePath);
  });

  ipcMain.handle(IPC_CHANNELS.FS_READ_DIR, async (_, dirPath: string): Promise<FileInfo[]> => {
    const entries = await fsp.readdir(dirPath, { withFileTypes: true });
    return entries.map((entry) => ({
      name: entry.name,
      path: path.join(dirPath, entry.name),
      isDirectory: entry.isDirectory(),
      isFile: entry.isFile(),
      extension: entry.isFile() ? path.extname(entry.name) : '',
    }));
  });

  ipcMain.handle(IPC_CHANNELS.FS_READ_FILE, async (_, filePath: string): Promise<string> => {
    return fsp.readFile(filePath, 'utf-8');
  });

  ipcMain.handle(IPC_CHANNELS.FS_WRITE_FILE, async (_, filePath: string, content: string) => {
    await fsp.writeFile(filePath, content, 'utf-8');
  });

  ipcMain.handle(IPC_CHANNELS.FS_CREATE_DIR, async (_, dirPath: string) => {
    await fsp.mkdir(dirPath, { recursive: true });
  });

  ipcMain.handle(IPC_CHANNELS.FS_DELETE, async (_, targetPath: string, recursive = false) => {
    await fsp.rm(targetPath, { recursive, force: true });
  });

  ipcMain.handle(IPC_CHANNELS.FS_RENAME, async (_, oldPath: string, newPath: string) => {
    await fsp.rename(oldPath, newPath);
  });

  ipcMain.handle(IPC_CHANNELS.FS_COPY, async (_, source: string, destination: string) => {
    await fsp.cp(source, destination, { recursive: true });
  });

  ipcMain.handle(IPC_CHANNELS.FS_OPEN_WITH_SYSTEM, async (_, filePath: string) => {
    await shell.openPath(filePath);
  });

  ipcMain.handle(IPC_CHANNELS.FS_SHOW_IN_FOLDER, async (_, filePath: string) => {
    shell.showItemInFolder(filePath);
  });

  ipcMain.handle(IPC_CHANNELS.FS_GET_FILE_INFO, async (_, filePath: string): Promise<FileInfo> => {
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

  ipcMain.handle(IPC_CHANNELS.FS_WATCH_DIR, async (_, dirPath: string) => {
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

  ipcMain.handle(IPC_CHANNELS.FS_UNWATCH_DIR, async (_, dirPath: string) => {
    const watcher = fsWatchers.get(dirPath);
    if (watcher) {
      await watcher.close();
      fsWatchers.delete(dirPath);
      logger.info(`Stopped watching directory: ${dirPath}`);
    }
  });
}

app.whenReady().then(async () => {
  setupIPCHandlers();
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
});
