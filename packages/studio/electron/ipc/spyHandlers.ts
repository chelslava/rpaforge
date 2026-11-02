/**
 * Spy-mode IPC handlers (extracted from main.ts, issue #828).
 *
 * Element capture requests proxy through the Python bridge; mode state and
 * the overlay window live in spyOverlay.ts.
 */

import { ipcMain, screen } from 'electron';
import { IPC_CHANNELS } from '../../src/types/ipc-contracts';
import { validateIPCPayload } from '../ipc-validator';
import { createLogger } from '../../src/utils/logger';
import {
  ensureSpyOverlay,
  closeSpyOverlay,
  isSpyActive,
  setSpyActive,
  getSpyMode,
  setSpyMode,
  getSpyOverlay,
} from '../spyOverlay';
import type { IpcContext } from './context';

const logger = createLogger('ipc-spy');

export function registerSpyHandlers(ctx: IpcContext): void {
  ipcMain.handle(IPC_CHANNELS.SPY_CAPTURE_WEB, async (event, x: number, y: number) => {
    validateIPCPayload(event, 'spy:captureWeb', { x, y });
    return ctx.getPythonBridge()?.sendRequest('captureWebElement', { x, y });
  });

  ipcMain.handle(IPC_CHANNELS.SPY_CAPTURE_DESKTOP, async (event, x: number, y: number) => {
    validateIPCPayload(event, 'spy:captureDesktop', { x, y });
    return ctx.getPythonBridge()?.sendRequest('captureDesktopElement', { x, y });
  });

  ipcMain.handle(IPC_CHANNELS.SPY_START, (event, mode: 'web' | 'desktop') => {
    validateIPCPayload(event, 'spy_start', { mode });
    setSpyMode(mode);
    setSpyActive(true);
    ensureSpyOverlay();
    const mainWindow = ctx.getMainWindow();
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('spy:modeChanged', { active: true, mode });
    }
    logger.info(`Spy mode started: ${mode}`);
    return { success: true };
  });

  ipcMain.handle(IPC_CHANNELS.SPY_STOP, (event) => {
    validateIPCPayload(event, 'spy_stop', {});
    setSpyActive(false);
    closeSpyOverlay();
    const mainWindow = ctx.getMainWindow();
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('spy:modeChanged', { active: false });
    }
    logger.info('Spy mode stopped');
    return { success: true };
  });

  ipcMain.handle(IPC_CHANNELS.SPY_CLICK_AT_POSITION, async (event, x: number, y: number) => {
    validateIPCPayload(event, 'spy:clickAtPosition', { coordinates: { x, y } });
    if (!isSpyActive()) {
      return { success: false, error: 'Spy mode not active' };
    }

    try {
      const mode = getSpyMode();
      const method = mode === 'desktop' ? 'captureDesktopElement' : 'captureWebElement';
      const element = await ctx.getPythonBridge()?.sendRequest(method, { x, y });

      if (element) {
        const mainWindow = ctx.getMainWindow();
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('spy:elementCaptured', { element, mode });
        }
        const overlay = getSpyOverlay();
        if (overlay && !overlay.isDestroyed()) {
          overlay.webContents.send('spy:elementCaptured', { element, mode });
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
    if (!isSpyActive()) {
      return null;
    }

    try {
      const pos = screen.getCursorScreenPoint();
      const method = mode === 'desktop' ? 'captureDesktopElement' : 'captureWebElement';
      return await ctx.getPythonBridge()?.sendRequest(method, { x: pos.x, y: pos.y });
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
      return await ctx.getPythonBridge()?.sendRequest(method, { x, y });
    } catch (err) {
      logger.error('Failed to get element at position', err);
      return null;
    }
  });
}
