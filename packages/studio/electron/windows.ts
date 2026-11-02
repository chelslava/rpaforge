/**
 * Main application window creation (extracted from main.ts, issue #828).
 *
 * Owns the BrowserWindow lifecycle: CSP injection, external-link policy,
 * navigation allow-list, and dev/prod entry-point loading.
 */

import { app, BrowserWindow, shell } from 'electron';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createLogger } from '../src/utils/logger';
import { config } from '../src/config/app.config';

// ESM polyfill for __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const logger = createLogger('electron-windows');

export const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
// Explicit opt-in for opening DevTools in a production build (e.g. to debug a
// startup/load failure). Leaks renderer internals, so it must not be automatic.
export const enableProdDevTools = process.env.RPAFORGE_DEVTOOLS === '1';

let mainWindow: BrowserWindow | null = null;

export function getMainWindow(): BrowserWindow | null {
  return mainWindow;
}

export function setMainWindow(window: BrowserWindow | null): void {
  mainWindow = window;
}

export function isAllowedNavigation(url: string, devServerUrl?: string): boolean {
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

export function createWindow(): void {
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
