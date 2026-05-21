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

export type VariableHistoryEntry =
  | { type: 'add'; variable: ProcessVariable }
  | { type: 'remove'; variable: ProcessVariable }
  | { type: 'update'; id: string; before: Partial<VariableDefinition>; after: Partial<VariableDefinition> };

interface VariableState {
  variables: ProcessVariable[];
  variableUndoStack: VariableHistoryEntry[];
  variableRedoStack: VariableHistoryEntry[];

  addVariable: (variable: VariableDefinition, projectId: string, diagramId?: string) => ProcessVariable;
  updateVariable: (id: string, updates: Partial<VariableDefinition>) => void;
  removeVariable: (id: string) => void;
  undoVariableOperation: () => void;
  redoVariableOperation: () => void;
  canUndoVariable: () => boolean;
  canRedoVariable: () => boolean;
  getVariable: (name: string, projectId: string, diagramId?: string) => ProcessVariable | undefined;
  getVariablesByProject: (projectId: string) => ProcessVariable[];
  getVariablesByDiagram: (projectId: string, diagramId: string) => ProcessVariable[];
  getVariablesByScope: (projectId: string, scope: string, diagramId?: string) => ProcessVariable[];
  loadVariables: (projectId: string, variables: ProcessVariable[]) => void;
  clearVariables: () => void;
  clearProjectVariables: (projectId: string) => void;
  cleanStaleProjects: (maxAgeDays: number) => void;
}

const MAX_VARIABLE_HISTORY = 50;

const generateId = () => crypto.randomUUID();

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
      variableUndoStack: [],
      variableRedoStack: [],

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
          variableUndoStack: [
            ...state.variableUndoStack,
            { type: 'add' as const, variable: newVariable },
          ].slice(-MAX_VARIABLE_HISTORY),
          variableRedoStack: [] as VariableHistoryEntry[],
        }));
        return newVariable;
      },

      updateVariable: (id, updates) => {
        const existing = get().variables.find((v) => v.id === id);
        if (!existing) return;
        const before: Partial<VariableDefinition> = {};
        for (const key of Object.keys(updates) as (keyof VariableDefinition)[]) {
          (before as Record<string, unknown>)[key] = existing[key];
        }
        set((state) => ({
          variables: state.variables.map((v) =>
            v.id === id
              ? { ...v, ...updates, updatedAt: new Date().toISOString() }
              : v
          ),
          variableUndoStack: [
            ...state.variableUndoStack,
            { type: 'update' as const, id, before, after: updates },
          ].slice(-MAX_VARIABLE_HISTORY),
          variableRedoStack: [] as VariableHistoryEntry[],
        }));
      },

      removeVariable: (id) => {
        const existing = get().variables.find((v) => v.id === id);
        if (!existing) return;
        set((state) => ({
          variables: state.variables.filter((v) => v.id !== id),
          variableUndoStack: [
            ...state.variableUndoStack,
            { type: 'remove' as const, variable: existing },
          ].slice(-MAX_VARIABLE_HISTORY),
          variableRedoStack: [] as VariableHistoryEntry[],
        }));
      },

      undoVariableOperation: () => {
        const { variableUndoStack, variableRedoStack } = get();
        if (variableUndoStack.length === 0) return;
        const entry = variableUndoStack[variableUndoStack.length - 1];
        set((state) => {
          let variables = state.variables;
          if (entry.type === 'add') {
            variables = variables.filter((v) => v.id !== entry.variable.id);
          } else if (entry.type === 'remove') {
            variables = [...variables, entry.variable];
          } else if (entry.type === 'update') {
            variables = variables.map((v) =>
              v.id === entry.id
                ? { ...v, ...entry.before, updatedAt: new Date().toISOString() }
                : v
            );
          }
          return {
            variables,
            variableUndoStack: variableUndoStack.slice(0, -1),
            variableRedoStack: [...variableRedoStack, entry],
          };
        });
      },

      redoVariableOperation: () => {
        const { variableUndoStack, variableRedoStack } = get();
        if (variableRedoStack.length === 0) return;
        const entry = variableRedoStack[variableRedoStack.length - 1];
        set((state) => {
          let variables = state.variables;
          if (entry.type === 'add') {
            variables = [...variables, entry.variable];
          } else if (entry.type === 'remove') {
            variables = variables.filter((v) => v.id !== entry.variable.id);
          } else if (entry.type === 'update') {
            variables = variables.map((v) =>
              v.id === entry.id
                ? { ...v, ...entry.after, updatedAt: new Date().toISOString() }
                : v
            );
          }
          return {
            variables,
            variableUndoStack: [...variableUndoStack, entry],
            variableRedoStack: variableRedoStack.slice(0, -1),
          };
        });
      },

      canUndoVariable: () => get().variableUndoStack.length > 0,

      canRedoVariable: () => get().variableRedoStack.length > 0,

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
