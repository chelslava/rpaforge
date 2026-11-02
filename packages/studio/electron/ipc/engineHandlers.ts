/**
 * Engine / debugger / editor IPC handlers (extracted from main.ts,
 * issue #828). Thin validated proxies over Python bridge requests.
 */

import { ipcMain, dialog } from 'electron';import { IPC_CHANNELS } from '../../src/types/ipc-contracts';
import type { OpenDialogOptions, SaveDialogOptions } from '../../src/types/ipc-contracts';
import {
  validateSafeString,
  validateFilePath,
  validateIPCPayload,
} from '../ipc-validator';
import { recordSecurityEvent, anonymize } from '../audit/securityAudit';
import type { IpcContext } from './context';

export function registerEngineHandlers(ctx: IpcContext): void {
  ipcMain.handle(IPC_CHANNELS.ENGINE_PING, async (event) => {
    validateIPCPayload(event, 'engine:ping', {});
    // Read-only, no payload validation needed
    return ctx.getPythonBridge()?.sendRequest('ping', {});
  });

  ipcMain.handle(IPC_CHANNELS.ENGINE_GET_CAPABILITIES, async (event) => {
    validateIPCPayload(event, 'engine:getCapabilities', {});
    return ctx.getPythonBridge()?.sendRequest('getCapabilities', {});
  });

  ipcMain.handle(IPC_CHANNELS.ENGINE_RUN_PROCESS, async (event, source: string, name?: string, sourcemap?: Record<number, string>) => {
    validateSafeString(source, 'source');
    if (name) validateSafeString(name, 'name');
    validateIPCPayload(event, 'engine:runProcess', { source, name, sourcemap });
    await recordSecurityEvent('process_execution', {
      action: 'start',
      processNameHash: anonymize(name ?? 'inline-process'),
      userHash: anonymize(process.env.USERNAME ?? process.env.USER ?? 'unknown'),
    });
    try {
      const result = await ctx.getPythonBridge()?.sendRequest('runProcess', { source, name, sourcemap });
      await recordSecurityEvent('process_execution', {
        action: 'stop',
        processNameHash: anonymize(name ?? 'inline-process'),
        status: 'completed',
      });
      return result;
    } catch (error) {
      await recordSecurityEvent('process_execution', {
        action: 'stop',
        processNameHash: anonymize(name ?? 'inline-process'),
        status: 'failed',
      });
      throw error;
    }
  });

  ipcMain.handle(IPC_CHANNELS.ENGINE_RUN_FILE, async (event, filePath: string) => {
    validateFilePath(filePath, 'filePath');
    validateIPCPayload(event, 'engine:runFile', { path: filePath });
    await recordSecurityEvent('process_execution', {
      action: 'start',
      processNameHash: anonymize(path.basename(filePath)),
      userHash: anonymize(process.env.USERNAME ?? process.env.USER ?? 'unknown'),
    });
    try {
      const result = await ctx.getPythonBridge()?.sendRequest('runFile', { path: filePath });
      await recordSecurityEvent('process_execution', {
        action: 'stop',
        processNameHash: anonymize(path.basename(filePath)),
        status: 'completed',
      });
      return result;
    } catch (error) {
      await recordSecurityEvent('process_execution', {
        action: 'stop',
        processNameHash: anonymize(path.basename(filePath)),
        status: 'failed',
      });
      throw error;
    }
  });

  ipcMain.handle(IPC_CHANNELS.ENGINE_STOP_PROCESS, async (event) => {
    validateIPCPayload(event, 'engine:stopProcess', {});
    const result = await ctx.getPythonBridge()?.sendRequest('stopProcess', {});
    await recordSecurityEvent('process_execution', { action: 'stop', status: 'user-stopped' });
    return result;
  });

  ipcMain.handle(IPC_CHANNELS.ENGINE_PAUSE_PROCESS, async (event) => {
    validateIPCPayload(event, 'engine:pauseProcess', {});
    return ctx.getPythonBridge()?.sendRequest('pauseProcess', {});
  });

  ipcMain.handle(IPC_CHANNELS.ENGINE_RESUME_PROCESS, async (event) => {
    validateIPCPayload(event, 'engine:resumeProcess', {});
    return ctx.getPythonBridge()?.sendRequest('resumeProcess', {});
  });

  ipcMain.handle(IPC_CHANNELS.ENGINE_GET_ACTIVITIES, async (event) => {
    validateIPCPayload(event, 'engine:getActivities', {});
    return ctx.getPythonBridge()?.sendRequest('getActivities', {});
  });

  ipcMain.handle(IPC_CHANNELS.ENGINE_CHECK_STATEFUL_LIBRARIES, async (_event, diagram: unknown) => {
    validateIPCPayload(_event, 'engine:checkStatefulLibraries', { diagram });
    const statefulLibraries = ctx.getPythonBridge()?.sendRequest('checkStatefulLibraries', { diagram });
    return statefulLibraries;
  });

  ipcMain.handle(IPC_CHANNELS.DEBUGGER_SET_BREAKPOINT, async (event, file: string, line: number, condition?: string) => {
    validateFilePath(file, 'file');
    validateIPCPayload(event, 'debugger:setBreakpoint', { file, line, condition });
    return ctx.getPythonBridge()?.sendRequest('setBreakpoint', { file, line, condition });
  });

  ipcMain.handle(IPC_CHANNELS.DEBUGGER_REMOVE_BREAKPOINT, async (event, id: string) => {
    validateSafeString(id, 'id');
    validateIPCPayload(event, 'debugger:removeBreakpoint', { id });
    return ctx.getPythonBridge()?.sendRequest('removeBreakpoint', { id });
  });

  ipcMain.handle(IPC_CHANNELS.DEBUGGER_TOGGLE_BREAKPOINT, async (event, id: string) => {
    validateSafeString(id, 'id');
    validateIPCPayload(event, 'debugger:toggleBreakpoint', { id });
    return ctx.getPythonBridge()?.sendRequest('toggleBreakpoint', { id });
  });

  ipcMain.handle(IPC_CHANNELS.DEBUGGER_GET_BREAKPOINTS, async (event) => {
    validateIPCPayload(event, 'debugger:getBreakpoints', {});
    return ctx.getPythonBridge()?.sendRequest('getBreakpoints', {});
  });

  ipcMain.handle(IPC_CHANNELS.DEBUGGER_STEP_OVER, async (event) => {
    validateIPCPayload(event, 'debugger:stepOver', {});
    return ctx.getPythonBridge()?.sendRequest('stepOver', {});
  });

  ipcMain.handle(IPC_CHANNELS.DEBUGGER_STEP_INTO, async (event) => {
    validateIPCPayload(event, 'debugger:stepInto', {});
    return ctx.getPythonBridge()?.sendRequest('stepInto', {});
  });

  ipcMain.handle(IPC_CHANNELS.DEBUGGER_STEP_OUT, async (event) => {
    validateIPCPayload(event, 'debugger:stepOut', {});
    return ctx.getPythonBridge()?.sendRequest('stepOut', {});
  });

  ipcMain.handle(IPC_CHANNELS.DEBUGGER_CONTINUE, async (event) => {
    validateIPCPayload(event, 'debugger:continue', {});
    return ctx.getPythonBridge()?.sendRequest('continue', {});
  });

  ipcMain.handle(IPC_CHANNELS.DEBUGGER_GET_VARIABLES, async (event) => {
    validateIPCPayload(event, 'debugger:getVariables', {});
    return ctx.getPythonBridge()?.sendRequest('getVariables', {});
  });

  ipcMain.handle(
    IPC_CHANNELS.DEBUGGER_EVALUATE_EXPRESSION,
    async (event, params: { expression: string }) => {
      validateIPCPayload(event, 'debugger:evaluateExpression', params);
      return ctx.getPythonBridge()?.sendRequest('evaluateExpression', params);
    },
  );

  ipcMain.handle(IPC_CHANNELS.DEBUGGER_GET_CALL_STACK, async (event) => {
    validateIPCPayload(event, 'debugger:getCallStack', {});
    return ctx.getPythonBridge()?.sendRequest('getCallStack', {});
  });

  ipcMain.handle(IPC_CHANNELS.DIALOG_SHOW_OPEN, async (event, options: OpenDialogOptions) => {
    validateIPCPayload(event, 'dialog:showOpen', options);
    const mainWindow = ctx.getMainWindow();
    if (!mainWindow || mainWindow.isDestroyed()) {
      throw new Error('Main window is not available');
    }
    const result = await dialog.showOpenDialog(mainWindow, {
      title: options.title,
      defaultPath: options.defaultPath,
      filters: options.filters,
      properties: options.properties as ('openFile' | 'openDirectory' | 'multiSelections')[],
    });
    return { canceled: result.canceled, filePaths: result.filePaths };
  });

  ipcMain.handle(IPC_CHANNELS.DIALOG_SHOW_SAVE, async (event, options: SaveDialogOptions) => {
    validateIPCPayload(event, 'dialog:showSave', options);
    const mainWindow = ctx.getMainWindow();
    if (!mainWindow || mainWindow.isDestroyed()) {
      throw new Error('Main window is not available');
    }
    const result = await dialog.showSaveDialog(mainWindow, {
      title: options.title,
      defaultPath: options.defaultPath,
      filters: options.filters,
    });
    return { canceled: result.canceled, filePath: result.filePath };
  });

  ipcMain.handle(IPC_CHANNELS.EDITOR_FORMAT_CODE, async (event, code: string) => {
    validateSafeString(code, 'code');
    validateIPCPayload(event, 'editor:formatCode', { code });
    return ctx.getPythonBridge()?.sendRequest('formatCode', { code });
  });

  ipcMain.handle(IPC_CHANNELS.EDITOR_VALIDATE_CODE, async (event, code: string) => {
    validateSafeString(code, 'code');
    validateIPCPayload(event, 'editor:validateCode', { code });
    return ctx.getPythonBridge()?.sendRequest('validateCode', { code });
  });
}

import * as path from 'node:path';
