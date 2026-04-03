import { contextBridge, ipcRenderer } from 'electron';
import type { BridgeEvent, EventListener } from '../src/types/events';

interface BridgeAPI {
  isReady: () => Promise<boolean>;
  send: (method: string, params: unknown) => Promise<unknown>;
  onEvent: (listener: EventListener) => () => void;
}

interface EngineAPI {
  ping: () => Promise<{ pong: boolean; timestamp: number }>;
  getCapabilities: () => Promise<unknown>;
  runProcess: (source: string, name?: string) => Promise<unknown>;
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
    isReady: () => ipcRenderer.invoke('bridge:isReady'),
    send: (method, params) => ipcRenderer.invoke('bridge:send', method, params),
    onEvent: (listener) => {
      const handler = (_: unknown, event: BridgeEvent) => listener(event);
      ipcRenderer.on('bridge:event', handler);
      return () => ipcRenderer.removeListener('bridge:event', handler);
    },
  },

  engine: {
    ping: () => ipcRenderer.invoke('engine:ping'),
    getCapabilities: () => ipcRenderer.invoke('engine:getCapabilities'),
    runProcess: (source, name) => ipcRenderer.invoke('engine:runProcess', source, name),
    runFile: (path) => ipcRenderer.invoke('engine:runFile', path),
    stopProcess: () => ipcRenderer.invoke('engine:stopProcess'),
    pauseProcess: () => ipcRenderer.invoke('engine:pauseProcess'),
    resumeProcess: () => ipcRenderer.invoke('engine:resumeProcess'),
    getActivities: () => ipcRenderer.invoke('engine:getActivities'),
  },

  debugger: {
    setBreakpoint: (file, line, condition) =>
      ipcRenderer.invoke('debugger:setBreakpoint', file, line, condition),
    removeBreakpoint: (id) => ipcRenderer.invoke('debugger:removeBreakpoint', id),
    toggleBreakpoint: (id) => ipcRenderer.invoke('debugger:toggleBreakpoint', id),
    getBreakpoints: () => ipcRenderer.invoke('debugger:getBreakpoints'),
    stepOver: () => ipcRenderer.invoke('debugger:stepOver'),
    stepInto: () => ipcRenderer.invoke('debugger:stepInto'),
    stepOut: () => ipcRenderer.invoke('debugger:stepOut'),
    continue: () => ipcRenderer.invoke('debugger:continue'),
    getVariables: () => ipcRenderer.invoke('debugger:getVariables'),
    getCallStack: () => ipcRenderer.invoke('debugger:getCallStack'),
  },
};

contextBridge.exposeInMainWorld('rpaforge', api);

export type { StudioAPI };
