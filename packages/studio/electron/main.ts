import { app, BrowserWindow, ipcMain } from 'electron';
import * as path from 'path';
import { PythonBridge, BridgeState } from './python-bridge';
import { IPC_CHANNELS } from '../src/types/ipc-contracts';

let mainWindow: BrowserWindow | null = null;
let pythonBridge: PythonBridge | null = null;

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

function createWindow() {
  let preloadPath: string;
  
  if (isDev) {
    preloadPath = path.join(process.cwd(), 'dist-electron', 'electron', 'preload.js');
  } else {
    preloadPath = path.join(__dirname, 'preload.js');
  }

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 768,
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

  pythonBridge.onEvent('*', (event) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      console.log('[Main] Forwarding event to renderer:', event.type, event);
      mainWindow.webContents.send(IPC_CHANNELS.BRIDGE_EVENT, event);
    }
  });

  try {
    await pythonBridge.start();
    console.log('[Main] Python bridge initialized');
  } catch (error) {
    console.error('[Main] Failed to start Python bridge:', error);
  }
}

function setupIPCHandlers() {
  ipcMain.handle(IPC_CHANNELS.BRIDGE_IS_READY, () => {
    return pythonBridge?.isReady() ?? false;
  });

  ipcMain.handle('bridge:getState', (): BridgeState => {
    return pythonBridge?.state ?? 'stopped';
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
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  pythonBridge?.stop();
});
