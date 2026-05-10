import { create } from 'zustand';
import type { Breakpoint } from '../types/engine';

export type ExecutionState = 'idle' | 'running' | 'paused' | 'stopped';
export type ExecutionSpeed = 0.5 | 1 | 2 | 5;

interface ExecutionStateData {
  executionState: ExecutionState;
  executionProgress: number;
  currentExecutingNodeId: string | null;
  executionSpeed: ExecutionSpeed;

  // Breakpoint state (migrated from debuggerStore)
  breakpoints: Map<string, Breakpoint>;
  fileBreakpoints: Map<string, string[]>;

  setExecutionState: (state: ExecutionState) => void;
  setExecutionProgress: (progress: number) => void;
  setCurrentExecutingNode: (id: string | null) => void;
  setExecutionSpeed: (speed: ExecutionSpeed) => void;
  resetExecution: () => void;

  // Breakpoint methods
  addBreakpoint: (breakpoint: Breakpoint) => void;
  removeBreakpoint: (id: string) => void;
  toggleBreakpoint: (id: string) => void;
  updateBreakpoint: (id: string, updates: Partial<Breakpoint>) => void;
  clearBreakpoints: (file?: string) => void;
  getBreakpointsForFile: (file: string) => Breakpoint[];
  cleanupStaleBreakpoints: (validNodeIds: Set<string>) => void;
}

export const useExecutionStore = create<ExecutionStateData>((set, get) => ({
  executionState: 'idle',
  executionProgress: 0,
  currentExecutingNodeId: null,
  executionSpeed: 1,

  // Breakpoint state
  breakpoints: new Map(),
  fileBreakpoints: new Map(),

  setExecutionState: (state) => set({ executionState: state }),

  setExecutionProgress: (progress) => set({ executionProgress: progress }),

  setCurrentExecutingNode: (id) => set({ currentExecutingNodeId: id }),

  setExecutionSpeed: (speed) => set({ executionSpeed: speed }),

  resetExecution: () =>
    set({
      executionState: 'idle',
      executionProgress: 0,
      currentExecutingNodeId: null,
    }),

  // Breakpoint methods
  addBreakpoint: (breakpoint) => {
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
    set((state) => {
      const breakpoint = state.breakpoints.get(id);
      if (!breakpoint) return state;

      const newBreakpoints = new Map(state.breakpoints);
      newBreakpoints.set(id, { ...breakpoint, enabled: !breakpoint.enabled });

      return { breakpoints: newBreakpoints };
    });
  },

  updateBreakpoint: (id, updates) => {
    set((state) => {
      const breakpoint = state.breakpoints.get(id);
      if (!breakpoint) return state;

      const newBreakpoints = new Map(state.breakpoints);
      newBreakpoints.set(id, { ...breakpoint, ...updates });

      return { breakpoints: newBreakpoints };
    });
  },

  clearBreakpoints: (file) => {
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
    const state = get();
    const bpIds = state.fileBreakpoints.get(file) || [];
    return bpIds
      .map((id) => state.breakpoints.get(id))
      .filter((bp): bp is Breakpoint => bp !== undefined);
  },

  cleanupStaleBreakpoints: (validNodeIds) => {
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
}));
