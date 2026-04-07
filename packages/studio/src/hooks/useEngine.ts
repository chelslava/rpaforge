/**
 * RPAForge useEngine Hook
 *
 * Hook for managing communication with Python engine via IPC bridge.
 * Works in both Electron and browser environments.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { PythonBridge } from '../utils/python-bridge';
import { useProcessStore } from '../stores/processStore';
import { useConsoleStore } from '../stores/consoleStore';

const sharedBridge = new PythonBridge();

export interface UseEngineResult {
  isConnected: boolean;
  isRunning: boolean;
  isPaused: boolean;
  error: string | null;
  lastResult: unknown;

  connect: () => Promise<void>;
  disconnect: () => void;
  runProcess: (source: string, name?: string) => Promise<unknown>;
  stopProcess: () => Promise<void>;
  pauseProcess: () => Promise<void>;
  resumeProcess: () => Promise<void>;
  getActivities: () => Promise<unknown>;
  generateCode: (diagram: { nodes: unknown[]; edges: unknown[] }) => Promise<string>;
  setBreakpoint: (file: string, line: number, condition?: string) => Promise<void>;
  removeBreakpoint: (id: string) => Promise<void>;
  getBreakpoints: () => Promise<unknown>;
  getVariables: () => Promise<unknown>;
  getCallStack: () => Promise<unknown>;
  stepOver: () => Promise<void>;
  stepInto: () => Promise<void>;
  stepOut: () => Promise<void>;
}

export const useEngine = (): UseEngineResult => {
  const [isConnected, setIsConnected] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<unknown>(null);

  const bridgeRef = useRef<PythonBridge | null>(null);
  const setProcessConnected = useProcessStore((state) => state.setConnected);
  const setExecutionState = useProcessStore((state) => state.setExecutionState);
  const addConsoleLog = useConsoleStore((state) => state.addLog);

  useEffect(() => {
    bridgeRef.current = sharedBridge;

    if (bridgeRef.current.isReady()) {
      setIsConnected(true);
      setProcessConnected(true);
    }

    const unsubscribers: (() => void)[] = [];

    unsubscribers.push(
      bridgeRef.current.onEvent('connected', () => {
        setIsConnected(true);
        setError(null);
        setProcessConnected(true);
        addConsoleLog({
          level: 'info',
          message: 'Connected to Python engine',
        });
      })
    );

    unsubscribers.push(
      bridgeRef.current.onEvent('disconnected', () => {
        setIsConnected(false);
        setProcessConnected(false);
        addConsoleLog({
          level: 'warn',
          message: 'Disconnected from Python engine',
        });
      })
    );

    unsubscribers.push(
      bridgeRef.current.onEvent('error', (event) => {
        const errEvent = event as { message?: string; error?: string };
        const message = errEvent.message || errEvent.error || 'Unknown error';
        setError(message);
        addConsoleLog({
          level: 'error',
          message: `Engine error: ${message}`,
        });
      })
    );

    unsubscribers.push(
      bridgeRef.current.onEvent('processStarted', () => {
        setIsRunning(true);
        setIsPaused(false);
        setExecutionState('running');
        addConsoleLog({
          level: 'info',
          message: 'Process execution started',
        });
      })
    );

    unsubscribers.push(
      bridgeRef.current.onEvent('processFinished', () => {
        setIsRunning(false);
        setIsPaused(false);
        setExecutionState('idle');
        addConsoleLog({
          level: 'info',
          message: 'Process execution finished',
        });
      })
    );

    unsubscribers.push(
      bridgeRef.current.onEvent('processPaused', () => {
        setIsPaused(true);
        setExecutionState('paused');
        addConsoleLog({
          level: 'info',
          message: 'Process paused at breakpoint',
        });
      })
    );

    unsubscribers.push(
      bridgeRef.current.onEvent('processResumed', () => {
        setIsPaused(false);
        setExecutionState('running');
        addConsoleLog({
          level: 'info',
          message: 'Process resumed',
        });
      })
    );

    unsubscribers.push(
      bridgeRef.current.onEvent('log', (event) => {
        const logEvent = event as { level?: string; message: string };
        addConsoleLog({
          level: (logEvent.level as 'info' | 'warn' | 'error' | 'debug') || 'info',
          message: logEvent.message,
        });
      })
    );

    unsubscribers.push(
      bridgeRef.current.onEvent('variable', (event) => {
        const varEvent = event as unknown as { name: string; value: unknown };
        addConsoleLog({
          level: 'debug',
          message: `Variable: ${varEvent.name} = ${JSON.stringify(varEvent.value)}`,
        });
      })
    );

    return () => {
      unsubscribers.forEach((unsub) => unsub());
    };
  }, [addConsoleLog, setExecutionState, setProcessConnected]);

  const connect = useCallback(async (): Promise<void> => {
    if (bridgeRef.current) {
      try {
        if (bridgeRef.current.isReady()) {
          setIsConnected(true);
          setError(null);
          setProcessConnected(true);
          return;
        }

        await bridgeRef.current.start();
        setIsConnected(true);
        setError(null);
        setProcessConnected(true);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to connect';
        setError(message);
        throw new Error(message);
      }
    }
  }, [setProcessConnected]);

  const ensureConnected = useCallback(async (): Promise<PythonBridge> => {
    if (!bridgeRef.current) {
      throw new Error('Python bridge is not initialized');
    }

    const ready = await bridgeRef.current.checkReady();
    if (!ready) {
      await bridgeRef.current.start();
    }

    setIsConnected(true);
    setProcessConnected(true);

    if (!bridgeRef.current) {
      throw new Error('Python bridge is not initialized');
    }

    return bridgeRef.current;
  }, [setProcessConnected]);

  const disconnect = useCallback((): void => {
    if (bridgeRef.current) {
      bridgeRef.current.stop();
      setIsConnected(false);
      setProcessConnected(false);
    }
  }, [setProcessConnected]);

  const runProcess = useCallback(
    async (source: string, name?: string): Promise<unknown> => {
      if (!bridgeRef.current) {
        throw new Error('Not connected to Python engine');
      }

      try {
        const result = await bridgeRef.current.sendRequest('runProcess', {
          source,
          name: name || 'Untitled Process',
        });
        setLastResult(result);
        return result;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to run process';
        setError(message);
        throw err;
      }
    },
    []
  );

  const stopProcess = useCallback(async (): Promise<void> => {
    if (!bridgeRef.current) {
      throw new Error('Not connected to Python engine');
    }

    try {
      await bridgeRef.current.sendRequest('stopProcess', {});
      setIsRunning(false);
      setIsPaused(false);
      setExecutionState('stopped');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to stop process';
      setError(message);
      throw err;
    }
  }, [setExecutionState]);

  const pauseProcess = useCallback(async (): Promise<void> => {
    if (!bridgeRef.current) {
      throw new Error('Not connected to Python engine');
    }

    try {
      await bridgeRef.current.sendRequest('pauseProcess', {});
      setIsPaused(true);
      setExecutionState('paused');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to pause process';
      setError(message);
      throw err;
    }
  }, [setExecutionState]);

  const resumeProcess = useCallback(async (): Promise<void> => {
    const bridge = bridgeRef.current;
    if (!bridge) {
      throw new Error('Not connected to Python engine');
    }

    try {
      await bridge.sendRequest('resumeProcess', {});
      setIsPaused(false);
      setExecutionState('running');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to resume process';
      setError(message);
      throw err;
    }
  }, [setExecutionState]);

  const getActivities = useCallback(async (): Promise<unknown> => {
    try {
      const bridge = await ensureConnected();
      return await bridge.sendRequest('getActivities', {});
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to get activities';
      setError(message);
      throw err;
    }
  }, [ensureConnected]);

  const setBreakpoint = useCallback(
    async (file: string, line: number, condition?: string): Promise<void> => {
      if (!bridgeRef.current) {
        throw new Error('Not connected to Python engine');
      }

      try {
        await bridgeRef.current.sendRequest('setBreakpoint', {
          file,
          line,
          condition,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to set breakpoint';
        setError(message);
        throw err;
      }
    },
    []
  );

  const removeBreakpoint = useCallback(
    async (id: string): Promise<void> => {
      if (!bridgeRef.current) {
        throw new Error('Not connected to Python engine');
      }

      try {
        await bridgeRef.current.sendRequest('removeBreakpoint', { id });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to remove breakpoint';
        setError(message);
        throw err;
      }
    },
    []
  );

  const getVariables = useCallback(async (): Promise<unknown> => {
    if (!bridgeRef.current) {
      throw new Error('Not connected to Python engine');
    }

    try {
      return await bridgeRef.current.sendRequest('getVariables', {});
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to get variables';
      setError(message);
      throw err;
    }
  }, []);

  const getCallStack = useCallback(async (): Promise<unknown> => {
    if (!bridgeRef.current) {
      throw new Error('Not connected to Python engine');
    }

    try {
      return await bridgeRef.current.sendRequest('getCallStack', {});
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to get call stack';
      setError(message);
      throw err;
    }
  }, []);

  const getBreakpoints = useCallback(async (): Promise<unknown> => {
    if (!bridgeRef.current) {
      throw new Error('Not connected to Python engine');
    }

    try {
      return await bridgeRef.current.sendRequest('getBreakpoints', {});
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to get breakpoints';
      setError(message);
      throw err;
    }
  }, []);

  const stepOver = useCallback(async (): Promise<void> => {
    if (!bridgeRef.current) {
      throw new Error('Not connected to Python engine');
    }

    try {
      await bridgeRef.current.sendRequest('stepOver', {});
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to step over';
      setError(message);
      throw err;
    }
  }, []);

  const stepInto = useCallback(async (): Promise<void> => {
    if (!bridgeRef.current) {
      throw new Error('Not connected to Python engine');
    }

    try {
      await bridgeRef.current.sendRequest('stepInto', {});
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to step into';
      setError(message);
      throw err;
    }
  }, []);

  const stepOut = useCallback(async (): Promise<void> => {
    const bridge = bridgeRef.current;
    if (!bridge) {
      throw new Error('Not connected to Python engine');
    }

    try {
      await bridge.sendRequest('stepOut', {});
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to step out';
      setError(message);
      throw err;
    }
  }, []);

  const generateCode = useCallback(
    async (diagram: { nodes: unknown[]; edges: unknown[] }): Promise<string> => {
      try {
        const bridge = await ensureConnected();
        const result = await bridge.sendRequest<{ code: string; language: string }>(
          'generateCode',
          { diagram }
        );
        return result.code ?? '';
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to generate code';
        setError(message);
        throw err;
      }
    },
    [ensureConnected]
  );

  return {
    isConnected,
    isRunning,
    isPaused,
    error,
    lastResult,
    connect,
    disconnect,
    runProcess,
    stopProcess,
    pauseProcess,
    resumeProcess,
    getActivities,
    generateCode,
    setBreakpoint,
    removeBreakpoint,
    getBreakpoints,
    getVariables,
    getCallStack,
    stepOver,
    stepInto,
    stepOut,
  };
};

export default useEngine;
