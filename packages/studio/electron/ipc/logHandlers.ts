/**
 * Application log IPC handlers (extracted from main.ts, issue #828).
 */

import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../../src/types/ipc-contracts';
import type { LogEntry } from '../../src/types/ipc-contracts';
import { validateIPCPayload } from '../ipc-validator';
import {
  pushLogBuffer,
  getLogBuffer,
  clearLogBuffer,
  writeLogToFile,
  getStoredLogs,
  exportAllLogs,
  clearStoredLogs,
} from '../logging';

export function registerLogHandlers(): void {
  ipcMain.on(IPC_CHANNELS.LOG_WRITE, async (event, entry: LogEntry) => {
    // LOG_WRITE is renderer→main; validate the payload like every other
    // inbound channel so a compromised renderer cannot inject arbitrary
    // log/file input (was the only unvalidated inbound channel).
    validateIPCPayload(event, 'log:write', entry);
    pushLogBuffer(entry);
    await writeLogToFile(entry);
  });

  ipcMain.handle(IPC_CHANNELS.LOG_GET, async (event, filter?: { level?: string; scope?: string }) => {
    validateIPCPayload(event, 'log:get', filter ?? {});
    // Read-only, no payload validation needed
    return [...getLogBuffer(), ...await getStoredLogs(filter)];
  });

  ipcMain.handle(IPC_CHANNELS.LOG_EXPORT, async (event) => {
    validateIPCPayload(event, 'log:export', {});
    // Read-only, no payload validation needed
    return exportAllLogs();
  });

  ipcMain.handle(IPC_CHANNELS.LOG_CLEAR, async (event) => {
    validateIPCPayload(event, 'log:clear', {});
    // Read-only, no payload validation needed
    clearLogBuffer();
    await clearStoredLogs();
  });
}
