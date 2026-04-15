import { create } from 'zustand';

export type ExecutionStatus = 'running' | 'completed' | 'failed' | 'stopped';

export interface ExecutionHistoryEntry {
  id: string;
  processName: string;
  startTime: Date;
  endTime: Date | null;
  status: ExecutionStatus;
  duration: number | null;
  activitiesExecuted: number;
  errorMessage?: string;
}

export interface ActivityExecutionRecord {
  id: string;
  executionId: string;
  activityName: string;
  nodeName: string;
  nodeId: string;
  startTime: Date;
  endTime: Date | null;
  status: 'running' | 'success' | 'failed' | 'skipped';
  duration: number | null;
  error?: string;
  output?: unknown;
}

interface ExecutionHistoryState {
  history: ExecutionHistoryEntry[];
  activityRecords: Map<string, ActivityExecutionRecord[]>;
  currentExecution: ExecutionHistoryEntry | null;
  maxHistorySize: number;

  startExecution: (processName: string) => string;
  endExecution: (id: string, status: ExecutionStatus, errorMessage?: string) => void;
  
  recordActivityStart: (executionId: string, activityName: string, nodeName: string, nodeId: string) => string;
  recordActivityEnd: (recordId: string, status: 'success' | 'failed' | 'skipped', output?: unknown, error?: string) => void;
  
  getExecutionActivities: (executionId: string) => ActivityExecutionRecord[];
  clearHistory: () => void;
  getHistory: () => ExecutionHistoryEntry[];
}

export const useExecutionHistoryStore = create<ExecutionHistoryState>((set, get) => ({
  history: [],
  activityRecords: new Map(),
  currentExecution: null,
  maxHistorySize: 100,

  startExecution: (processName) => {
    const id = `exec-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const entry: ExecutionHistoryEntry = {
      id,
      processName,
      startTime: new Date(),
      endTime: null,
      status: 'running',
      duration: null,
      activitiesExecuted: 0,
    };

    set((state) => {
      const newRecords = new Map(state.activityRecords);
      newRecords.set(id, []);

      return {
        history: [entry, ...state.history].slice(0, state.maxHistorySize),
        activityRecords: newRecords,
        currentExecution: entry,
      };
    });

    return id;
  },

  endExecution: (id, status, errorMessage) => {
    const now = new Date();

    set((state) => {
      const history = state.history.map((entry) => {
        if (entry.id !== id) return entry;

        const duration = now.getTime() - entry.startTime.getTime();
        return {
          ...entry,
          endTime: now,
          status,
          duration,
          errorMessage,
        };
      });

      return {
        history,
        currentExecution: state.currentExecution?.id === id ? null : state.currentExecution,
      };
    });
  },

  recordActivityStart: (executionId, activityName, nodeName, nodeId) => {
    const id = `act-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const record: ActivityExecutionRecord = {
      id,
      executionId,
      activityName,
      nodeName,
      nodeId,
      startTime: new Date(),
      endTime: null,
      status: 'running',
      duration: null,
    };

    set((state) => {
      const newRecords = new Map(state.activityRecords);
      const records = newRecords.get(executionId) || [];
      newRecords.set(executionId, [...records, record]);

      return { activityRecords: newRecords };
    });

    return id;
  },

  recordActivityEnd: (recordId, status, output, error) => {
    const now = new Date();

    set((state) => {
      const newRecords = new Map(state.activityRecords);

      for (const [execId, records] of newRecords) {
        const recordIndex = records.findIndex((r) => r.id === recordId);
        if (recordIndex !== -1) {
          const record = records[recordIndex];
          const duration = now.getTime() - record.startTime.getTime();

          records[recordIndex] = {
            ...record,
            endTime: now,
            status,
            duration,
            output,
            error,
          };

          const history = state.history.map((entry) => {
            if (entry.id !== execId) return entry;
            return {
              ...entry,
              activitiesExecuted: entry.activitiesExecuted + 1,
            };
          });

          return { activityRecords: newRecords, history };
        }
      }

      return { activityRecords: newRecords };
    });
  },

  getExecutionActivities: (executionId) => {
    return get().activityRecords.get(executionId) || [];
  },

  clearHistory: () => {
    set({
      history: [],
      activityRecords: new Map(),
      currentExecution: null,
    });
  },

  getHistory: () => {
    return get().history;
  },
}));
