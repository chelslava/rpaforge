/**
 * App update IPC handlers (issue #819).
 *
 * Thin validated proxies over the AppUpdateManager; the manager itself
 * pushes state changes to the renderer over APP_UPDATE_EVENT.
 */

import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../../src/types/ipc-contracts';
import { validateIPCPayload } from '../ipc-validator';
import type { AppUpdateManager } from '../appUpdate';

export function registerAppUpdateHandlers(manager: AppUpdateManager): void {
  ipcMain.handle(IPC_CHANNELS.APP_UPDATE_CHECK, async (event) => {
    validateIPCPayload(event, 'app:updateCheck', {});
    return manager.checkForUpdates();
  });

  ipcMain.handle(IPC_CHANNELS.APP_UPDATE_INSTALL, async (event) => {
    validateIPCPayload(event, 'app:updateInstall', {});
    manager.installUpdate();
  });

  ipcMain.handle(IPC_CHANNELS.APP_UPDATE_SET_CHANNEL, async (event, request: { channel: 'stable' | 'pre-release' }) => {
    validateIPCPayload(event, 'app:updateSetChannel', request);
    return manager.setChannel(request.channel);
  });

  ipcMain.handle(IPC_CHANNELS.APP_UPDATE_GET_STATE, async (event) => {
    validateIPCPayload(event, 'app:updateGetState', {});
    return manager.getState();
  });
}
