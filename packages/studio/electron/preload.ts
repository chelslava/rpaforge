import { contextBridge, ipcRenderer } from 'electron';
import type { BridgeEvent, BridgeState } from '../src/types/events';

const IPC_CHANNELS = {
  BRIDGE_IS_READY: 'bridge:isReady',
  BRIDGE_GET_STATE: 'bridge:getState',
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
} as const;

interface BridgeAPI {
  isReady: () => Promise<boolean>;
  getState: () => Promise<BridgeState>;
  send: (method: string, params: unknown) => Promise<unknown>;
  onEvent: (listener: (event: BridgeEvent) => void) => () => void;
}

interface EngineAPI {
  ping: () => Promise<{ pong: boolean; timestamp: number }>;
  getCapabilities: () => Promise<unknown>;
  runProcess: (source: string, name?: string, sourcemap?: Record<number, string>) => Promise<unknown>;
  runFile: (path: string) => Promise<unknown>;
  stopProcess: () => Promise<unknown>;
  pauseProcess: () => Promise<unknown>;
  resumeProcess: () => Promise<unknown>;
  getActivities: () => Promise<unknown>;
}

interface DebuggerAPI {
  setBreakpoint: (file: string, line: number, condition?: string) => Promise<unknown>;
  removeBreakpoint: (id: string) => Promise<unknown>;
  toggleBreakpoint: (id: string) => Promise<unknown>;
  getBreakpoints: () => Promise<unknown>;
  stepOver: () => Promise<unknown>;
  stepInto: () => Promise<unknown>;
  stepOut: () => Promise<unknown>;
  continue: () => Promise<unknown>;
  getVariables: () => Promise<unknown>;
  getCallStack: () => Promise<unknown>;
}

interface StudioAPI {
  bridge: BridgeAPI;
  engine: EngineAPI;
  debugger: DebuggerAPI;
}

const api: StudioAPI = {
  bridge: {
    isReady: () => ipcRenderer.invoke(IPC_CHANNELS.BRIDGE_IS_READY),
    getState: () => ipcRenderer.invoke(IPC_CHANNELS.BRIDGE_GET_STATE),
    send: (method, params) => ipcRenderer.invoke(IPC_CHANNELS.BRIDGE_SEND, method, params),
    onEvent: (listener) => {
      const handler = (_: unknown, event: BridgeEvent) => {
        console.log('[Preload] Received event from main:', event);
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
