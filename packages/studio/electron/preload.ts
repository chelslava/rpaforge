import { contextBridge, ipcRenderer } from 'electron';

const api = {
  engine: {
    run: (data: unknown) => ipcRenderer.invoke('engine:run', data),
    stop: () => ipcRenderer.invoke('engine:stop'),
  },

  debugger: {
    setBreakpoint: (data: unknown) =>
      ipcRenderer.invoke('debugger:setBreakpoint', data),
    stepOver: () => ipcRenderer.invoke('debugger:stepOver'),
    stepInto: () => ipcRenderer.invoke('debugger:stepInto'),
    stepOut: () => ipcRenderer.invoke('debugger:stepOut'),
    continue: () => ipcRenderer.invoke('debugger:continue'),
    getVariables: () => ipcRenderer.invoke('debugger:getVariables'),
    getCallStack: () => ipcRenderer.invoke('debugger:getCallStack'),
  },

  onEngineEvent: (callback: (event: unknown) => void) => {
    ipcRenderer.on('engine:event', (_, event) => callback(event));
  },

  onDebuggerEvent: (callback: (event: unknown) => void) => {
    ipcRenderer.on('debugger:event', (_, event) => callback(event));
  },
};

contextBridge.exposeInMainWorld('rpaforge', api);

export type StudioAPI = typeof api;
