/**
 * Bridge status/control IPC handlers (extracted from main.ts, issue #828).
 */

import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../../src/types/ipc-contracts';
import { validateMethodName, validateIPCPayload } from '../ipc-validator';
import { recordSecurityEvent } from '../audit/securityAudit';
import { getDefaultBridgeStatus } from '../bridgeLauncher';
import type { IpcContext } from './context';

export function registerBridgeHandlers(ctx: IpcContext): void {
  ipcMain.handle(IPC_CHANNELS.BRIDGE_IS_READY, async (event) => {
    validateIPCPayload(event, 'bridge:isReady', {});
    // Read-only, no payload validation needed
    return ctx.getPythonBridge()?.isReady() ?? false;
  });

  ipcMain.handle(IPC_CHANNELS.BRIDGE_GET_STATE, async (event) => {
    validateIPCPayload(event, 'bridge:getState', {});
    // Read-only, no payload validation needed
    return ctx.getPythonBridge()?.state ?? 'stopped';
  });

  ipcMain.handle(IPC_CHANNELS.BRIDGE_GET_STATUS, async (event) => {
    validateIPCPayload(event, 'bridge:getStatus', {});
    // Read-only, no payload validation needed
    return ctx.getPythonBridge()?.getStatus() ?? getDefaultBridgeStatus();
  });

  ipcMain.handle(IPC_CHANNELS.BRIDGE_SEND, async (event, method: string, params: unknown) => {
    validateMethodName(method);
    validateIPCPayload(event, 'bridge:send', { method, params });
    const pythonBridge = ctx.getPythonBridge();
    if (!pythonBridge?.isOperational()) {
      throw new Error(`Python bridge not operational (state: ${pythonBridge?.state ?? 'null'})`);
    }
    return pythonBridge.sendRequest(method, params as Record<string, unknown>);
  });

  ipcMain.handle(IPC_CHANNELS.BRIDGE_RESTART, async (event) => {
    validateIPCPayload(event, 'bridge:restart', {});
    await recordSecurityEvent('bridge_restart', { reason: 'user-initiated' });
    await ctx.restartBridge();
    return ctx.getPythonBridge()?.getStatus() ?? getDefaultBridgeStatus();
  });
}
