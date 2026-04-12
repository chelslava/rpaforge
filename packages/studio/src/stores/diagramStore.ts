import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Edge, Node } from '@reactflow/core';
import { config } from '../config/app.config';
import type { ProcessMetadata, ProcessNodeData } from './processStore';
import { createStartBlockNode } from './processStore';

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

export interface DiagramDocument {
  metadata: ProcessMetadata;
  nodes: Node<ProcessNodeData>[];
  edges: Edge[];
  viewport?: { x: number; y: number; zoom: number };
}

interface DiagramState {
  project: ProjectConfig | null;
  activeDiagramId: string | null;
  openDiagramIds: string[];
  recentDiagrams: string[];
  folders: string[];
  diagramDocuments: Record<string, DiagramDocument>;

  createProject: (name: string) => void;
  loadProject: (
    config: ProjectConfig,
    documents?: Record<string, DiagramDocument>
  ) => void;
  saveProject: () => ProjectConfig | null;

  addDiagram: (diagram: Omit<DiagramMetadata, 'id' | 'createdAt' | 'updatedAt'>) => DiagramMetadata;
  updateDiagram: (id: string, updates: Partial<DiagramMetadata>) => void;
  removeDiagram: (id: string) => void;
  getDiagram: (id: string) => DiagramMetadata | undefined;
  getDiagramDocument: (id: string) => DiagramDocument | undefined;
  ensureDiagramDocument: (id: string) => DiagramDocument | undefined;
  saveDiagramDocument: (id: string, document: DiagramDocument) => void;
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
  defaultTimeout: config.debugger.defaultTimeoutMs,
  screenshotOnError: true,
};

function createDiagramDocument(diagram: DiagramMetadata): DiagramDocument {
  return {
    metadata: {
      id: diagram.id,
      name: diagram.name,
      description: diagram.description,
      createdAt: diagram.createdAt,
      updatedAt: diagram.updatedAt,
    },
    nodes: [createStartBlockNode(diagram.name)],
    edges: [],
  };
}

export const useDiagramStore = create<DiagramState>()(
  persist(
    (set, get) => ({
      project: null,
      activeDiagramId: null,
      openDiagramIds: [],
      recentDiagrams: [],
      folders: [],
      diagramDocuments: {},

      createProject: (name) => {
        const mainDiagram: DiagramMetadata = {
          id: generateId(),
          name: 'Main Process',
          type: 'main',
          path: 'processes/main.diagram.json',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        const mainDocument = createDiagramDocument(mainDiagram);
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
          diagramDocuments: {
            [mainDiagram.id]: mainDocument,
          },
        });
      },

      loadProject: (config, documents) => {
        const generatedDocuments = Object.fromEntries(
          config.diagrams.map((diagram) => [
            diagram.id,
            documents?.[diagram.id] || createDiagramDocument(diagram),
          ])
        );

        set({
          project: config,
          activeDiagramId: config.main,
          openDiagramIds: config.main ? [config.main] : [],
          folders: config.diagrams
            .map((diagram) => diagram.folder)
            .filter((folder): folder is string => Boolean(folder)),
          diagramDocuments: generatedDocuments,
        });
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
          diagramDocuments: {
            ...state.diagramDocuments,
            [newDiagram.id]: createDiagramDocument(newDiagram),
          },
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
          diagramDocuments: state.diagramDocuments[id]
            ? {
                ...state.diagramDocuments,
                [id]: {
                  ...state.diagramDocuments[id],
                  metadata: {
                    ...state.diagramDocuments[id].metadata,
                    name:
                      typeof updates.name === 'string'
                        ? updates.name
                        : state.diagramDocuments[id].metadata.name,
                    description:
                      updates.description !== undefined
                        ? updates.description
                        : state.diagramDocuments[id].metadata.description,
                    updatedAt: new Date().toISOString(),
                  },
                },
              }
            : state.diagramDocuments,
        }));
      },

      removeDiagram: (id) => {
        const nextDocuments = { ...get().diagramDocuments };
        delete nextDocuments[id];

        set((state) => ({
          project: state.project
            ? {
                ...state.project,
                diagrams: state.project.diagrams.filter((d) => d.id !== id),
              }
            : null,
          openDiagramIds: state.openDiagramIds.filter((dId) => dId !== id),
          activeDiagramId: state.activeDiagramId === id ? null : state.activeDiagramId,
          diagramDocuments: nextDocuments,
        }));
      },

      getDiagram: (id) => {
        return get().project?.diagrams.find((d) => d.id === id);
      },

      getDiagramDocument: (id) => {
        return get().diagramDocuments[id];
      },

      ensureDiagramDocument: (id) => {
        const existing = get().diagramDocuments[id];
        if (existing) {
          return existing;
        }

        const diagram = get().project?.diagrams.find((candidate) => candidate.id === id);
        if (!diagram) {
          return undefined;
        }

        const document = createDiagramDocument(diagram);
        set((state) => ({
          diagramDocuments: {
            ...state.diagramDocuments,
            [id]: document,
          },
        }));

        return document;
      },

      saveDiagramDocument: (id, document) => {
        set((state) => ({
          diagramDocuments: {
            ...state.diagramDocuments,
            [id]: document,
          },
        }));
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
        folders: state.folders,
        activeDiagramId: state.activeDiagramId,
        openDiagramIds: state.openDiagramIds,
        diagramDocuments: state.diagramDocuments,
      }),
    }
  )
);
