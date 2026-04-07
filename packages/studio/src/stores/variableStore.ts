import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { VariableDefinition } from '../components/Designer/VariableDialog';

export interface ProcessVariable extends VariableDefinition {
  id: string;
  createdAt: string;
  updatedAt: string;
}

interface VariableState {
  variables: ProcessVariable[];

  addVariable: (variable: VariableDefinition) => ProcessVariable;
  updateVariable: (id: string, updates: Partial<VariableDefinition>) => void;
  removeVariable: (id: string) => void;
  getVariable: (name: string) => ProcessVariable | undefined;
  getVariablesByScope: (scope: string) => ProcessVariable[];
  clearVariables: () => void;
}

const generateId = () => `var_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

export const useVariableStore = create<VariableState>()(
  persist(
    (set, get) => ({
      variables: [],

      addVariable: (variable) => {
        const newVariable: ProcessVariable = {
          ...variable,
          id: generateId(),
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

      getVariable: (name) => {
        return get().variables.find((v) => v.name === name);
      },

      getVariablesByScope: (scope) => {
        return get().variables.filter((v) => v.scope === scope);
      },

      clearVariables: () => {
        set({ variables: [] });
      },
    }),
    {
      name: 'rpaforge-variables',
    }
  )
);
