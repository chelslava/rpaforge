/**
 * RPAForge useEngine Hook
 *
 * Hook for managing communication with Python engine via IPC bridge.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { PythonBridge } from '../utils/python-bridge';
import { useProcessStore } from '../stores/processStore';

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
  setBreakpoint: (file: string, line: number, condition?: string) => Promise<void>;
  removeBreakpoint: (id: string) => Promise<void>;
  getVariables: () => Promise<unknown>;
  getCallStack: () => Promise<unknown>;
}

export const useEngine = (): UseEngineResult => {
  const [isConnected, setIsConnected] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<unknown>(null);

  const bridgeRef = useRef<PythonBridge | null>(null);
  const processStore = useProcessStore();

  useEffect(() => {
    bridgeRef.current = new PythonBridge();

    const cleanup = bridgeRef.current.onEvent('connected', () => {
      setIsConnected(true);
      setError(null);
      processStore.setConnected(true);
    });

    bridgeRef.current.onEvent('disconnected', () => {
      setIsConnected(false);
      processStore.setConnected(false);
    });

    bridgeRef.current.onEvent('error', (event) => {
      setError((event as { message: string }).message);
    });

    bridgeRef.current.onEvent('processStarted', () => {
      setIsRunning(true);
      processStore.setExecutionState('running');
    });

    bridgeRef.current.onEvent('processFinished', (event) => {
      setIsRunning(false);
      setLastResult(event);
      processStore.setExecutionState('idle');
    });

    bridgeRef.current.onEvent('processPaused', () => {
      setIsPaused(true);
      processStore.setExecutionState('paused');
    });

    bridgeRef.current.onEvent('processResumed', () => {
      setIsPaused(false);
      processStore.setExecutionState('running');
    });

    return () => {
      cleanup();
      if (bridgeRef.current) {
        bridgeRef.current.stop();
      }
    };
  }, [processStore]);

  const connect = useCallback(async (): Promise<void> => {
    if (bridgeRef.current) {
      try {
        await bridgeRef.current.start();
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to connect';
        setError(message);
        throw new Error(message);
      }
    }
  }, []);

  const disconnect = useCallback((): void => {
    if (bridgeRef.current) {
      bridgeRef.current.stop();
      setIsConnected(false);
      processStore.setConnected(false);
    }
  }, [processStore]);

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
        setError(err instanceof Error ? err.message : 'Failed to run process');
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
      processStore.setExecutionState('stopped');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to stop process');
      throw err;
    }
  }, [processStore]);

  const pauseProcess = useCallback(async (): Promise<void> => {
    if (!bridgeRef.current) {
      throw new Error('Not connected to Python engine');
    }

    try {
      await bridgeRef.current.sendRequest('pauseProcess', {});
      setIsPaused(true);
      processStore.setExecutionState('paused');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to pause process');
      throw err;
    }
  }, [processStore]);

  const resumeProcess = useCallback(async (): Promise<void> => {
    if (!bridgeRef.current) {
      throw new Error('Not connected to Python engine');
    }

    try {
      await bridgeRef.current.sendRequest('resumeProcess', {});
      setIsPaused(false);
      processStore.setExecutionState('running');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to resume process');
      throw err;
    }
  }, [processStore]);

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
        setError(err instanceof Error ? err.message : 'Failed to set breakpoint');
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
        setError(err instanceof Error ? err.message : 'Failed to remove breakpoint');
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
      setError(err instanceof Error ? err.message : 'Failed to get variables');
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
      setError(err instanceof Error ? err.message : 'Failed to get call stack');
      throw err;
    }
  }, []);

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
    setBreakpoint,
    removeBreakpoint,
    getVariables,
    getCallStack,
  };
};

export default useEngine;
