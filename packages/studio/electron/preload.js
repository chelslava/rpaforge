"use strict";
const electron = require("electron");
const IPC_CHANNELS = {
  BRIDGE_IS_READY: "bridge:isReady",
  BRIDGE_GET_STATE: "bridge:getState",
  BRIDGE_GET_STATUS: "bridge:getStatus",
  BRIDGE_SEND: "bridge:send",
  BRIDGE_EVENT: "bridge:event",
  ENGINE_PING: "engine:ping",
  ENGINE_GET_CAPABILITIES: "engine:getCapabilities",
  ENGINE_RUN_PROCESS: "engine:runProcess",
  ENGINE_RUN_FILE: "engine:runFile",
  ENGINE_STOP_PROCESS: "engine:stopProcess",
  ENGINE_PAUSE_PROCESS: "engine:pauseProcess",
  ENGINE_RESUME_PROCESS: "engine:resumeProcess",
  ENGINE_GET_ACTIVITIES: "engine:getActivities",
  DEBUGGER_SET_BREAKPOINT: "debugger:setBreakpoint",
  DEBUGGER_REMOVE_BREAKPOINT: "debugger:removeBreakpoint",
  DEBUGGER_TOGGLE_BREAKPOINT: "debugger:toggleBreakpoint",
  DEBUGGER_GET_BREAKPOINTS: "debugger:getBreakpoints",
  DEBUGGER_STEP_OVER: "debugger:stepOver",
  DEBUGGER_STEP_INTO: "debugger:stepInto",
  DEBUGGER_STEP_OUT: "debugger:stepOut",
  DEBUGGER_CONTINUE: "debugger:continue",
  DEBUGGER_GET_VARIABLES: "debugger:getVariables",
  DEBUGGER_GET_CALL_STACK: "debugger:getCallStack",
  DIALOG_SHOW_OPEN: "dialog:showOpen",
  DIALOG_SHOW_SAVE: "dialog:showSave",
  EDITOR_FORMAT_CODE: "editor:formatCode",
  EDITOR_VALIDATE_CODE: "editor:validateCode",
  FS_SET_PROJECT_ROOT: "fs:setProjectRoot",
  FS_PATH_EXISTS: "fs:pathExists",
  FS_READ_DIR: "fs:readDir",
  FS_READ_FILE: "fs:readFile",
  FS_WRITE_FILE: "fs:writeFile",
  FS_CREATE_DIR: "fs:createDir",
  FS_DELETE: "fs:delete",
  FS_RENAME: "fs:rename",
  FS_COPY: "fs:copy",
  FS_OPEN_WITH_SYSTEM: "fs:openWithSystem",
  FS_SHOW_IN_FOLDER: "fs:showInFolder",
  FS_GET_FILE_INFO: "fs:getFileInfo",
  FS_WATCH_DIR: "fs:watchDir",
  FS_UNWATCH_DIR: "fs:unwatchDir",
  FS_EVENT: "fs:event",
  LOG_WRITE: "log:write",
  LOG_GET: "log:get",
  LOG_EXPORT: "log:export",
  LOG_CLEAR: "log:clear"
};
const api = {
  bridge: {
    isReady: () => electron.ipcRenderer.invoke(IPC_CHANNELS.BRIDGE_IS_READY),
    getState: () => electron.ipcRenderer.invoke(IPC_CHANNELS.BRIDGE_GET_STATE),
    getStatus: () => electron.ipcRenderer.invoke(IPC_CHANNELS.BRIDGE_GET_STATUS),
    send: (method, params) => electron.ipcRenderer.invoke(IPC_CHANNELS.BRIDGE_SEND, method, params),
    onEvent: (listener) => {
      const handler = (_, event) => {
        listener(event);
      };
      electron.ipcRenderer.on(IPC_CHANNELS.BRIDGE_EVENT, handler);
      return () => electron.ipcRenderer.removeListener(IPC_CHANNELS.BRIDGE_EVENT, handler);
    }
  },
  engine: {
    ping: () => electron.ipcRenderer.invoke(IPC_CHANNELS.ENGINE_PING),
    getCapabilities: () => electron.ipcRenderer.invoke(IPC_CHANNELS.ENGINE_GET_CAPABILITIES),
    runProcess: (source, name, sourcemap) => electron.ipcRenderer.invoke(IPC_CHANNELS.ENGINE_RUN_PROCESS, source, name, sourcemap),
    runFile: (path) => electron.ipcRenderer.invoke(IPC_CHANNELS.ENGINE_RUN_FILE, path),
    stopProcess: () => electron.ipcRenderer.invoke(IPC_CHANNELS.ENGINE_STOP_PROCESS),
    pauseProcess: () => electron.ipcRenderer.invoke(IPC_CHANNELS.ENGINE_PAUSE_PROCESS),
    resumeProcess: () => electron.ipcRenderer.invoke(IPC_CHANNELS.ENGINE_RESUME_PROCESS),
    getActivities: () => electron.ipcRenderer.invoke(IPC_CHANNELS.ENGINE_GET_ACTIVITIES)
  },
  debugger: {
    setBreakpoint: (file, line, condition) => electron.ipcRenderer.invoke(IPC_CHANNELS.DEBUGGER_SET_BREAKPOINT, file, line, condition),
    removeBreakpoint: (id) => electron.ipcRenderer.invoke(IPC_CHANNELS.DEBUGGER_REMOVE_BREAKPOINT, id),
    toggleBreakpoint: (id) => electron.ipcRenderer.invoke(IPC_CHANNELS.DEBUGGER_TOGGLE_BREAKPOINT, id),
    getBreakpoints: () => electron.ipcRenderer.invoke(IPC_CHANNELS.DEBUGGER_GET_BREAKPOINTS),
    stepOver: () => electron.ipcRenderer.invoke(IPC_CHANNELS.DEBUGGER_STEP_OVER),
    stepInto: () => electron.ipcRenderer.invoke(IPC_CHANNELS.DEBUGGER_STEP_INTO),
    stepOut: () => electron.ipcRenderer.invoke(IPC_CHANNELS.DEBUGGER_STEP_OUT),
    continue: () => electron.ipcRenderer.invoke(IPC_CHANNELS.DEBUGGER_CONTINUE),
    getVariables: () => electron.ipcRenderer.invoke(IPC_CHANNELS.DEBUGGER_GET_VARIABLES),
    getCallStack: () => electron.ipcRenderer.invoke(IPC_CHANNELS.DEBUGGER_GET_CALL_STACK)
  },
  dialog: {
    showOpenDialog: (options) => electron.ipcRenderer.invoke(IPC_CHANNELS.DIALOG_SHOW_OPEN, options),
    showSaveDialog: (options) => electron.ipcRenderer.invoke(IPC_CHANNELS.DIALOG_SHOW_SAVE, options)
  },
  editor: {
    formatCode: (code) => electron.ipcRenderer.invoke(IPC_CHANNELS.EDITOR_FORMAT_CODE, code),
    validateCode: (code) => electron.ipcRenderer.invoke(IPC_CHANNELS.EDITOR_VALIDATE_CODE, code)
  },
  fs: {
    setProjectRoot: (rootPath) => electron.ipcRenderer.invoke(IPC_CHANNELS.FS_SET_PROJECT_ROOT, rootPath),
    pathExists: (path) => electron.ipcRenderer.invoke(IPC_CHANNELS.FS_PATH_EXISTS, path),
    readDir: (dirPath) => electron.ipcRenderer.invoke(IPC_CHANNELS.FS_READ_DIR, dirPath),
    readFile: (filePath) => electron.ipcRenderer.invoke(IPC_CHANNELS.FS_READ_FILE, filePath),
    writeFile: (filePath, content) => electron.ipcRenderer.invoke(IPC_CHANNELS.FS_WRITE_FILE, filePath, content),
    createDir: (dirPath) => electron.ipcRenderer.invoke(IPC_CHANNELS.FS_CREATE_DIR, dirPath),
    delete: (path, recursive) => electron.ipcRenderer.invoke(IPC_CHANNELS.FS_DELETE, path, recursive),
    rename: (oldPath, newPath) => electron.ipcRenderer.invoke(IPC_CHANNELS.FS_RENAME, oldPath, newPath),
    copy: (source, destination) => electron.ipcRenderer.invoke(IPC_CHANNELS.FS_COPY, source, destination),
    openWithSystem: (filePath) => electron.ipcRenderer.invoke(IPC_CHANNELS.FS_OPEN_WITH_SYSTEM, filePath),
    showInFolder: (filePath) => electron.ipcRenderer.invoke(IPC_CHANNELS.FS_SHOW_IN_FOLDER, filePath),
    getFileInfo: (filePath) => electron.ipcRenderer.invoke(IPC_CHANNELS.FS_GET_FILE_INFO, filePath),
    watchDir: (dirPath) => electron.ipcRenderer.invoke(IPC_CHANNELS.FS_WATCH_DIR, dirPath),
    unwatchDir: (dirPath) => electron.ipcRenderer.invoke(IPC_CHANNELS.FS_UNWATCH_DIR, dirPath),
    onFsEvent: (listener) => {
      const handler = (_, event) => listener(event);
      electron.ipcRenderer.on(IPC_CHANNELS.FS_EVENT, handler);
      return () => electron.ipcRenderer.removeListener(IPC_CHANNELS.FS_EVENT, handler);
    }
  },
  log: {
    log: (entry) => {
      electron.ipcRenderer.send(IPC_CHANNELS.LOG_WRITE, { ...entry, timestamp: (/* @__PURE__ */ new Date()).toISOString() });
    },
    getLogs: (filter) => electron.ipcRenderer.invoke(IPC_CHANNELS.LOG_GET, filter),
    exportLogs: () => electron.ipcRenderer.invoke(IPC_CHANNELS.LOG_EXPORT),
    clearLogs: () => electron.ipcRenderer.invoke(IPC_CHANNELS.LOG_CLEAR)
  }
};
electron.contextBridge.exposeInMainWorld("rpaforge", api);
//# sourceMappingURL=preload.js.map
