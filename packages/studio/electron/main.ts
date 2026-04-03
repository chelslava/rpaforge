import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import { PythonBridge } from './python-bridge.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let mainWindow: BrowserWindow | null = null;
let pythonBridge: PythonBridge | null = null;

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 768,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    title: 'RPAForge Studio',
  });

  if (isDev && process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', '..', 'dist', 'index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

async function initializePythonBridge() {
  pythonBridge = new PythonBridge();

  pythonBridge.onEvent('*', (event) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('bridge:event', event);
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
  ipcMain.handle('bridge:isReady', () => {
    return pythonBridge?.isReady() ?? false;
  });

  ipcMain.handle('bridge:send', async (_, method: string, params: unknown) => {
    if (!pythonBridge?.isReady()) {
      throw new Error('Python bridge not ready');
    }
    return pythonBridge.sendRequest(method, params as Record<string, unknown>);
  });

  ipcMain.handle('engine:ping', async () => {
    return pythonBridge?.sendRequest('ping', {});
  });

  ipcMain.handle('engine:getCapabilities', async () => {
    return pythonBridge?.sendRequest('getCapabilities', {});
  });

  ipcMain.handle('engine:runProcess', async (_, source: string, name?: string) => {
    return pythonBridge?.sendRequest('runProcess', { source, name });
  });

  ipcMain.handle('engine:runFile', async (_, filePath: string) => {
    return pythonBridge?.sendRequest('runFile', { path: filePath });
  });

  ipcMain.handle('engine:stopProcess', async () => {
    return pythonBridge?.sendRequest('stopProcess', {});
  });

  ipcMain.handle('engine:pauseProcess', async () => {
    return pythonBridge?.sendRequest('pauseProcess', {});
  });

  ipcMain.handle('engine:resumeProcess', async () => {
    return pythonBridge?.sendRequest('resumeProcess', {});
  });

  ipcMain.handle('engine:getActivities', async () => {
    return pythonBridge?.sendRequest('getActivities', {});
  });

  ipcMain.handle('debugger:setBreakpoint', async (_, file: string, line: number, condition?: string) => {
    return pythonBridge?.sendRequest('setBreakpoint', { file, line, condition });
  });

  ipcMain.handle('debugger:removeBreakpoint', async (_, id: string) => {
    return pythonBridge?.sendRequest('removeBreakpoint', { id });
  });

  ipcMain.handle('debugger:toggleBreakpoint', async (_, id: string) => {
    return pythonBridge?.sendRequest('toggleBreakpoint', { id });
  });

  ipcMain.handle('debugger:getBreakpoints', async () => {
    return pythonBridge?.sendRequest('getBreakpoints', {});
  });

  ipcMain.handle('debugger:stepOver', async () => {
    return pythonBridge?.sendRequest('stepOver', {});
  });

  ipcMain.handle('debugger:stepInto', async () => {
    return pythonBridge?.sendRequest('stepInto', {});
  });

  ipcMain.handle('debugger:stepOut', async () => {
    return pythonBridge?.sendRequest('stepOut', {});
  });

  ipcMain.handle('debugger:continue', async () => {
    return pythonBridge?.sendRequest('continue', {});
  });

  ipcMain.handle('debugger:getVariables', async () => {
    return pythonBridge?.sendRequest('getVariables', {});
  });

  ipcMain.handle('debugger:getCallStack', async () => {
    return pythonBridge?.sendRequest('getCallStack', {});
  });
}

app.whenReady().then(async () => {
  createWindow();
  setupIPCHandlers();
  await initializePythonBridge();

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
