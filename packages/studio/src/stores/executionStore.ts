import { create } from 'zustand';

export type ExecutionState = 'idle' | 'running' | 'paused' | 'stopped';
export type ExecutionSpeed = 0.5 | 1 | 2 | 5;

interface ExecutionStateData {
  executionState: ExecutionState;
  executionProgress: number;
  currentExecutingNodeId: string | null;
  executionSpeed: ExecutionSpeed;

  setExecutionState: (state: ExecutionState) => void;
  setExecutionProgress: (progress: number) => void;
  setCurrentExecutingNode: (id: string | null) => void;
  setExecutionSpeed: (speed: ExecutionSpeed) => void;
  resetExecution: () => void;
}

export const useExecutionStore = create<ExecutionStateData>((set) => ({
  executionState: 'idle',
  executionProgress: 0,
  currentExecutingNodeId: null,
  executionSpeed: 1,

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
}));
