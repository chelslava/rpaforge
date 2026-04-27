import { vi } from 'vitest';
import type { BridgeEvent, BridgeStatus, FileSystemEvent } from '../types/events';

function makeReadyStatus(): BridgeStatus {
  return {
    timestamp: new Date().toISOString(),
    state: 'ready',
    previousState: 'stopped',
    isOperational: true,
    maxReconnectAttempts: 3,
    consecutiveHeartbeatFailures: 0,
    fatal: false,
    reason: 'ready_check',
  };
}

export function mockElectronAPI() {
  const eventListeners: Array<(event: BridgeEvent) => void> = [];

  const api = {
    bridge: {
      isReady: vi.fn().mockResolvedValue(true),
      getState: vi.fn().mockResolvedValue('ready'),
      getStatus: vi.fn().mockResolvedValue(makeReadyStatus()),
      send: vi.fn().mockImplementation((method: string) => {
        const responses: Record<string, unknown> = {
          ping: { pong: true, timestamp: Date.now() },
          getCapabilities: {
            version: '0.3.0',
            features: {
              debugger: true,
              breakpoints: true,
              stepping: true,
              variableWatching: true,
              nativePython: true,
            },
            libraries: ['DesktopUI', 'WebUI', 'BuiltIn'],
          },
          getActivities: { activities: [] },
          runProcess: { status: 'pass', duration: 0.1 },
          stopProcess: {},
          getVariables: { variables: [] },
          getCallStack: { callStack: [] },
          getBreakpoints: { breakpoints: [] },
          generateCode: { code: 'def main():\n    pass\n', language: 'python' },
        };
        return Promise.resolve(responses[method] ?? {});
      }),
      onEvent: vi.fn().mockImplementation((listener: (event: BridgeEvent) => void) => {
        eventListeners.push(listener);
        return () => {
          const idx = eventListeners.indexOf(listener);
          if (idx !== -1) eventListeners.splice(idx, 1);
        };
      }),
    },

    engine: {
      ping: vi.fn().mockResolvedValue({ pong: true }),
      getCapabilities: vi.fn().mockResolvedValue({
        version: '0.3.0',
        features: { debugger: true, breakpoints: true },
        libraries: ['BuiltIn'],
      }),
      runProcess: vi.fn().mockResolvedValue({ status: 'pass', duration: 0.1 }),
      runFile: vi.fn().mockResolvedValue({ status: 'pass', duration: 0.1 }),
      stopProcess: vi.fn().mockResolvedValue({}),
      pauseProcess: vi.fn().mockResolvedValue({}),
      resumeProcess: vi.fn().mockResolvedValue({}),
      getActivities: vi.fn().mockResolvedValue({ activities: [] }),
    },

    debugger: {
      setBreakpoint: vi.fn().mockResolvedValue({ id: 'bp-1' }),
      removeBreakpoint: vi.fn().mockResolvedValue({}),
      toggleBreakpoint: vi.fn().mockResolvedValue({}),
      getBreakpoints: vi.fn().mockResolvedValue({ breakpoints: [] }),
      stepOver: vi.fn().mockResolvedValue({}),
      stepInto: vi.fn().mockResolvedValue({}),
      stepOut: vi.fn().mockResolvedValue({}),
      continue: vi.fn().mockResolvedValue({}),
      getVariables: vi.fn().mockResolvedValue({ variables: [] }),
      getCallStack: vi.fn().mockResolvedValue({ callStack: [] }),
    },

    dialog: {
      showOpenDialog: vi.fn().mockResolvedValue({ canceled: true, filePaths: [] }),
      showSaveDialog: vi.fn().mockResolvedValue({ canceled: true, filePath: undefined }),
    },

    fs: {
      pathExists: vi.fn().mockResolvedValue(false),
      readDir: vi.fn().mockResolvedValue([]),
      readFile: vi.fn().mockResolvedValue(''),
      writeFile: vi.fn().mockResolvedValue(undefined),
      createDir: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined),
      rename: vi.fn().mockResolvedValue(undefined),
      copy: vi.fn().mockResolvedValue(undefined),
      openWithSystem: vi.fn().mockResolvedValue(undefined),
      showInFolder: vi.fn().mockResolvedValue(undefined),
      getFileInfo: vi.fn().mockResolvedValue(null),
      watchDir: vi.fn().mockResolvedValue(undefined),
      unwatchDir: vi.fn().mockResolvedValue(undefined),
      onFsEvent: vi.fn().mockImplementation((_listener: (event: FileSystemEvent) => void) => () => {}),
    },
  };

  Object.defineProperty(window, 'rpaforge', { value: api, writable: true, configurable: true });

  return {
    api,
    emitBridgeEvent: (event: BridgeEvent) => eventListeners.forEach((l) => l(event)),
  };
}
