/**
 * Secret-variable IPC handlers (extracted from main.ts, issue #828).
 */

import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../../src/types/ipc-contracts';
import { validateIPCPayload } from '../ipc-validator';
import { deleteSecret, getSecret, getSecretStoreStatus, setSecret } from '../secret-variable-store';

export function registerSecretHandlers(): void {
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
}
