import { contextBridge, ipcRenderer } from 'electron';
import { IPC_CHANNELS } from './ipc-contracts';
import type { StudioAPI } from '../src/types/ipc-contracts';
import type { BridgeEvent } from '../src/types/events';

const api: StudioAPI = {
  bridge: {
    isReady: () => ipcRenderer.invoke(IPC_CHANNELS.BRIDGE_IS_READY),
    getState: () => ipcRenderer.invoke(IPC_CHANNELS.BRIDGE_GET_STATE),
    getStatus: () => ipcRenderer.invoke(IPC_CHANNELS.BRIDGE_GET_STATUS),
    send: (method, params) => ipcRenderer.invoke(IPC_CHANNELS.BRIDGE_SEND, method, params),
    onEvent: (listener) => {
      const handler = (_: unknown, event: BridgeEvent) => {
        listener(event);
      };
      ipcRenderer.on(IPC_CHANNELS.BRIDGE_EVENT, handler);
      return () => ipcRenderer.removeListener(IPC_CHANNELS.BRIDGE_EVENT, handler);
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
};

contextBridge.exposeInMainWorld('rpaforge', api);
