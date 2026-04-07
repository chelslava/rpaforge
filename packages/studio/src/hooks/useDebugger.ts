/**
 * RPAForge useDebugger Hook
 *
 * Hook for managing debugger state and actions.
 */

import { useState, useCallback } from 'react';
import { useDebuggerStore } from '../stores/debuggerStore';
import { useEngine } from './useEngine';

export interface UseDebuggerResult {
  breakpoints: Array<{
    id: string;
    file: string;
    line: number;
    condition?: string;
    enabled: boolean;
  }>;
  variables: Array<{
    name: string;
    value: unknown;
    type: string;
  }>;
  callStack: Array<{
    keyword: string;
    file: string;
    line: number;
    args: unknown[];
  }>;
  currentLine: number | null;
  isStepping: boolean;
  
  addBreakpoint: (file: string, line: number, condition?: string) => Promise<void>;
  removeBreakpoint: (id: string) => Promise<void>;
  toggleBreakpoint: (id: string) => Promise<void>;
  setVariables: (variables: Array<{ name: string; value: unknown; type: string }>) => void;
  setCallStack: (stack: Array<{ keyword: string; file: string; line: number; args: unknown[] }>) => void;
  stepOver: () => Promise<void>;
  stepInto: () => Promise<void>;
  stepOut: () => Promise<void>;
  continue: () => Promise<void>;
}

export const useDebugger = (): UseDebuggerResult => {
  const {
    breakpoints: breakpointsMap,
    variables,
    callStack,
    currentLine,
    isStepping,
    addBreakpoint: addStoreBreakpoint,
    removeBreakpoint: removeStoreBreakpoint,
    toggleBreakpoint: toggleStoreBreakpoint,
  } = useDebuggerStore();
  
  const breakpoints = Array.from(breakpointsMap.values());
  
  const { pauseProcess, resumeProcess } = useEngine();
  const [breakpointCounter, setBreakpointCounter] = useState(0);

  const addBreakpoint = useCallback(
    async (file: string, line: number, condition?: string): Promise<void> => {
      const id = `breakpoint_${breakpointCounter}`;
      setBreakpointCounter((prev) => prev + 1);
      
      await addStoreBreakpoint({ id, file, line, condition, enabled: true });
    },
    [addStoreBreakpoint, breakpointCounter]
  );

  const removeBreakpoint = useCallback(
    async (id: string): Promise<void> => {
      await removeStoreBreakpoint(id);
    },
    [removeStoreBreakpoint]
  );

  const toggleBreakpoint = useCallback(
    async (id: string): Promise<void> => {
      await toggleStoreBreakpoint(id);
    },
    [toggleStoreBreakpoint]
  );

  const setVariables = useCallback(
    (variablesList: Array<{ name: string; value: unknown; type: string }>) => {
      useDebuggerStore.getState().setVariables(variablesList);
    },
    []
  );

  const setCallStack = useCallback(
    (stack: Array<{ keyword: string; file: string; line: number; args: unknown[] }>) => {
      useDebuggerStore.getState().setCallStack(stack);
    },
    []
  );

  const stepOver = useCallback(async (): Promise<void> => {
    useDebuggerStore.getState().setStepping(true);
    try {
      await pauseProcess();
      useDebuggerStore.getState().setStepping(false);
    } catch (err) {
      useDebuggerStore.getState().setStepping(false);
      throw err;
    }
  }, [pauseProcess]);

  const stepInto = useCallback(async (): Promise<void> => {
    useDebuggerStore.getState().setStepping(true);
    try {
      await pauseProcess();
      useDebuggerStore.getState().setStepping(false);
    } catch (err) {
      useDebuggerStore.getState().setStepping(false);
      throw err;
    }
  }, [pauseProcess]);

  const stepOut = useCallback(async (): Promise<void> => {
    useDebuggerStore.getState().setStepping(true);
    try {
      await pauseProcess();
      useDebuggerStore.getState().setStepping(false);
    } catch (err) {
      useDebuggerStore.getState().setStepping(false);
      throw err;
    }
  }, [pauseProcess]);

  const continueExecution = useCallback(async (): Promise<void> => {
    await resumeProcess();
  }, [resumeProcess]);

  return {
    breakpoints,
    variables,
    callStack,
    currentLine,
    isStepping,
    addBreakpoint,
    removeBreakpoint,
    toggleBreakpoint,
    setVariables,
    setCallStack,
    stepOver,
    stepInto,
    stepOut,
    continue: continueExecution,
  };
};

export default useDebugger;
