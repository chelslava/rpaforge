import { create } from 'zustand';
import type { FileSystemAPI } from '../types/ipc-contracts';
import type { FsEvent } from '../types/events';
import type { ProjectConfig, DiagramMetadata, DiagramDocument, DiagramType } from './diagramStore';
import { useDiagramStore } from './diagramStore';
import { createLogger } from '../utils/logger';

const logger = createLogger('projectFsStore');

export interface ProjectFile {
  name: string;
  path: string;
  relativePath: string;
  isDirectory: boolean;
  isFile: boolean;
  extension: string;
  isProcessFile: boolean;
  isProjectFile: boolean;
  isOtherFile: boolean;
  size?: number;
  modifiedAt?: string;
}

export interface LoadedProject {
  config: ProjectConfig;
  documents: Record<string, DiagramDocument>;
}

interface ProjectFsState {
  projectPath: string | null;
  projectFile: string | null;
  projectConfig: ProjectConfig | null;
  files: ProjectFile[];
  isLoading: boolean;
  error: string | null;
  isWatching: boolean;

  loadProject: (projectPath: string) => Promise<LoadedProject | null>;
  closeProject: () => void;
  refreshFiles: () => Promise<void>;
  createFile: (relativePath: string, content: string) => Promise<void>;
  createFolder: (relativePath: string) => Promise<void>;
  deleteFile: (relativePath: string) => Promise<void>;
  renameFile: (oldRelativePath: string, newRelativePath: string) => Promise<void>;
  openWithSystem: (relativePath: string) => Promise<void>;
  showInFolder: (relativePath: string) => Promise<void>;
  readFile: (relativePath: string) => Promise<string>;
  writeFile: (relativePath: string, content: string) => Promise<void>;
  handleFsEvent: (event: FsEvent) => void;
}

const STUDIO_EXTENSIONS = ['.process', '.rpaforge'];
const IGNORED_DIRS = ['node_modules', '.git', '__pycache__', '.DS_Store', 'dist', 'dist-electron'];

function isStudioFile(extension: string): boolean {
  return STUDIO_EXTENSIONS.includes(extension.toLowerCase());
}

function shouldIgnore(name: string): boolean {
  return IGNORED_DIRS.includes(name) || name.startsWith('.');
}

function getFs(): FileSystemAPI | undefined {
  return window.rpaforge?.fs;
}

async function scanDirectory(dirPath: string, basePath: string): Promise<ProjectFile[]> {
  const fs = getFs();
  if (!fs) {
    logger.warn('FileSystem API not available in scanDirectory');
    return [];
  }

  const files: ProjectFile[] = [];

  try {
    const entries = await fs.readDir(dirPath);

    for (const entry of entries) {
      if (shouldIgnore(entry.name)) continue;

      const relativePath = entry.path.substring(basePath.length + 1);

      if (entry.isDirectory) {
        files.push({
          name: entry.name,
          path: entry.path,
          relativePath,
          isDirectory: true,
          isFile: false,
          extension: '',
          isProcessFile: false,
          isProjectFile: false,
          isOtherFile: false,
        });

        const subFiles = await scanDirectory(entry.path, basePath);
        files.push(...subFiles);
      } else {
        const ext = entry.extension.toLowerCase();
        files.push({
          name: entry.name,
          path: entry.path,
          relativePath,
          isDirectory: false,
          isFile: true,
          extension: ext,
          isProcessFile: ext === '.process',
          isProjectFile: ext === '.rpaforge',
          isOtherFile: !isStudioFile(ext),
          size: entry.size,
          modifiedAt: entry.modifiedAt,
        });
      }
    }
  } catch (e) {
    logger.error(`Failed to scan directory: ${dirPath}`, e);
  }

  return files;
}

interface ProcessFileContent {
  version: string;
  templateType?: string;
  metadata?: {
    id: string;
    name: string;
    description?: string;
    createdAt?: string;
    updatedAt?: string;
  };
  diagram?: {
    nodes: unknown[];
    edges: unknown[];
  };
  nodes?: unknown[];
  edges?: unknown[];
}

interface RpaforgeFileContent {
  version: string;
  templateType?: string;
  metadata?: {
    id: string;
    name: string;
    description?: string;
    category?: string;
  };
  project: {
    name: string;
    version: string;
    settings?: {
      defaultTimeout?: number;
      screenshotOnError?: boolean;
    };
  };
  diagrams: Array<{
    path: string;
    type: DiagramType;
    name: string;
    folder?: string;
  }>;
  folders?: string[];
}

async function loadProcessFile(filePath: string): Promise<ProcessFileContent | null> {
  const fs = getFs();
  if (!fs) return null;

  try {
    const content = await fs.readFile(filePath);
    return JSON.parse(content) as ProcessFileContent;
  } catch (e) {
    logger.error(`Failed to load process file: ${filePath}`, e);
    return null;
  }
}

function generateDiagramId(): string {
  return `diagram_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

let refreshTimeout: ReturnType<typeof setTimeout> | null = null;

export const useProjectFsStore = create<ProjectFsState>((set, get) => ({
  projectPath: null,
  projectFile: null,
  projectConfig: null,
  files: [],
  isLoading: false,
  error: null,
  isWatching: false,

  loadProject: async (projectPath: string) => {
    const fs = getFs();
    if (!fs) {
      set({ error: 'FileSystem API not available' });
      return null;
    }

    set({ isLoading: true, error: null });

    try {
      const exists = await fs.pathExists(projectPath);
      if (!exists) {
        set({ error: 'Project path does not exist', isLoading: false });
        return null;
      }

      const files = await scanDirectory(projectPath, projectPath);
      const projectFile = files.find((f) => f.isProjectFile);

      if (!projectFile) {
        set({ error: 'No .rpaforge file found in project folder', isLoading: false });
        return null;
      }

      const rpaforgeContent = await fs.readFile(projectFile.path);
      const rpaforgeData = JSON.parse(rpaforgeContent) as RpaforgeFileContent;

      const diagrams: DiagramMetadata[] = [];
      const documents: Record<string, DiagramDocument> = {};
      const folders = new Set<string>(rpaforgeData.folders || []);

      const diagramInfoByPath = new Map<string, { type: DiagramType; name: string; folder?: string }>();
      for (const d of rpaforgeData.diagrams || []) {
        diagramInfoByPath.set(d.path, { type: d.type, name: d.name, folder: d.folder });
        if (d.folder) {
          folders.add(d.folder);
        }
      }

      const processFiles = files.filter((f) => f.isProcessFile);
      let mainDiagramId: string | undefined;

      for (const processFile of processFiles) {
        const processData = await loadProcessFile(processFile.path);
        if (!processData) continue;

        const relativePath = processFile.relativePath;
        const info = diagramInfoByPath.get(relativePath);

        const diagramType: DiagramType = info?.type || (relativePath === 'Main.process' ? 'main' : 'sub-diagram');
        const diagramName = info?.name || processData.metadata?.name || processFile.name.replace('.process', '');
        const diagramFolder = info?.folder;

        const diagramId = processData.metadata?.id || generateDiagramId();

        const diagram: DiagramMetadata = {
          id: diagramId,
          name: diagramName,
          type: diagramType,
          path: relativePath,
          folder: diagramFolder,
          description: processData.metadata?.description,
          inputs: [],
          outputs: [],
          createdAt: processData.metadata?.createdAt || new Date().toISOString(),
          updatedAt: processData.metadata?.updatedAt || new Date().toISOString(),
        };

        diagrams.push(diagram);

        if (diagramType === 'main' && !mainDiagramId) {
          mainDiagramId = diagramId;
        }

        const nodes = processData.diagram?.nodes || processData.nodes || [];
        const edges = processData.diagram?.edges || processData.edges || [];

        documents[diagramId] = {
          metadata: {
            id: diagramId,
            name: diagramName,
            description: diagram.description,
            createdAt: diagram.createdAt,
            updatedAt: diagram.updatedAt,
          },
          nodes: nodes as DiagramDocument['nodes'],
          edges: edges as DiagramDocument['edges'],
        };
      }

      const projectConfig: ProjectConfig = {
        name: rpaforgeData.project?.name || projectFile.name.replace('.rpaforge', ''),
        version: rpaforgeData.project?.version || '1.0.0',
        main: mainDiagramId || diagrams.find((d) => d.type === 'main')?.id || diagrams[0]?.id || '',
        diagrams,
        folders: Array.from(folders),
        settings: {
          defaultTimeout: rpaforgeData.project?.settings?.defaultTimeout ?? 30000,
          screenshotOnError: rpaforgeData.project?.settings?.screenshotOnError ?? true,
        },
      };

      set({
        projectPath,
        projectFile: projectFile.relativePath,
        projectConfig,
        files,
        isLoading: false,
      });

      fs.onFsEvent((event) => {
        get().handleFsEvent(event);
      });

      fs.watchDir(projectPath).then(() => {
        set({ isWatching: true });
        logger.info('Started watching project directory');
      });

      logger.info(`Loaded project: ${projectConfig.name} with ${diagrams.length} diagrams`);

      return { config: projectConfig, documents };
    } catch (e) {
      const error = `Failed to load project: ${e}`;
      logger.error(error);
      set({ error, isLoading: false });
      return null;
    }
  },

  closeProject: () => {
    const { projectPath, isWatching } = get();
    const fs = getFs();

    if (projectPath && isWatching && fs) {
      fs.unwatchDir(projectPath);
    }

    set({
      projectPath: null,
      projectFile: null,
      projectConfig: null,
      files: [],
      isWatching: false,
      error: null,
    });
  },

  refreshFiles: async () => {
    const { projectPath } = get();
    if (!projectPath) return;

    set({ isLoading: true });

    try {
      const files = await scanDirectory(projectPath, projectPath);
      const projectFile = files.find((f) => f.isProjectFile);

      const fs = getFs();
      const processFilesWithId: Array<{ relativePath: string; name: string; id?: string }> = [];

      for (const f of files.filter((f) => f.isProcessFile)) {
        try {
          const content = await fs!.readFile(f.path);
          const data = JSON.parse(content);
          processFilesWithId.push({
            relativePath: f.relativePath,
            name: f.name.replace('.process', ''),
            id: data.metadata?.id,
          });
        } catch {
          processFilesWithId.push({
            relativePath: f.relativePath,
            name: f.name.replace('.process', ''),
          });
        }
      }

      useDiagramStore.getState().syncDiagramsFromFiles(processFilesWithId);

      set({
        files,
        projectFile: projectFile?.relativePath || null,
        isLoading: false,
      });
    } catch (e) {
      logger.error('Failed to refresh files:', e);
      set({ error: `Failed to refresh: ${e}`, isLoading: false });
    }
  },

  createFile: async (relativePath: string, content: string) => {
    const { projectPath } = get();
    const fs = getFs();
    if (!projectPath || !fs) return;

    const fullPath = `${projectPath}/${relativePath}`;
    await fs.writeFile(fullPath, content);
  },

  createFolder: async (relativePath: string) => {
    const { projectPath } = get();
    const fs = getFs();
    if (!projectPath || !fs) return;

    const fullPath = `${projectPath}/${relativePath}`;
    await fs.createDir(fullPath);
  },

  deleteFile: async (relativePath: string) => {
    const { projectPath } = get();
    const fs = getFs();
    if (!projectPath || !fs) return;

    const fullPath = `${projectPath}/${relativePath}`;
    await fs.delete(fullPath, true);
  },

  renameFile: async (oldRelativePath: string, newRelativePath: string) => {
    const { projectPath } = get();
    const fs = getFs();
    if (!projectPath || !fs) return;

    const oldPath = `${projectPath}/${oldRelativePath}`;
    const newPath = `${projectPath}/${newRelativePath}`;
    await fs.rename(oldPath, newPath);
  },

  openWithSystem: async (relativePath: string) => {
    const { projectPath } = get();
    const fs = getFs();
    if (!projectPath || !fs) return;

    const fullPath = `${projectPath}/${relativePath}`;
    await fs.openWithSystem(fullPath);
  },

  showInFolder: async (relativePath: string) => {
    const { projectPath } = get();
    const fs = getFs();
    if (!projectPath || !fs) return;

    const fullPath = `${projectPath}/${relativePath}`;
    await fs.showInFolder(fullPath);
  },

  readFile: async (relativePath: string): Promise<string> => {
    const { projectPath } = get();
    const fs = getFs();
    if (!projectPath || !fs) return '';

    const fullPath = `${projectPath}/${relativePath}`;
    return fs.readFile(fullPath);
  },

  writeFile: async (relativePath: string, content: string) => {
    const { projectPath } = get();
    const fs = getFs();
    if (!projectPath || !fs) return;

    const fullPath = `${projectPath}/${relativePath}`;
    await fs.writeFile(fullPath, content);
  },

  handleFsEvent: (event: FsEvent) => {
    const { projectPath } = get();
    if (!projectPath) return;

    const normalizedProjectPath = projectPath.replace(/\\/g, '/');
    const normalizedEventPath = event.path.replace(/\\/g, '/');
    
    const relativePath = normalizedEventPath.startsWith(normalizedProjectPath + '/')
      ? normalizedEventPath.substring(normalizedProjectPath.length + 1)
      : null;

    if (!relativePath) return;

    if (refreshTimeout) {
      clearTimeout(refreshTimeout);
    }

    refreshTimeout = setTimeout(() => {
      get().refreshFiles();
      refreshTimeout = null;
    }, 500);
  },
}));
