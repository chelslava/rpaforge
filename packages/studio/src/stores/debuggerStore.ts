/**
 * RPAForge Debugger Store
 *
 * Manages debugger state for process debugging.
 * Works in both standalone and orchestrator modes.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Breakpoint, Variable, CallFrame } from '../types/engine';
import { useExecutionStore } from './executionStore';

export type DebuggerConnectionState = 'disconnected' | 'connecting' | 'connected';

interface DebuggerState {
  connectionState: DebuggerConnectionState;

  breakpoints: Map<string, Breakpoint>;
  fileBreakpoints: Map<string, string[]>;

  variables: Variable[];
  watchedVariables: Set<string>;
  callStack: CallFrame[];

  currentFile: string | null;
  currentLine: number | null;

  isPaused: boolean;
  isStepping: boolean;
  isStepLoading: boolean;
  isDebugging: boolean;
  setDebugging: (debugging: boolean) => void;
  lastBreakpointId: string | null;

  setConnectionState: (state: DebuggerConnectionState) => void;

  addBreakpoint: (breakpoint: Breakpoint) => void;
  removeBreakpoint: (id: string) => void;
  toggleBreakpoint: (id: string) => void;
  updateBreakpoint: (id: string, updates: Partial<Breakpoint>) => void;
  clearBreakpoints: (file?: string) => void;
  getBreakpointsForFile: (file: string) => Breakpoint[];
  cleanupStaleBreakpoints: (validNodeIds: Set<string>) => void;

  setVariables: (variables: Variable[]) => void;
  updateVariable: (name: string, value: unknown) => void;
  addWatchedVariable: (name: string) => void;
  removeWatchedVariable: (name: string) => void;
  clearWatchedVariables: () => void;

  setCallStack: (stack: CallFrame[]) => void;
  clearCallStack: () => void;

  setCurrentPosition: (file: string | null, line: number | null) => void;

  setPaused: (paused: boolean) => void;
  setStepping: (stepping: boolean) => void;
  setStepLoading: (loading: boolean) => void;
  setLastBreakpointId: (id: string | null) => void;

  reset: () => void;
}

export const useDebuggerStore = create<DebuggerState>()(
  persist(
    (set) => ({
  connectionState: 'disconnected',

  breakpoints: new Map(),
  fileBreakpoints: new Map(),

  variables: [],
  watchedVariables: new Set(),
  callStack: [],

  currentFile: null,
  currentLine: null,

  isPaused: false,
  isStepping: false,
  isStepLoading: false,
  isDebugging: false,
  lastBreakpointId: null,

  setConnectionState: (state) => set({ connectionState: state }),

  addBreakpoint: (breakpoint) => {
    useExecutionStore.getState().addBreakpoint(breakpoint);
    set((state) => {
      const newBreakpoints = new Map(state.breakpoints);
      newBreakpoints.set(breakpoint.id, breakpoint);

      const newFileBreakpoints = new Map(state.fileBreakpoints);
      const fileBps = newFileBreakpoints.get(breakpoint.file) || [];
      newFileBreakpoints.set(breakpoint.file, [...fileBps, breakpoint.id]);

      return {
        breakpoints: newBreakpoints,
        fileBreakpoints: newFileBreakpoints,
      };
    });
  },

  removeBreakpoint: (id) => {
    useExecutionStore.getState().removeBreakpoint(id);
    set((state) => {
      const breakpoint = state.breakpoints.get(id);
      if (!breakpoint) return state;

      const newBreakpoints = new Map(state.breakpoints);
      newBreakpoints.delete(id);

      const newFileBreakpoints = new Map(state.fileBreakpoints);
      const fileBps = newFileBreakpoints.get(breakpoint.file);
      if (fileBps) {
        newFileBreakpoints.set(
          breakpoint.file,
          fileBps.filter((bpId) => bpId !== id)
        );
      }

      return {
        breakpoints: newBreakpoints,
        fileBreakpoints: newFileBreakpoints,
      };
    });
  },

  toggleBreakpoint: (id) => {
    useExecutionStore.getState().toggleBreakpoint(id);
    set((state) => {
      const breakpoint = state.breakpoints.get(id);
      if (!breakpoint) return state;

      const newBreakpoints = new Map(state.breakpoints);
      newBreakpoints.set(id, { ...breakpoint, enabled: !breakpoint.enabled });

      return { breakpoints: newBreakpoints };
    });
  },

  updateBreakpoint: (id, updates) => {
    useExecutionStore.getState().updateBreakpoint(id, updates);
    set((state) => {
      const breakpoint = state.breakpoints.get(id);
      if (!breakpoint) return state;

      const newBreakpoints = new Map(state.breakpoints);
      newBreakpoints.set(id, { ...breakpoint, ...updates });

      return { breakpoints: newBreakpoints };
    });
  },

  clearBreakpoints: (file) => {
    useExecutionStore.getState().clearBreakpoints(file);
    set((state) => {
      if (file) {
        const fileBpIds = state.fileBreakpoints.get(file) || [];
        const newBreakpoints = new Map(state.breakpoints);
        fileBpIds.forEach((id) => newBreakpoints.delete(id));

        const newFileBreakpoints = new Map(state.fileBreakpoints);
        newFileBreakpoints.delete(file);

        return {
          breakpoints: newBreakpoints,
          fileBreakpoints: newFileBreakpoints,
        };
      }

      return {
        breakpoints: new Map(),
        fileBreakpoints: new Map(),
      };
    });
  },

  getBreakpointsForFile: (file) => {
    return useExecutionStore.getState().getBreakpointsForFile(file);
  },

  cleanupStaleBreakpoints: (validNodeIds) => {
    useExecutionStore.getState().cleanupStaleBreakpoints(validNodeIds);
    set((state) => {
      const newBreakpoints = new Map<string, Breakpoint>();
      const newFileBreakpoints = new Map<string, string[]>();

      for (const [id, bp] of state.breakpoints) {
        if (validNodeIds.has(bp.file)) {
          newBreakpoints.set(id, bp);
          const fileBps = newFileBreakpoints.get(bp.file) || [];
          newFileBreakpoints.set(bp.file, [...fileBps, id]);
        }
      }

      return {
        breakpoints: newBreakpoints,
        fileBreakpoints: newFileBreakpoints,
      };
    });
  },

  setVariables: (variables) => set({ variables }),

  updateVariable: (name, value) => {
    set((state) => ({
      variables: state.variables.map((v) =>
        v.name === name ? { ...v, value } : v
      ),
    }));
  },

  addWatchedVariable: (name) => {
    set((state) => {
      const newWatched = new Set(state.watchedVariables);
      newWatched.add(name);
      return { watchedVariables: newWatched };
    });
  },

  removeWatchedVariable: (name) => {
    set((state) => {
      const newWatched = new Set(state.watchedVariables);
      newWatched.delete(name);
      return { watchedVariables: newWatched };
    });
  },

  clearWatchedVariables: () => set({ watchedVariables: new Set() }),

  setCallStack: (stack) => set({ callStack: stack }),

  clearCallStack: () => set({ callStack: [] }),

  setCurrentPosition: (file, line) =>
    set({ currentFile: file, currentLine: line }),

  setPaused: (paused) => set({ isPaused: paused }),

  setStepping: (stepping) => set({ isStepping: stepping }),

  setStepLoading: (loading) => set({ isStepLoading: loading }),

  setDebugging: (debugging) => set({ isDebugging: debugging }),

  setLastBreakpointId: (id) => set({ lastBreakpointId: id }),

  reset: () =>
    set({
      variables: [],
      callStack: [],
      currentFile: null,
      currentLine: null,
      isPaused: false,
      isStepping: false,
      isStepLoading: false,
      isDebugging: false,
      lastBreakpointId: null,
    }),
  }),
  {
    name: 'rpaforge-debugger',
    partialize: (state) => ({
      breakpoints: Array.from(state.breakpoints.entries()),
      fileBreakpoints: Array.from(state.fileBreakpoints.entries()),
    }),
    merge: (persisted, current) => {
      const p = persisted as { breakpoints?: [string, Breakpoint][]; fileBreakpoints?: [string, string[]][] };
      const breakpoints = new Map<string, Breakpoint>(p?.breakpoints ?? []);
      const fileBreakpoints = new Map<string, string[]>(p?.fileBreakpoints ?? []);
      for (const bp of breakpoints.values()) {
        useExecutionStore.getState().addBreakpoint(bp);
      }
      return { ...current, breakpoints, fileBreakpoints };
    },
  }
));
