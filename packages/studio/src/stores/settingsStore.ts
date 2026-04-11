/**
 * RPAForge Settings Store
 *
 * Manages application settings including orchestrator configuration.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ExecutionMode } from './processStore';
import { config } from '../config/app.config';

export interface OrchestratorConfig {
  url: string;
  apiKey?: string;
  projectId?: string;
  autoSync: boolean;
}

export interface EditorSettings {
  fontSize: number;
  tabSize: number;
  wordWrap: boolean;
  minimap: boolean;
  lineNumbers: boolean;
}

export interface DesignerSettings {
  snapToGrid: boolean;
  gridSize: number;
  showMinimap: boolean;
  autoLayout: boolean;
}

export interface ExecutionSettings {
  defaultTimeout: number;
  stopOnError: boolean;
  captureScreenshots: boolean;
  logLevel: 'trace' | 'debug' | 'info' | 'warn' | 'error';
}

interface SettingsState {
  theme: 'light' | 'dark' | 'system';
  language: string;

  executionMode: ExecutionMode;
  orchestrator: OrchestratorConfig;

  editor: EditorSettings;
  designer: DesignerSettings;
  execution: ExecutionSettings;

  recentFiles: string[];
  maxRecentFiles: number;

  setTheme: (theme: 'light' | 'dark' | 'system') => void;
  setLanguage: (language: string) => void;

  setExecutionMode: (mode: ExecutionMode) => void;
  setOrchestratorConfig: (config: Partial<OrchestratorConfig>) => void;

  setEditorSettings: (settings: Partial<EditorSettings>) => void;
  setDesignerSettings: (settings: Partial<DesignerSettings>) => void;
  setExecutionSettings: (settings: Partial<ExecutionSettings>) => void;

  addRecentFile: (path: string) => void;
  removeRecentFile: (path: string) => void;
  clearRecentFiles: () => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      theme: 'system',
      language: 'en',

      executionMode: 'standalone',
      orchestrator: {
        url: '',
        autoSync: false,
      },

      editor: {
        fontSize: 14,
        tabSize: 2,
        wordWrap: true,
        minimap: false,
        lineNumbers: true,
      },

      designer: {
        snapToGrid: config.diagram.snapToGrid,
        gridSize: config.diagram.gridSize,
        showMinimap: true,
        autoLayout: false,
      },

      execution: {
        defaultTimeout: 30,
        stopOnError: false,
        captureScreenshots: true,
        logLevel: 'info',
      },

      recentFiles: [],
      maxRecentFiles: 10,

      setTheme: (theme) => set({ theme }),

      setLanguage: (language) => set({ language }),

      setExecutionMode: (mode) => set({ executionMode: mode }),

      setOrchestratorConfig: (config) => {
        set((state) => ({
          orchestrator: { ...state.orchestrator, ...config },
        }));
      },

      setEditorSettings: (settings) => {
        set((state) => ({
          editor: { ...state.editor, ...settings },
        }));
      },

      setDesignerSettings: (settings) => {
        set((state) => ({
          designer: { ...state.designer, ...settings },
        }));
      },

      setExecutionSettings: (settings) => {
        set((state) => ({
          execution: { ...state.execution, ...settings },
        }));
      },

      addRecentFile: (path) => {
        set((state) => {
          const files = state.recentFiles.filter((f) => f !== path);
          const newFiles = [path, ...files].slice(0, state.maxRecentFiles);
          return { recentFiles: newFiles };
        });
      },

      removeRecentFile: (path) => {
        set((state) => ({
          recentFiles: state.recentFiles.filter((f) => f !== path),
        }));
      },

      clearRecentFiles: () => set({ recentFiles: [] }),
    }),
    {
      name: 'rpaforge-settings',
    }
  )
);
