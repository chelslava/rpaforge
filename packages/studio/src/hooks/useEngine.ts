import { useState, useEffect, useCallback, useRef } from 'react';
import { toast } from 'sonner';

import { PythonBridge } from '../utils/python-bridge';
import { useExecutionStore } from '../stores/executionStore';
import { useProcessMetadataStore } from '../stores/processMetadataStore';
import { useDebuggerStore } from '../stores/debuggerStore';
import { useConsoleStore } from '../stores/consoleStore';
import { useExecutionHistoryStore } from '../stores/executionHistoryStore';
import type { BridgeState, BridgeStateEvent } from '../types/events';
import type { Capabilities } from '../types/engine';

const sharedBridge = new PythonBridge();

export interface UseEngineResult {
  isConnected: boolean;
  bridgeState: BridgeState;
  capabilities: Capabilities | null;
  isRunning: boolean;
  isPaused: boolean;
  error: string | null;
  lastResult: unknown;

  connect: () => Promise<void>;
  disconnect: () => void;
  runProcess: (source: string, name?: string, sourcemap?: Record<number, string>) => Promise<unknown>;
  runDiagram: (diagram: Record<string, unknown>) => Promise<unknown>;
  stopProcess: () => Promise<void>;
  pauseProcess: () => Promise<void>;
  resumeProcess: () => Promise<void>;
  getActivities: () => Promise<unknown>;
  generateCode: (diagram: Record<string, unknown>) => Promise<{ code: string; sourcemap?: Record<number, string>; files?: Record<string, string> }>;
  setBreakpoint: (file: string, line: number, condition?: string) => Promise<void>;
  removeBreakpoint: (id: string) => Promise<void>;
  getBreakpoints: () => Promise<unknown>;
  getVariables: () => Promise<unknown>;
  getCallStack: () => Promise<unknown>;
  stepOver: () => Promise<void>;
  stepInto: () => Promise<void>;
  stepOut: () => Promise<void>;
  syncBreakpoints: (validNodeIds?: Set<string>) => Promise<void>;
}

export const useEngine = (): UseEngineResult => {
  const [isConnected, setIsConnected] = useState(false);
  const [bridgeState, setBridgeState] = useState<BridgeState>('stopped');
  const [capabilities, setCapabilities] = useState<Capabilities | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<unknown>(null);

  const bridgeRef = useRef<PythonBridge | null>(null);
  const listenersRegisteredRef = useRef(false);
  const currentExecutionIdRef = useRef<string | null>(null);
  const variablePollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const setProcessConnected = useProcessMetadataStore((state) => state.setConnected);
  const setExecutionState = useExecutionStore((state) => state.setExecutionState);
  const setCurrentExecutingNode = useExecutionStore((state) => state.setCurrentExecutingNode);
  const executionSpeed = useExecutionStore((state) => state.executionSpeed);
  const addConsoleLog = useConsoleStore((state) => state.addLog);
  const setVariables = useDebuggerStore((state) => state.setVariables);
  const setCallStack = useDebuggerStore((state) => state.setCallStack);
  const setCurrentPosition = useDebuggerStore((state) => state.setCurrentPosition);
  const { 
    startExecution, 
    endExecution, 
  } = useExecutionHistoryStore();

  const refreshCapabilities = useCallback(async (): Promise<void> => {
    const bridge = bridgeRef.current;
    if (!bridge) {
      return;
    }

    try {
      const result = await bridge.sendRequest<Capabilities>('getCapabilities', {});
      if (result) {
        setCapabilities(result);
      }
    } catch (err) {
      addConsoleLog({
        level: 'warn',
        message:
          err instanceof Error
            ? `Failed to load engine capabilities: ${err.message}`
            : 'Failed to load engine capabilities',
      });
    }
  }, [addConsoleLog]);

  useEffect(() => {
    if (listenersRegisteredRef.current) {
      return;
    }
    listenersRegisteredRef.current = true;

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
      })
    );

    unsubscribers.push(
      bridgeRef.current.onEvent('disconnected', () => {
        setIsConnected(false);
        setProcessConnected(false);
      })
    );

    unsubscribers.push(
      bridgeRef.current.onEvent('bridgeState', (event) => {
        const stateEvent = event as BridgeStateEvent;
        setBridgeState(stateEvent.state);
        setIsConnected(stateEvent.isOperational);
        setProcessConnected(stateEvent.isOperational);
        
        if (stateEvent.state === 'ready') {
          setError(null);
          addConsoleLog({
            level: 'info',
            message: 'Connected to Python engine',
          });
          void refreshCapabilities();
        } else if (stateEvent.state === 'stopped') {
          if (stateEvent.error) {
            setError(stateEvent.error);
            toast.error('Bridge stopped', { description: stateEvent.error });
          }
        } else if (stateEvent.state === 'reconnecting') {
          addConsoleLog({
            level: 'warn',
            message: `Reconnecting to Python engine (attempt ${stateEvent.reconnectAttempt})...`,
          });
        } else if (stateEvent.state === 'degraded') {
          addConsoleLog({
            level: 'warn',
            message: 'Bridge connection degraded',
          });
        }
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
      bridgeRef.current.onEvent('processStarted', (event) => {
        setIsRunning(true);
        setIsPaused(false);
        setExecutionState('running');
        
        const startEvent = event as { processName?: string };
        const processName = startEvent.processName || useProcessMetadataStore.getState().metadata?.name || 'Unknown Process';
        currentExecutionIdRef.current = startExecution(processName);
        
        addConsoleLog({
          level: 'info',
          message: 'Process execution started',
        });
      })
    );

    unsubscribers.push(
      bridgeRef.current.onEvent('processFinished', (event) => {
        setIsRunning(false);
        setIsPaused(false);
        setExecutionState('idle');
        setCurrentExecutingNode(null);
        useDebuggerStore.getState().setPaused(false);
        
        if (currentExecutionIdRef.current) {
          const finishEvent = event as { success?: boolean; error?: string };
          endExecution(
            currentExecutionIdRef.current, 
            finishEvent.success === false ? 'failed' : 'completed',
            finishEvent.error
          );
          currentExecutionIdRef.current = null;
        }
        
        addConsoleLog({
          level: 'info',
          message: 'Process execution finished',
        });
      })
    );

    unsubscribers.push(
      bridgeRef.current.onEvent('processPaused', async (event) => {
        setIsPaused(true);
        setExecutionState('paused');
        useDebuggerStore.getState().setPaused(true);
        
        const pauseEvent = event as { file?: string; line?: number; nodeId?: string };
        if (pauseEvent.file !== undefined && pauseEvent.line !== undefined) {
          setCurrentPosition(pauseEvent.file, pauseEvent.line);
        }
        
        if (pauseEvent.nodeId) {
          setCurrentExecutingNode(pauseEvent.nodeId);
        }
        
        addConsoleLog({
          level: 'info',
          message: 'Process paused at breakpoint',
        });
        
        toast.info('Process paused', { description: 'Debugging mode active' });
        
        if (bridgeRef.current) {
          try {
            const varsResult = await bridgeRef.current.sendRequest<{ variables: Array<{ name: string; value: unknown; type: string }> }>('getVariables', {});
            if (varsResult?.variables) {
              setVariables(varsResult.variables.map(v => ({
                name: v.name,
                value: v.value,
                type: v.type || 'unknown',
                children: [],
              })));
            }
            
            const stackResult = await bridgeRef.current.sendRequest<{ callStack: Array<{ activity: string; library: string; line: number; nodeId: string }> }>('getCallStack', {});
            if (stackResult?.callStack) {
              setCallStack(stackResult.callStack);
            }
          } catch (err) {
            addConsoleLog({
              level: 'warn',
              message: err instanceof Error
                ? `Failed to fetch debugger state: ${err.message}`
                : 'Failed to fetch debugger state',
            });
          }
        }
      })
    );

    unsubscribers.push(
      bridgeRef.current.onEvent('processResumed', () => {
        setIsPaused(false);
        setExecutionState('running');
        setCurrentExecutingNode(null);
        useDebuggerStore.getState().setPaused(false);
        addConsoleLog({
          level: 'info',
          message: 'Process resumed',
        });
      })
    );

    unsubscribers.push(
      bridgeRef.current.onEvent('processStopped', () => {
        setIsRunning(false);
        setIsPaused(false);
        setExecutionState('idle');
        setCurrentExecutingNode(null);
        useDebuggerStore.getState().setPaused(false);
        
        if (currentExecutionIdRef.current) {
          endExecution(currentExecutionIdRef.current, 'stopped');
          currentExecutionIdRef.current = null;
        }
        
        addConsoleLog({
          level: 'info',
          message: 'Process stopped',
        });
        toast.info('Process stopped', { description: 'Execution was cancelled' });
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
      listenersRegisteredRef.current = false;
    };
  }, [
    addConsoleLog,
    refreshCapabilities,
    setCallStack,
    setCurrentPosition,
    setExecutionState,
    setProcessConnected,
    setVariables,
    startExecution,
    endExecution,
  ]);

  useEffect(() => {
    if (isRunning && !isPaused && bridgeRef.current) {
      const pollInterval = Math.max(500, 2000 / executionSpeed);
      
      variablePollIntervalRef.current = setInterval(async () => {
        if (!bridgeRef.current || isPaused) return;
        
        try {
          const varsResult = await bridgeRef.current.sendRequest<{ 
            variables: Array<{ name: string; value: unknown; type: string }> 
          }>('getVariables', {});
          
          if (varsResult?.variables) {
            setVariables(varsResult.variables.map(v => ({
              name: v.name,
              value: v.value,
              type: v.type || 'unknown',
              children: [],
            })));
          }
        } catch {
          // Ignore polling errors
        }
      }, pollInterval);
      
      return () => {
        if (variablePollIntervalRef.current) {
          clearInterval(variablePollIntervalRef.current);
          variablePollIntervalRef.current = null;
        }
      };
    }
    
    return () => {
      if (variablePollIntervalRef.current) {
        clearInterval(variablePollIntervalRef.current);
        variablePollIntervalRef.current = null;
      }
    };
  }, [isRunning, isPaused, executionSpeed, setVariables]);

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
        await refreshCapabilities();
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to connect';
        setError(message);
        throw new Error(message, { cause: err });
      }
    }
  }, [refreshCapabilities, setProcessConnected]);

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
    async (source: string, name?: string, sourcemap?: Record<number, string>): Promise<unknown> => {
      if (!bridgeRef.current) {
        throw new Error('Not connected to Python engine');
      }

      try {
        const result = await bridgeRef.current.sendRequest('runProcess', {
          source,
          name: name || 'Untitled Process',
          sourcemap,
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

  const runDiagram = useCallback(
    async (diagram: Record<string, unknown>): Promise<unknown> => {
      if (!bridgeRef.current) {
        throw new Error('Not connected to Python engine');
      }

      try {
        const result = await bridgeRef.current.sendRequest('runDiagram', {
          diagram,
        });
        setLastResult(result);
        return result;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to run diagram';
        setError(message);
        throw err;
      }
    },
    []
  );

  const syncBreakpoints = useCallback(async (validNodeIds?: Set<string>): Promise<void> => {
    if (!bridgeRef.current) {
      throw new Error('Not connected to Python engine');
    }

    const { cleanupStaleBreakpoints } = useDebuggerStore.getState();
    
    if (validNodeIds) {
      cleanupStaleBreakpoints(validNodeIds);
    }
    
    const existingBps = await bridgeRef.current.sendRequest<{ breakpoints: Array<{ id: string }> }>('getBreakpoints', {});
    
    if (existingBps?.breakpoints) {
      for (const bp of existingBps.breakpoints) {
        try {
          await bridgeRef.current.sendRequest('removeBreakpoint', { id: bp.id });
        } catch { /* empty */ }
      }
    }

    const { breakpoints: currentBreakpoints } = useDebuggerStore.getState();
    for (const bp of currentBreakpoints.values()) {
      if (bp.enabled) {
        try {
          await bridgeRef.current.sendRequest('setBreakpoint', {
            nodeId: bp.nodeId || bp.id,
            line: bp.line,
            condition: bp.condition,
          });
        } catch (err) {
          addConsoleLog({
            level: 'warn',
            message: err instanceof Error
              ? `Failed to sync breakpoint ${bp.id}: ${err.message}`
              : `Failed to sync breakpoint ${bp.id}`,
          });
        }
      }
    }
  }, [addConsoleLog]);

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
    async (diagram: Record<string, unknown>): Promise<{ code: string; sourcemap?: Record<number, string>; files?: Record<string, string> }> => {
      try {
        const bridge = await ensureConnected();
        const result = await bridge.sendRequest<{ code: string; language: string; sourcemap?: Record<number, string>; files?: Record<string, string> }>(
          'generateCode',
          { diagram }
        );
        return { code: result.code ?? '', sourcemap: result.sourcemap, files: result.files };
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
    bridgeState,
    capabilities,
    isRunning,
    isPaused,
    error,
    lastResult,
    connect,
    disconnect,
    runProcess,
    runDiagram,
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
    syncBreakpoints,
  };
};

export default useEngine;
