import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let mainWindow: BrowserWindow | null = null;

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
    icon: path.join(__dirname, 'assets', 'icon.png'),
  });

  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

import { PythonBridge } from './python-bridge';

const pythonBridge = new PythonBridge();

ipcMain.handle('engine:run', async (_, data) => {
  return pythonBridge.send('run', data);
});

ipcMain.handle('engine:stop', async () => {
  return pythonBridge.send('stop', {});
});

ipcMain.handle('debugger:setBreakpoint', async (_, data) => {
  return pythonBridge.send('setBreakpoint', data);
});

ipcMain.handle('debugger:stepOver', async () => {
  return pythonBridge.send('stepOver', {});
});

ipcMain.handle('debugger:stepInto', async () => {
  return pythonBridge.send('stepInto', {});
});

ipcMain.handle('debugger:stepOut', async () => {
  return pythonBridge.send('stepOut', {});
});

ipcMain.handle('debugger:continue', async () => {
  return pythonBridge.send('continue', {});
});

ipcMain.handle('debugger:getVariables', async () => {
  return pythonBridge.send('getVariables', {});
});

ipcMain.handle('debugger:getCallStack', async () => {
  return pythonBridge.send('getCallStack', {});
});
