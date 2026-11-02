/**
 * Spy-mode overlay window and global shortcuts (extracted from main.ts,
 * issue #828). Owns the overlay BrowserWindow lifecycle and the shared spy
 * mode state consumed by ipc/spyHandlers.ts.
 */

import { BrowserWindow, globalShortcut, screen } from 'electron';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createLogger } from '../src/utils/logger';
import { getMainWindow, isDev } from './windows';
import type { PythonBridge } from './python-bridge';

// ESM polyfill for __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const logger = createLogger('electron-spy');

let spyOverlayWindow: BrowserWindow | null = null;
let isSpyModeActive = false;
let spyMode: 'web' | 'desktop' = 'desktop';

export function isSpyActive(): boolean {
  return isSpyModeActive;
}

export function setSpyActive(active: boolean): void {
  isSpyModeActive = active;
}

export function getSpyMode(): 'web' | 'desktop' {
  return spyMode;
}

export function setSpyMode(mode: 'web' | 'desktop'): void {
  spyMode = mode;
}

export function getSpyOverlay(): BrowserWindow | null {
  return spyOverlayWindow;
}

export function closeSpyOverlay(): void {
  if (spyOverlayWindow && !spyOverlayWindow.isDestroyed()) {
    spyOverlayWindow.close();
  }
  spyOverlayWindow = null;
}

export function ensureSpyOverlay(): void {
  if (!spyOverlayWindow || spyOverlayWindow.isDestroyed()) {
    createSpyOverlay();
  }
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

export function setupSpyShortcuts(getPythonBridge: () => PythonBridge | null): void {
  globalShortcut.register('Control+Shift+S', () => {
    const mainWindow = getMainWindow();
    if (!mainWindow || mainWindow.isDestroyed()) return;

    isSpyModeActive = !isSpyModeActive;

    if (isSpyModeActive) {
      mainWindow.webContents.send('spy:modeChanged', { active: true });
      ensureSpyOverlay();
    } else {
      mainWindow.webContents.send('spy:modeChanged', { active: false });
      closeSpyOverlay();
    }
  });

  globalShortcut.register('Control+Shift+C', async () => {
    const mainWindow = getMainWindow();
    if (!isSpyModeActive || !mainWindow || mainWindow.isDestroyed()) return;

    try {
      const pos = screen.getCursorScreenPoint();
      const method = spyMode === 'desktop' ? 'captureDesktopElement' : 'captureWebElement';
      const element = await getPythonBridge()?.sendRequest(method, { x: pos.x, y: pos.y });

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
    const mainWindow = getMainWindow();
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('spy:modeChanged', { active: false });
    }
    closeSpyOverlay();
    logger.info('Spy mode stopped by Escape');
  });
}
