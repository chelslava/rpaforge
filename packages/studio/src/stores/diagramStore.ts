import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type DiagramType = 'main' | 'sub-diagram' | 'library';

export interface DiagramMetadata {
  id: string;
  name: string;
  type: DiagramType;
  path: string;
  inputs?: string[];
  outputs?: string[];
  description?: string;
  folder?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectConfig {
  name: string;
  version: string;
  main: string;
  diagrams: DiagramMetadata[];
  settings: {
    defaultTimeout: number;
    screenshotOnError: boolean;
  };
}

interface DiagramState {
  project: ProjectConfig | null;
  activeDiagramId: string | null;
  openDiagramIds: string[];
  recentDiagrams: string[];
  folders: string[];

  createProject: (name: string) => void;
  loadProject: (config: ProjectConfig) => void;
  saveProject: () => ProjectConfig | null;

  addDiagram: (diagram: Omit<DiagramMetadata, 'id' | 'createdAt' | 'updatedAt'>) => DiagramMetadata;
  updateDiagram: (id: string, updates: Partial<DiagramMetadata>) => void;
  removeDiagram: (id: string) => void;
  getDiagram: (id: string) => DiagramMetadata | undefined;
  getDiagramsByFolder: (folder?: string) => DiagramMetadata[];
  getSubDiagrams: () => DiagramMetadata[];

  addFolder: (path: string) => void;
  removeFolder: (path: string) => void;

  setActiveDiagram: (id: string | null) => void;
  openDiagram: (id: string) => void;
  closeDiagram: (id: string) => void;
  closeAllDiagrams: () => void;

  getOpenDiagrams: () => DiagramMetadata[];
}

const generateId = () => `diagram_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

const DEFAULT_SETTINGS = {
  defaultTimeout: 30000,
  screenshotOnError: true,
};

export const useDiagramStore = create<DiagramState>()(
  persist(
    (set, get) => ({
      project: null,
      activeDiagramId: null,
      openDiagramIds: [],
      recentDiagrams: [],
      folders: [],

      createProject: (name) => {
        const mainDiagram: DiagramMetadata = {
          id: generateId(),
          name: 'Main Process',
          type: 'main',
          path: 'processes/main.diagram.json',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        const project: ProjectConfig = {
          name,
          version: '1.0.0',
          main: mainDiagram.id,
          diagrams: [mainDiagram],
          settings: DEFAULT_SETTINGS,
        };

        set({
          project,
          activeDiagramId: mainDiagram.id,
          openDiagramIds: [mainDiagram.id],
        });
      },

      loadProject: (config) => {
        set({ project: config });
      },

      saveProject: () => {
        return get().project;
      },

      addDiagram: (diagramData) => {
        const newDiagram: DiagramMetadata = {
          ...diagramData,
          id: generateId(),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        set((state) => ({
          project: state.project
            ? {
                ...state.project,
                diagrams: [...state.project.diagrams, newDiagram],
              }
            : null,
        }));

        return newDiagram;
      },

      updateDiagram: (id, updates) => {
        set((state) => ({
          project: state.project
            ? {
                ...state.project,
                diagrams: state.project.diagrams.map((d) =>
                  d.id === id
                    ? { ...d, ...updates, updatedAt: new Date().toISOString() }
                    : d
                ),
              }
            : null,
        }));
      },

      removeDiagram: (id) => {
        set((state) => ({
          project: state.project
            ? {
                ...state.project,
                diagrams: state.project.diagrams.filter((d) => d.id !== id),
              }
            : null,
          openDiagramIds: state.openDiagramIds.filter((dId) => dId !== id),
          activeDiagramId: state.activeDiagramId === id ? null : state.activeDiagramId,
        }));
      },

      getDiagram: (id) => {
        return get().project?.diagrams.find((d) => d.id === id);
      },

      getDiagramsByFolder: (folder) => {
        const diagrams = get().project?.diagrams || [];
        if (!folder) {
          return diagrams.filter((d) => !d.folder);
        }
        return diagrams.filter((d) => d.folder === folder);
      },

      getSubDiagrams: () => {
        return get().project?.diagrams.filter((d) => d.type === 'sub-diagram') || [];
      },

      addFolder: (path) => {
        set((state) => {
          if (state.folders.includes(path)) return state;
          return { folders: [...state.folders, path].sort() };
        });
      },

      removeFolder: (path) => {
        set((state) => ({
          folders: state.folders.filter((f) => f !== path && !f.startsWith(path + '/')),
        }));
      },

      setActiveDiagram: (id) => {
        set({ activeDiagramId: id });
        if (id && !get().openDiagramIds.includes(id)) {
          set((state) => ({ openDiagramIds: [...state.openDiagramIds, id] }));
        }
      },

      openDiagram: (id) => {
        if (!get().openDiagramIds.includes(id)) {
          set((state) => ({ openDiagramIds: [...state.openDiagramIds, id] }));
        }
        set({ activeDiagramId: id });
      },

      closeDiagram: (id) => {
        const state = get();
        const newOpenIds = state.openDiagramIds.filter((dId) => dId !== id);

        set({
          openDiagramIds: newOpenIds,
          activeDiagramId:
            state.activeDiagramId === id
              ? newOpenIds[newOpenIds.length - 1] || null
              : state.activeDiagramId,
        });
      },

      closeAllDiagrams: () => {
        set({ openDiagramIds: [], activeDiagramId: null });
      },

      getOpenDiagrams: () => {
        const project = get().project;
        if (!project) return [];
        return project.diagrams.filter((d) => get().openDiagramIds.includes(d.id));
      },
    }),
    {
      name: 'rpaforge-diagrams',
      partialize: (state) => ({
        project: state.project,
        recentDiagrams: state.recentDiagrams,
      }),
    }
  )
);
