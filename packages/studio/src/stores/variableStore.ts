import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { VariableDefinition } from '../components/Designer/VariableDialog';

function debouncedStorage(delayMs: number) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pendingWrite: { name: string; value: string } | null = null;

  return createJSONStorage(() => ({
    getItem: (name: string) => {
      if (pendingWrite && pendingWrite.name === name) {
        return pendingWrite.value;
      }
      return localStorage.getItem(name);
    },
    setItem: (name: string, value: string) => {
      if (timer !== null) {
        clearTimeout(timer);
      }
      pendingWrite = { name, value };
      timer = setTimeout(() => {
        localStorage.setItem(name, value);
        pendingWrite = null;
        timer = null;
      }, delayMs);
    },
    removeItem: (name: string) => {
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
      pendingWrite = null;
      localStorage.removeItem(name);
    },
  }));
}

export interface ProcessVariable extends VariableDefinition {
  id: string;
  projectId: string;
  diagramId?: string;
  createdAt: string;
  updatedAt: string;
}

interface VariableState {
  variables: ProcessVariable[];

  addVariable: (variable: VariableDefinition, projectId: string, diagramId?: string) => ProcessVariable;
  updateVariable: (id: string, updates: Partial<VariableDefinition>) => void;
  removeVariable: (id: string) => void;
  getVariable: (name: string, projectId: string, diagramId?: string) => ProcessVariable | undefined;
  getVariablesByProject: (projectId: string) => ProcessVariable[];
  getVariablesByDiagram: (projectId: string, diagramId: string) => ProcessVariable[];
  getVariablesByScope: (projectId: string, scope: string, diagramId?: string) => ProcessVariable[];
  loadVariables: (projectId: string, variables: ProcessVariable[]) => void;
  clearVariables: () => void;
  clearProjectVariables: (projectId: string) => void;
  cleanStaleProjects: (maxAgeDays: number) => void;
}

const generateId = () => `var_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

const STALE_CLEANUP_KEY = 'rpaforge-variables-cleanup';
const DEFAULT_MAX_AGE_DAYS = 30;

function shouldRunCleanup(): boolean {
  const lastRun = localStorage.getItem(STALE_CLEANUP_KEY);
  if (!lastRun) return true;
  const lastRunDate = new Date(lastRun);
  const daysSince = (Date.now() - lastRunDate.getTime()) / (1000 * 60 * 60 * 24);
  return daysSince >= 1;
}

function markCleanupRun(): void {
  localStorage.setItem(STALE_CLEANUP_KEY, new Date().toISOString());
}

export const useVariableStore = create<VariableState>()(
  persist(
    (set, get) => ({
      variables: [],

      addVariable: (variable, projectId, diagramId) => {
        const newVariable: ProcessVariable = {
          ...variable,
          id: generateId(),
          projectId,
          diagramId: variable.scope === 'task' ? diagramId : undefined,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        set((state) => ({
          variables: [...state.variables, newVariable],
        }));
        return newVariable;
      },

      updateVariable: (id, updates) => {
        set((state) => ({
          variables: state.variables.map((v) =>
            v.id === id
              ? { ...v, ...updates, updatedAt: new Date().toISOString() }
              : v
          ),
        }));
      },

      removeVariable: (id) => {
        set((state) => ({
          variables: state.variables.filter((v) => v.id !== id),
        }));
      },

      getVariable: (name, projectId, diagramId) => {
        const vars = get().variables.filter(
          (v) =>
            v.projectId === projectId &&
            (v.scope === 'process' || v.diagramId === diagramId) &&
            v.name === name
        );
        return vars[0];
      },

      getVariablesByProject: (projectId) => {
        return get().variables.filter((v) => v.projectId === projectId);
      },

      getVariablesByDiagram: (projectId, diagramId) => {
        return get().variables.filter(
          (v) =>
            v.projectId === projectId &&
            (v.scope === 'process' || v.diagramId === diagramId)
        );
      },

      getVariablesByScope: (projectId, scope, diagramId) => {
        return get().variables.filter(
          (v) =>
            v.projectId === projectId &&
            v.scope === scope &&
            (scope === 'process' || v.diagramId === diagramId)
        );
      },

      loadVariables: (projectId, variables) => {
        set((state) => ({
          variables: [
            ...state.variables.filter((v) => v.projectId !== projectId),
            ...variables.map((v) => ({ ...v, projectId })),
          ],
        }));
      },

      clearVariables: () => {
        set({ variables: [] });
      },

      clearProjectVariables: (projectId) => {
        set((state) => ({
          variables: state.variables.filter((v) => v.projectId !== projectId),
        }));
      },

      cleanStaleProjects: (maxAgeDays = DEFAULT_MAX_AGE_DAYS) => {
        if (!shouldRunCleanup()) return;
        
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - maxAgeDays);
        const cutoffTime = cutoff.getTime();

        set((state) => {
          const freshVariables = state.variables.filter((v) => {
            const createdTime = new Date(v.createdAt).getTime();
            if (createdTime >= cutoffTime) return true;
            return false;
          });

          const removed = state.variables.length - freshVariables.length;
          if (removed > 0) {
            console.log(`[variableStore] Cleaned ${removed} stale variable entries`);
          }

          return { variables: freshVariables };
        });

        markCleanupRun();
      },
    }),
    {
      name: 'rpaforge-variables',
      storage: debouncedStorage(500),
    }
  )
);

if (typeof window !== 'undefined') {
  const idleCallback = window.requestIdleCallback || window.setTimeout;
  idleCallback(() => {
    useVariableStore.getState().cleanStaleProjects(DEFAULT_MAX_AGE_DAYS);
  });
}
