import { contextBridge, ipcRenderer } from 'electron';

import type { StudioAPI, LogEntry } from '../src/types/ipc-contracts';
import type { BridgeEvent, FileSystemEvent } from '../src/types/events';

const IPC_CHANNELS = {
  BRIDGE_IS_READY: 'bridge:isReady',
  BRIDGE_GET_STATE: 'bridge:getState',
  BRIDGE_GET_STATUS: 'bridge:getStatus',
  BRIDGE_SEND: 'bridge:send',
  BRIDGE_EVENT: 'bridge:event',
  ENGINE_PING: 'engine:ping',
  ENGINE_GET_CAPABILITIES: 'engine:getCapabilities',
  ENGINE_RUN_PROCESS: 'engine:runProcess',
  ENGINE_RUN_FILE: 'engine:runFile',
  ENGINE_STOP_PROCESS: 'engine:stopProcess',
  ENGINE_PAUSE_PROCESS: 'engine:pauseProcess',
  ENGINE_RESUME_PROCESS: 'engine:resumeProcess',
  ENGINE_GET_ACTIVITIES: 'engine:getActivities',
  DEBUGGER_SET_BREAKPOINT: 'debugger:setBreakpoint',
  DEBUGGER_REMOVE_BREAKPOINT: 'debugger:removeBreakpoint',
  DEBUGGER_TOGGLE_BREAKPOINT: 'debugger:toggleBreakpoint',
  DEBUGGER_GET_BREAKPOINTS: 'debugger:getBreakpoints',
  DEBUGGER_STEP_OVER: 'debugger:stepOver',
  DEBUGGER_STEP_INTO: 'debugger:stepInto',
  DEBUGGER_STEP_OUT: 'debugger:stepOut',
  DEBUGGER_CONTINUE: 'debugger:continue',
  DEBUGGER_GET_VARIABLES: 'debugger:getVariables',
  DEBUGGER_GET_CALL_STACK: 'debugger:getCallStack',
  SPY_START: 'spy_start',
  SPY_STOP: 'spy_stop',
  SPY_CAPTURE_WEB: 'spy:captureWeb',
  SPY_CAPTURE_DESKTOP: 'spy:captureDesktop',
  DIALOG_SHOW_OPEN: 'dialog:showOpen',
  DIALOG_SHOW_SAVE: 'dialog:showSave',
  EDITOR_FORMAT_CODE: 'editor:formatCode',
  EDITOR_VALIDATE_CODE: 'editor:validateCode',
  FS_SET_PROJECT_ROOT: 'fs:setProjectRoot',
  FS_PATH_EXISTS: 'fs:pathExists',
  FS_READ_DIR: 'fs:readDir',
  FS_READ_FILE: 'fs:readFile',
  FS_WRITE_FILE: 'fs:writeFile',
  FS_CREATE_DIR: 'fs:createDir',
  FS_DELETE: 'fs:delete',
  FS_RENAME: 'fs:rename',
  FS_COPY: 'fs:copy',
  FS_OPEN_WITH_SYSTEM: 'fs:openWithSystem',
  FS_SHOW_IN_FOLDER: 'fs:showInFolder',
  FS_GET_FILE_INFO: 'fs:getFileInfo',
  FS_WATCH_DIR: 'fs:watchDir',
  FS_UNWATCH_DIR: 'fs:unwatchDir',
  FS_EVENT: 'fs:event',
  LOG_WRITE: 'log:write',
  LOG_GET: 'log:get',
  LOG_EXPORT: 'log:export',
  LOG_CLEAR: 'log:clear',
} as const;

const api: StudioAPI = {
  bridge: {
    isReady: () => ipcRenderer.invoke(IPC_CHANNELS.BRIDGE_IS_READY),
    getState: () => ipcRenderer.invoke(IPC_CHANNELS.BRIDGE_GET_STATE),
    getStatus: () => ipcRenderer.invoke(IPC_CHANNELS.BRIDGE_GET_STATUS),
    send: (method, params) => ipcRenderer.invoke(IPC_CHANNELS.BRIDGE_SEND, method, params),
    onEvent: (listener) => {
      const bridgeHandler = (_: unknown, event: BridgeEvent) => {
        listener(event);
      };
      const spyElementHandler = (_: unknown, data: { element: unknown; mode: string }) => {
        listener({ type: 'spy:elementCaptured', ...data } as BridgeEvent);
      };
      const spyModeHandler = (_: unknown, data: { active: boolean }) => {
        listener({ type: 'spy:modeChanged', ...data } as BridgeEvent);
      };
      ipcRenderer.on(IPC_CHANNELS.BRIDGE_EVENT, bridgeHandler);
      ipcRenderer.on('spy:elementCaptured', spyElementHandler as (...args: unknown[]) => void);
      ipcRenderer.on('spy:modeChanged', spyModeHandler as (...args: unknown[]) => void);
      return () => {
        ipcRenderer.removeListener(IPC_CHANNELS.BRIDGE_EVENT, bridgeHandler);
        ipcRenderer.removeListener('spy:elementCaptured', spyElementHandler as (...args: unknown[]) => void);
        ipcRenderer.removeListener('spy:modeChanged', spyModeHandler as (...args: unknown[]) => void);
      };
    },
  },

  engine: {
    ping: () => ipcRenderer.invoke(IPC_CHANNELS.ENGINE_PING),
    getCapabilities: () => ipcRenderer.invoke(IPC_CHANNELS.ENGINE_GET_CAPABILITIES),
    runProcess: (source, name, sourcemap) => ipcRenderer.invoke(IPC_CHANNELS.ENGINE_RUN_PROCESS, source, name, sourcemap),
    runFile: (path) => ipcRenderer.invoke(IPC_CHANNELS.ENGINE_RUN_FILE, path),
    stopProcess: () => ipcRenderer.invoke(IPC_CHANNELS.ENGINE_STOP_PROCESS),
    pauseProcess: () => ipcRenderer.invoke(IPC_CHANNELS.ENGINE_PAUSE_PROCESS),
    resumeProcess: () => ipcRenderer.invoke(IPC_CHANNELS.ENGINE_RESUME_PROCESS),
    getActivities: () => ipcRenderer.invoke(IPC_CHANNELS.ENGINE_GET_ACTIVITIES),
  },

  spy: {
    startCapture: (mode: string) => ipcRenderer.invoke(IPC_CHANNELS.SPY_START, mode),
    stopCapture: () => ipcRenderer.invoke(IPC_CHANNELS.SPY_STOP),
    captureWebElement: (x: number, y: number) => ipcRenderer.invoke(IPC_CHANNELS.SPY_CAPTURE_WEB, x, y),
    captureDesktopElement: (x: number, y: number) => ipcRenderer.invoke(IPC_CHANNELS.SPY_CAPTURE_DESKTOP, x, y),
    getMousePosition: () => ipcRenderer.invoke('spy:getMousePosition'),
    getElementAtPosition: (x: number, y: number, mode: string) => ipcRenderer.invoke('spy:getElementAtPosition', x, y, mode),
  },

  debugger: {
    setBreakpoint: (file, line, condition) =>
      ipcRenderer.invoke(IPC_CHANNELS.DEBUGGER_SET_BREAKPOINT, file, line, condition),
    removeBreakpoint: (id) => ipcRenderer.invoke(IPC_CHANNELS.DEBUGGER_REMOVE_BREAKPOINT, id),
    toggleBreakpoint: (id) => ipcRenderer.invoke(IPC_CHANNELS.DEBUGGER_TOGGLE_BREAKPOINT, id),
    getBreakpoints: () => ipcRenderer.invoke(IPC_CHANNELS.DEBUGGER_GET_BREAKPOINTS),
    stepOver: () => ipcRenderer.invoke(IPC_CHANNELS.DEBUGGER_STEP_OVER),
    stepInto: () => ipcRenderer.invoke(IPC_CHANNELS.DEBUGGER_STEP_INTO),
    stepOut: () => ipcRenderer.invoke(IPC_CHANNELS.DEBUGGER_STEP_OUT),
    continue: () => ipcRenderer.invoke(IPC_CHANNELS.DEBUGGER_CONTINUE),
    getVariables: () => ipcRenderer.invoke(IPC_CHANNELS.DEBUGGER_GET_VARIABLES),
    getCallStack: () => ipcRenderer.invoke(IPC_CHANNELS.DEBUGGER_GET_CALL_STACK),
  },

  dialog: {
    showOpenDialog: (options) => ipcRenderer.invoke(IPC_CHANNELS.DIALOG_SHOW_OPEN, options),
    showSaveDialog: (options) => ipcRenderer.invoke(IPC_CHANNELS.DIALOG_SHOW_SAVE, options),
  },

  editor: {
    formatCode: (code) => ipcRenderer.invoke(IPC_CHANNELS.EDITOR_FORMAT_CODE, code),
    validateCode: (code) => ipcRenderer.invoke(IPC_CHANNELS.EDITOR_VALIDATE_CODE, code),
  },

  fs: {
    setProjectRoot: (rootPath) => ipcRenderer.invoke(IPC_CHANNELS.FS_SET_PROJECT_ROOT, rootPath),
    pathExists: (path) => ipcRenderer.invoke(IPC_CHANNELS.FS_PATH_EXISTS, path),
    readDir: (dirPath) => ipcRenderer.invoke(IPC_CHANNELS.FS_READ_DIR, dirPath),
    readFile: (filePath) => ipcRenderer.invoke(IPC_CHANNELS.FS_READ_FILE, filePath),
    writeFile: (filePath, content) => ipcRenderer.invoke(IPC_CHANNELS.FS_WRITE_FILE, filePath, content),
    createDir: (dirPath) => ipcRenderer.invoke(IPC_CHANNELS.FS_CREATE_DIR, dirPath),
    delete: (path, recursive) => ipcRenderer.invoke(IPC_CHANNELS.FS_DELETE, path, recursive),
    rename: (oldPath, newPath) => ipcRenderer.invoke(IPC_CHANNELS.FS_RENAME, oldPath, newPath),
    copy: (source, destination) => ipcRenderer.invoke(IPC_CHANNELS.FS_COPY, source, destination),
    openWithSystem: (filePath) => ipcRenderer.invoke(IPC_CHANNELS.FS_OPEN_WITH_SYSTEM, filePath),
    showInFolder: (filePath) => ipcRenderer.invoke(IPC_CHANNELS.FS_SHOW_IN_FOLDER, filePath),
    getFileInfo: (filePath) => ipcRenderer.invoke(IPC_CHANNELS.FS_GET_FILE_INFO, filePath),
    watchDir: (dirPath) => ipcRenderer.invoke(IPC_CHANNELS.FS_WATCH_DIR, dirPath),
    unwatchDir: (dirPath) => ipcRenderer.invoke(IPC_CHANNELS.FS_UNWATCH_DIR, dirPath),
    onFsEvent: (listener) => {
      const handler = (_: unknown, event: FileSystemEvent) => listener(event);
      ipcRenderer.on(IPC_CHANNELS.FS_EVENT, handler);
      return () => ipcRenderer.removeListener(IPC_CHANNELS.FS_EVENT, handler);
    },
  },

  log: {
    log: (entry: Omit<LogEntry, 'timestamp'>) => {
      ipcRenderer.send(IPC_CHANNELS.LOG_WRITE, { ...entry, timestamp: new Date().toISOString() });
    },
    getLogs: (filter?: { level?: string; scope?: string }) =>
      ipcRenderer.invoke(IPC_CHANNELS.LOG_GET, filter),
    exportLogs: () => ipcRenderer.invoke(IPC_CHANNELS.LOG_EXPORT),
    clearLogs: () => ipcRenderer.invoke(IPC_CHANNELS.LOG_CLEAR),
  },
};

contextBridge.exposeInMainWorld('rpaforge', api);
