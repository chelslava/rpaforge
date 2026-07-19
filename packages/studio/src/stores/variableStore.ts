import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { VariableDefinition } from '../components/Designer/VariableDialog';
import { createLogger } from '../utils/logger';
import { sanitizeVariablesForPersistence } from '../utils/secretSerialization';
import type { SecretVariableAPI } from '../types/ipc-contracts';

const logger = createLogger('variableStore');

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
  secretRef?: string;
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
  loadVariables: (projectId: string, variables: Omit<ProcessVariable, 'projectId'>[]) => void;
  clearVariables: () => void;
  clearProjectVariables: (projectId: string) => void;
  cleanStaleProjects: (maxAgeDays: number) => void;
}

const generateId = () => crypto.randomUUID();

const STALE_CLEANUP_KEY = 'rpaforge-variables-cleanup';
const DEFAULT_MAX_AGE_DAYS = 30;

function getSecretApi(): SecretVariableAPI | undefined {
  return typeof window !== 'undefined' ? window.rpaforge?.secrets : undefined;
}

function storeSecret(variableId: string, value: string): void {
  const secrets = getSecretApi();
  if (!secrets) {
    logger.warn('Secret value was discarded because secure storage is unavailable');
    return;
  }
  void secrets.set(variableId, value).then(({ secretRef }) => {
    useVariableStore.setState((state) => ({
      variables: state.variables.map((variable) =>
        variable.id === variableId ? { ...variable, secretRef, updatedAt: new Date().toISOString() } : variable
      ),
    }));
  }).catch((error) => logger.error('Failed to store secret variable', error));
}

function deleteStoredSecret(secretRef: string | undefined): void {
  if (!secretRef) return;
  const secrets = getSecretApi();
  if (!secrets) return;
  void secrets.delete(secretRef).catch((error) => logger.error('Failed to delete secret variable', error));
}

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
        const id = generateId();
        const secretValue = variable.type === 'secret' ? variable.value : undefined;
        const newVariable: ProcessVariable = {
          ...variable,
          value: variable.type === 'secret' ? '' : variable.value,
          id,
          projectId,
          diagramId: variable.scope === 'task' ? diagramId : undefined,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        set((state) => ({
          variables: [...state.variables, newVariable],
        }));
        if (secretValue !== undefined) storeSecret(id, secretValue);
        return newVariable;
      },

      updateVariable: (id, updates) => {
        const current = get().variables.find((variable) => variable.id === id);
        const secretValue = updates.type === 'secret' || current?.type === 'secret' ? updates.value : undefined;
        const safeUpdates = secretValue !== undefined ? { ...updates, value: '' } : updates;
        set((state) => ({
          variables: state.variables.map((v) =>
            v.id === id
              ? { ...v, ...safeUpdates, updatedAt: new Date().toISOString() }
              : v
          ),
        }));
        if (secretValue !== undefined) storeSecret(id, secretValue);
      },

      removeVariable: (id) => {
        deleteStoredSecret(get().variables.find((variable) => variable.id === id)?.secretRef);
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
        const now = new Date().toISOString();
        const safeVariables = variables.map((variable) => {
          if (variable.type !== 'secret') return variable;
          const secretValue = variable.value;
          if (secretValue && !secretValue.startsWith('secret://')) {
            storeSecret(variable.id ?? generateId(), secretValue);
          }
          return { ...variable, value: '' };
        });
        set((state) => ({
          variables: [
            ...state.variables.filter((v) => v.projectId !== projectId),
            ...safeVariables.map((v) => ({
              ...v,
              projectId,
              id: v.id ?? generateId(),
              createdAt: v.createdAt ?? now,
              updatedAt: v.updatedAt ?? now,
            })),
          ],
        }));
      },

      clearVariables: () => {
        get().variables.forEach((variable) => deleteStoredSecret(variable.secretRef));
        set({ variables: [] });
      },

      clearProjectVariables: (projectId) => {
        get().variables.filter((variable) => variable.projectId === projectId).forEach((variable) => deleteStoredSecret(variable.secretRef));
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
            logger.debug(`Cleaned ${removed} stale variable entries`);
          }

          return { variables: freshVariables };
        });

        markCleanupRun();
      },
    }),
    {
      name: 'rpaforge-variables',
      storage: debouncedStorage(500),
      version: 1,
      partialize: (state) => ({ variables: sanitizeVariablesForPersistence(state.variables) }),
      migrate: (persistedState) => {
        const state = persistedState as Partial<VariableState> | undefined;
        return {
          variables: sanitizeVariablesForPersistence(state?.variables ?? []),
        };
      },
    }
  )
);

if (typeof window !== 'undefined') {
  const idleCallback = window.requestIdleCallback || window.setTimeout;
  idleCallback(() => {
    useVariableStore.getState().cleanStaleProjects(DEFAULT_MAX_AGE_DAYS);
  });
}
