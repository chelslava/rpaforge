/**
 * RPAForge Orchestrator Store
 *
 * Manages connection and communication with Control Tower orchestrator.
 * Used when execution mode is 'orchestrator'.
 */

import { create } from 'zustand';

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface OrchestratorProject {
  id: string;
  name: string;
  description?: string;
  processCount: number;
  lastModified: string;
}

export interface OrchestratorProcess {
  id: string;
  name: string;
  projectId: string;
  status: 'draft' | 'published' | 'archived';
  version: string;
  lastModified: string;
}

export interface OrchestratorQueue {
  id: string;
  name: string;
  processId: string;
  pending: number;
  running: number;
  completed: number;
  failed: number;
}

export interface OrchestratorJob {
  id: string;
  processId: string;
  queueId?: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  startedAt?: string;
  finishedAt?: string;
  robotName?: string;
}

interface OrchestratorState {
  connectionStatus: ConnectionStatus;
  lastError: string | null;

  projects: OrchestratorProject[];
  currentProject: OrchestratorProject | null;

  processes: OrchestratorProcess[];
  queues: OrchestratorQueue[];
  jobs: OrchestratorJob[];

  setConnectionStatus: (status: ConnectionStatus) => void;
  setLastError: (error: string | null) => void;

  setProjects: (projects: OrchestratorProject[]) => void;
  setCurrentProject: (project: OrchestratorProject | null) => void;

  setProcesses: (processes: OrchestratorProcess[]) => void;
  setQueues: (queues: OrchestratorQueue[]) => void;
  setJobs: (jobs: OrchestratorJob[]) => void;

  addJob: (job: OrchestratorJob) => void;
  updateJob: (id: string, updates: Partial<OrchestratorJob>) => void;

  connect: (url: string, apiKey: string) => Promise<void>;
  disconnect: () => void;
  refresh: () => Promise<void>;

  publishProcess: (processId: string) => Promise<void>;
  startJob: (processId: string, queueId?: string) => Promise<OrchestratorJob>;
  stopJob: (jobId: string) => Promise<void>;
}

export const useOrchestratorStore = create<OrchestratorState>((set, get) => ({
  connectionStatus: 'disconnected',
  lastError: null,

  projects: [],
  currentProject: null,

  processes: [],
  queues: [],
  jobs: [],

  setConnectionStatus: (status) => set({ connectionStatus: status }),

  setLastError: (error) => set({ lastError: error }),

  setProjects: (projects) => set({ projects }),

  setCurrentProject: (project) => set({ currentProject: project }),

  setProcesses: (processes) => set({ processes }),

  setQueues: (queues) => set({ queues }),

  setJobs: (jobs) => set({ jobs }),

  addJob: (job) =>
    set((state) => ({
      jobs: [...state.jobs, job],
    })),

  updateJob: (id, updates) =>
    set((state) => ({
      jobs: state.jobs.map((job) =>
        job.id === id ? { ...job, ...updates } : job
      ),
    })),

  connect: async (url, apiKey) => {
    set({ connectionStatus: 'connecting', lastError: null });

    try {
      const response = await fetch(`${url}/api/v1/projects`, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
      });

      if (!response.ok) {
        throw new Error(`Connection failed: ${response.statusText}`);
      }

      const projects = await response.json();
      set({
        connectionStatus: 'connected',
        projects,
      });
    } catch (error) {
      set({
        connectionStatus: 'error',
        lastError: error instanceof Error ? error.message : 'Connection failed',
      });
      throw error;
    }
  },

  disconnect: () => {
    set({
      connectionStatus: 'disconnected',
      lastError: null,
      projects: [],
      currentProject: null,
      processes: [],
      queues: [],
      jobs: [],
    });
  },

  refresh: async () => {
    const { connectionStatus, currentProject } = get();
    if (connectionStatus !== 'connected') return;

    try {
      if (currentProject) {
        const [processesRes, queuesRes] = await Promise.all([
          fetch(`/api/v1/projects/${currentProject.id}/processes`),
          fetch(`/api/v1/projects/${currentProject.id}/queues`),
        ]);

        const processes = await processesRes.json();
        const queues = await queuesRes.json();

        set({ processes, queues });
      }
    } catch (error) {
      set({
        lastError: error instanceof Error ? error.message : 'Refresh failed',
      });
    }
  },

  publishProcess: async (processId) => {
    const response = await fetch(`/api/v1/processes/${processId}/publish`, {
      method: 'POST',
    });

    if (!response.ok) {
      throw new Error('Failed to publish process');
    }

    await get().refresh();
  },

  startJob: async (processId, queueId) => {
    const response = await fetch('/api/v1/jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ processId, queueId }),
    });

    if (!response.ok) {
      throw new Error('Failed to start job');
    }

    const job = await response.json();
    get().addJob(job);
    return job;
  },

  stopJob: async (jobId) => {
    const response = await fetch(`/api/v1/jobs/${jobId}/stop`, {
      method: 'POST',
    });

    if (!response.ok) {
      throw new Error('Failed to stop job');
    }

    get().updateJob(jobId, { status: 'cancelled' });
  },
}));
