import { useCallback, useState } from 'react';
import type { Edge, Node } from '@reactflow/core';
import { useDiagramStore, type DiagramType, type DiagramMetadata } from '../stores/diagramStore';
import { useBlockStore, type ProcessNode } from '../stores/blockStore';
import { useProcessMetadataStore, type ProcessMetadata } from '../stores/processMetadataStore';
import { useHistoryStore } from '../stores/historyStore';
import { useSelectionStore } from '../stores/selectionStore';
import { useExecutionStore } from '../stores/executionStore';
import { useFileStore } from '../stores/fileStore';
import { useProjectFsStore } from '../stores/projectFsStore';
import {
  deserializeProject,
  serializeDiagram,
  serializeProject,
  deserializeDiagram,
  downloadFile,
  readFileAsText,
  generateFilename,
  isValidDiagramFile,
  isValidProjectFile,
  generateProjectFilename,
  generateProcessFilename,
  PROCESS_EXTENSION,
  PROJECT_EXTENSION,
} from '../utils/fileUtils';
import type { ProcessFile, ProjectFile } from '../utils/fileUtils';
import type { BlockData } from '../types/blocks';
import {
  getProjectTemplateById,
  instantiateProjectTemplate,
  getProcessTemplateById,
} from '../templates';
import type { ProjectTemplateFile } from '../utils/templateLoader';
import { createLogger } from '../utils/logger';

const logger = createLogger('useFileOperations');

export interface UseFileOperationsResult {
  isSaving: boolean;
  isLoading: boolean;
  lastError: string | null;

  save: () => Promise<void>;
  saveAs: (name: string) => Promise<void>;
  open: (file: File) => Promise<boolean>;
  openProjectFolder: () => Promise<boolean>;
  newProject: (name: string, templateId?: string) => void;
  newProjectInFolder: (name: string, folderPath: string, templateId?: string) => Promise<boolean>;
  newProcess: (name: string, templateId?: string) => void;
  exportRobot: (code: string) => void;
  exportDiagram: () => void;
}

export const useFileOperations = (): UseFileOperationsResult => {
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);

  const nodes = useBlockStore((state) => state.nodes);
  const edges = useBlockStore((state) => state.edges);
  const setNodes = useBlockStore((state) => state.setNodes);
  const setEdges = useBlockStore((state) => state.setEdges);
  const metadata = useProcessMetadataStore((state) => state.metadata);
  const setMetadata = useProcessMetadataStore((state) => state.setMetadata);
  const clearHistory = useHistoryStore((state) => state.clearHistory);
  const clearSelection = useSelectionStore((state) => state.clearSelection);
  const resetExecution = useExecutionStore((state) => state.resetExecution);
  
  const project = useDiagramStore((state) => state.project);
  const activeDiagramId = useDiagramStore((state) => state.activeDiagramId);
  const diagramDocuments = useDiagramStore((state) => state.diagramDocuments);
  const createProject = useDiagramStore((state) => state.createProject);
  const loadProject = useDiagramStore((state) => state.loadProject);
  const addDiagram = useDiagramStore((state) => state.addDiagram);
  const setActiveDiagram = useDiagramStore((state) => state.setActiveDiagram);
  const {
    currentFile,
    setCurrentFile,
    updateContent,
    markDirty,
    setLastSaved,
    createNewFile,
    addRecentFile,
  } = useFileStore();

  const {
    projectPath,
    loadProject: loadProjectFromFolder,
    writeFile,
    createFolder,
  } = useProjectFsStore();

  const loadProcess = useCallback((meta: ProcessMetadata, newNodes: ProcessNode[], newEdges: Edge[]): boolean => {
    console.log('Loading process:', meta, 'nodes:', newNodes);
    
    const capabilities = useEngine.getState().capabilities;
    if (capabilities?.libraries) {
      const validLibraries = new Set(capabilities.libraries);
      const invalidNodes = newNodes.filter((node) => {
        if (node.data.activity?.library && !validLibraries.has(node.data.activity.library)) {
          console.warn(`Activity '${node.data.activity.library}.${node.data.activity.name}' from invalid library`);
          return true;
        }
        return false;
      });
      
      if (invalidNodes.length > 0) {
        console.warn(`Found ${invalidNodes.length} activities with invalid libraries.`);
      }
    }
    
    setMetadata(meta);
    setNodes(newNodes);
    setEdges(newEdges);
    clearSelection();
    resetExecution();
    clearHistory();
    return true;
  }, [setMetadata, setNodes, setEdges, clearSelection, resetExecution, clearHistory]);

  const getProjectExport = useCallback((): ProjectFile | null => {
    if (!project) {
      return null;
    }

    const nextDocuments = { ...diagramDocuments };
    if (activeDiagramId && metadata) {
      nextDocuments[activeDiagramId] = {
        metadata,
        nodes,
        edges,
      };
    }

    return {
      version: '1.0.0',
      exportedAt: new Date().toISOString(),
      project,
      diagrams: nextDocuments,
    };
  }, [activeDiagramId, diagramDocuments, edges, metadata, nodes, project]);

  const save = useCallback(async () => {
    if (!projectPath) {
      // Legacy save - download file
      if (!currentFile || (!metadata && !project)) return;

      setIsSaving(true);
      setLastError(null);

      try {
        let content: string;
        let filename: string;

        if (project) {
          const projectExport = getProjectExport();
          if (!projectExport) {
            return;
          }
          content = serializeProject(projectExport.project, projectExport.diagrams);
          filename = generateProjectFilename(currentFile.name);
        } else {
          if (!metadata) {
            return;
          }
          content = serializeDiagram(nodes, edges, metadata);
          filename = generateProcessFilename(currentFile.name);
        }

        updateContent(content);
        downloadFile(content, filename);

        const now = new Date().toISOString();
        setLastSaved(now);
        markDirty(false);
      } catch (e) {
        setLastError(`Failed to save: ${e}`);
      } finally {
        setIsSaving(false);
      }
      return;
    }

    // Save to project folder
    setIsSaving(true);
    setLastError(null);

    try {
      // Save project config
      const projectConfig = {
        version: '1.0.0',
        exportedAt: new Date().toISOString(),
        project: {
          ...project,
          name: project!.name,
          version: project!.version,
          settings: project!.settings,
        },
        diagrams: project!.diagrams.map((d) => ({
          path: d.path,
          type: d.type,
          name: d.name,
          folder: d.folder,
        })),
        folders: project!.folders,
      };

      const projectFileName = `${project!.name.replace(/[^a-zA-Z0-9_-]/g, '_')}${PROJECT_EXTENSION}`;
      await writeFile(projectFileName, JSON.stringify(projectConfig, null, 2));

      // Save all diagrams
      for (const diagram of project!.diagrams) {
        const doc = diagramDocuments[diagram.id];
        if (doc) {
          const processContent = {
            version: '1.0.0',
            metadata: doc.metadata,
            nodes: doc.nodes,
            edges: doc.edges,
          };
          await writeFile(diagram.path, JSON.stringify(processContent, null, 2));
        }
      }

      // Save active diagram if changed
      if (activeDiagramId && metadata) {
        const activeDiagram = project!.diagrams.find((d) => d.id === activeDiagramId);
        if (activeDiagram) {
          const processContent = {
            version: '1.0.0',
            metadata,
            nodes,
            edges,
          };
          await writeFile(activeDiagram.path, JSON.stringify(processContent, null, 2));
        }
      }

      const now = new Date().toISOString();
      setLastSaved(now);
      markDirty(false);
      logger.info('Project saved to folder:', projectPath);
    } catch (e) {
      const error = `Failed to save project: ${e}`;
      logger.error(error);
      setLastError(error);
    } finally {
      setIsSaving(false);
    }
  }, [
    projectPath,
    currentFile,
    metadata,
    project,
    nodes,
    edges,
    getProjectExport,
    updateContent,
    setLastSaved,
    markDirty,
    writeFile,
    diagramDocuments,
    activeDiagramId,
  ]);

  const saveAs = useCallback(async (name: string) => {
    if (!metadata && !project) return;

    setIsSaving(true);
    setLastError(null);

    try {
      let content: string;
      let filename: string;

      if (project) {
        const projectExport = getProjectExport();
        if (!projectExport) {
          return;
        }

        content = serializeProject(
          {
            ...projectExport.project,
            name,
          },
          projectExport.diagrams
        );
        filename = generateProjectFilename(name);
      } else {
        if (!metadata) {
          return;
        }
        content = serializeDiagram(nodes, edges, { ...metadata, name });
        filename = generateProcessFilename(name);
      }

      downloadFile(content, filename);

      const now = new Date().toISOString();
      const file = createNewFile(name);
      setCurrentFile({ ...file, content });
      setLastSaved(now);
    } catch (e) {
      setLastError(`Failed to save: ${e}`);
    } finally {
      setIsSaving(false);
    }
  }, [
    createNewFile,
    edges,
    getProjectExport,
    metadata,
    nodes,
    project,
    setCurrentFile,
    setLastSaved,
  ]);

  const open = useCallback(async (file: File): Promise<boolean> => {
    if (!isValidDiagramFile(file) && !isValidProjectFile(file)) {
      setLastError(`Invalid file type. Expected ${PROJECT_EXTENSION} or ${PROCESS_EXTENSION}`);
      return false;
    }

    setIsLoading(true);
    setLastError(null);

    try {
      const content = await readFileAsText(file);

      const projectResult = deserializeProject(content);
      if (projectResult.success && projectResult.project) {
        loadProject(projectResult.project.project, projectResult.project.diagrams);

        const mainDocument =
          projectResult.project.diagrams[projectResult.project.project.main];
        if (mainDocument) {
          loadProcess(
            mainDocument.metadata,
            mainDocument.nodes,
            mainDocument.edges
          );
        }

        setCurrentFile({
          id: projectResult.project.project.main,
          name: projectResult.project.project.name,
          path: file.name,
          content,
          createdAt: projectResult.project.exportedAt,
          updatedAt: projectResult.project.exportedAt,
        });

        addRecentFile({
          id: projectResult.project.project.main,
          name: projectResult.project.project.name,
          path: file.name,
          lastOpened: new Date().toISOString(),
        });

        return true;
      }

      const result = deserializeDiagram(content);

      if (!result.success || !result.diagram) {
        setLastError(result.error || 'Failed to load diagram');
        return false;
      }

      const diagram = result.diagram as ProcessFile;
      const startNodes = diagram.nodes.filter(
        (node) => node.data?.blockData?.type === 'start'
      );

      if (startNodes.length !== 1) {
        setLastError('Diagram must contain exactly one Start node.');
        return false;
      }

      const loaded = loadProcess(diagram.metadata, diagram.nodes, diagram.edges);
      if (!loaded) {
        setLastError('Failed to load diagram: exactly one Start node is required.');
        return false;
      }

      setCurrentFile({
        id: diagram.metadata.id,
        name: diagram.metadata.name,
        path: file.name,
        content,
        createdAt: diagram.metadata.createdAt,
        updatedAt: diagram.metadata.updatedAt,
      });

      addRecentFile({
        id: diagram.metadata.id,
        name: diagram.metadata.name,
        path: file.name,
        lastOpened: new Date().toISOString(),
      });

      return true;
    } catch (e) {
      setLastError(`Failed to open file: ${e}`);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [addRecentFile, loadProcess, loadProject, setCurrentFile]);

  const openProjectFolder = useCallback(async (): Promise<boolean> => {
    const dialog = window.rpaforge?.dialog;
    if (!dialog) {
      setLastError('Dialog API not available');
      return false;
    }

    try {
      const result = await dialog.showOpenDialog({
        title: 'Open Project Folder',
        properties: ['openDirectory'],
      });

      if (result.canceled || result.filePaths.length === 0) {
        return false;
      }

      const selectedPath = result.filePaths[0];
      setIsLoading(true);
      setLastError(null);

      const loadedProject = await loadProjectFromFolder(selectedPath);

      if (!loadedProject) {
        setLastError('No valid project found in selected folder');
        setIsLoading(false);
        return false;
      }

      const { config: projectConfig, documents } = loadedProject;

      loadProject(projectConfig, documents);

      const mainDiagram = projectConfig.diagrams.find((d) => d.id === projectConfig.main);
      if (mainDiagram && documents[mainDiagram.id]) {
        const mainDoc = documents[mainDiagram.id];
        loadProcess(mainDoc.metadata, mainDoc.nodes, mainDoc.edges);
      } else if (projectConfig.diagrams.length > 0) {
        const firstDiagram = projectConfig.diagrams[0];
        const firstDoc = documents[firstDiagram.id];
        if (firstDoc) {
          loadProcess(firstDoc.metadata, firstDoc.nodes, firstDoc.edges);
        }
      }

      setCurrentFile({
        id: projectConfig.main,
        name: projectConfig.name,
        path: selectedPath,
        content: '',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      addRecentFile({
        id: projectConfig.main,
        name: projectConfig.name,
        path: selectedPath,
        lastOpened: new Date().toISOString(),
      });

      logger.info('Project opened from folder:', selectedPath);
      setIsLoading(false);
      return true;
    } catch (e) {
      const error = `Failed to open project folder: ${e}`;
      logger.error(error);
      setLastError(error);
      setIsLoading(false);
      return false;
    }
  }, [loadProjectFromFolder, loadProject, loadProcess, setCurrentFile, addRecentFile]);

  const newProject = useCallback((name: string, templateId?: string) => {
    const template = templateId ? getProjectTemplateById(templateId) : null;

    if (template) {
      const instantiated = instantiateProjectTemplate(template, name);
      
      const diagrams: Array<{
        id: string;
        name: string;
        type: DiagramType;
        path: string;
        createdAt: string;
        updatedAt: string;
      }> = [
        {
          id: instantiated.metadata.id,
          name: instantiated.metadata.name,
          type: 'main' as DiagramType,
          path: `${instantiated.metadata.name.replace(/\s+/g, '-')}${PROCESS_EXTENSION}`,
          createdAt: instantiated.metadata.createdAt,
          updatedAt: instantiated.metadata.updatedAt,
        },
      ];

      const documents: Record<string, { metadata: typeof instantiated.metadata; nodes: typeof instantiated.nodes; edges: typeof instantiated.edges }> = {
        [instantiated.metadata.id]: {
          metadata: instantiated.metadata,
          nodes: instantiated.nodes,
          edges: instantiated.edges,
        },
      };

      if (instantiated.subDiagrams) {
        for (const [subId, sub] of Object.entries(instantiated.subDiagrams)) {
          documents[subId] = sub;
          diagrams.push({
            id: subId,
            name: sub.metadata.name,
            type: 'sub-diagram' as DiagramType,
            path: `${sub.metadata.name.replace(/\s+/g, '-')}${PROCESS_EXTENSION}`,
            createdAt: sub.metadata.createdAt,
            updatedAt: sub.metadata.updatedAt,
          });
        }
      }

      const projectConfig = {
        name,
        version: '1.0.0',
        main: instantiated.metadata.id,
        diagrams,
        folders: [],
        settings: {
          defaultTimeout: 30000,
          screenshotOnError: true,
        },
      };

      loadProject(projectConfig, documents);
      loadProcess(instantiated.metadata, instantiated.nodes, instantiated.edges);
      createNewFile(name);
    } else {
      createProject(name);
      createNewFile(name);
    }
  }, [createNewFile, createProject, loadProject, loadProcess]);

  const newProjectInFolder = useCallback(async (
    name: string,
    folderPath: string,
    templateId?: string
  ): Promise<boolean> => {
    setIsLoading(true);
    setLastError(null);

    const fileSystem = window.rpaforge?.fs;
    if (!fileSystem) {
      setLastError('FileSystem API not available');
      setIsLoading(false);
      return false;
    }

    try {
      const sanitizedName = name.replace(/[^a-zA-Z0-9_-]/g, '_');
      const projectFolder = `${folderPath}/${sanitizedName}`;
      
      await fileSystem.createDir(projectFolder);

      const template = templateId ? getProjectTemplateById(templateId) : null;
      const timestamp = new Date().toISOString();

      let mainDiagram: DiagramMetadata;
      const diagrams: DiagramMetadata[] = [];
      const documents: Record<string, { metadata: { id: string; name: string; createdAt: string; updatedAt: string }; nodes: Node[]; edges: Edge[] }> = {};

      if (template) {
        const instantiated = instantiateProjectTemplate(template, name);

        mainDiagram = {
          id: instantiated.metadata.id,
          name: 'Main Process',
          type: 'main',
          path: 'Main.process',
          createdAt: timestamp,
          updatedAt: timestamp,
        };

        diagrams.push(mainDiagram);
        documents[mainDiagram.id] = {
          metadata: instantiated.metadata,
          nodes: instantiated.nodes,
          edges: instantiated.edges,
        };

        if (instantiated.subDiagrams) {
          await fileSystem.createDir(`${projectFolder}/processes`);

          for (const [subId, sub] of Object.entries(instantiated.subDiagrams)) {
            const subDiagram: DiagramMetadata = {
              id: subId,
              name: sub.metadata.name,
              type: 'sub-diagram',
              path: `processes/${sub.metadata.name.replace(/\s+/g, '-')}.process`,
              folder: 'processes',
              createdAt: timestamp,
              updatedAt: timestamp,
            };

            diagrams.push(subDiagram);
            documents[subId] = sub;
          }
        }
      } else {
        const mainId = `diagram_${Date.now()}`;
        
        mainDiagram = {
          id: mainId,
          name: 'Main Process',
          type: 'main',
          path: 'Main.process',
          createdAt: timestamp,
          updatedAt: timestamp,
        };

        diagrams.push(mainDiagram);
        documents[mainId] = {
          metadata: {
            id: mainId,
            name: 'Main Process',
            createdAt: timestamp,
            updatedAt: timestamp,
          },
          nodes: [{
            id: mainId,
            type: 'start',
            position: { x: 100, y: 100 },
            data: {
              blockData: {
                id: mainId,
                type: 'start',
                name: 'Start',
                label: 'Start',
                category: 'flow-control',
                processName: 'Main Process',
              },
            },
          }],
          edges: [],
        };
      }

      const projectConfig: ProjectTemplateFile = {
        version: '1.0.0',
        templateType: 'project',
        metadata: {
          id: sanitizedName.toLowerCase(),
          name,
          description: '',
          category: 'empty',
        },
        project: {
          name,
          version: '1.0.0',
          settings: {
            defaultTimeout: 30000,
            screenshotOnError: true,
          },
        },
        diagrams: diagrams.map((d) => ({
          path: d.path,
          type: d.type,
          name: d.name,
          folder: d.folder,
        })),
        folders: diagrams.some((d) => d.folder) ? ['processes'] : [],
      };

      const projectFileName = `${sanitizedName}${PROJECT_EXTENSION}`;

      await fileSystem.writeFile(`${projectFolder}/${projectFileName}`, JSON.stringify(projectConfig, null, 2));

      const mainDoc = documents[mainDiagram.id];
      await fileSystem.writeFile(
        `${projectFolder}/${mainDiagram.path}`,
        JSON.stringify({
          version: '1.0.0',
          templateType: 'process',
          metadata: mainDoc.metadata,
          diagram: {
            nodes: mainDoc.nodes,
            edges: mainDoc.edges,
          },
        }, null, 2)
      );

      for (const diagram of diagrams.filter((d) => d.type === 'sub-diagram')) {
        const doc = documents[diagram.id];
        if (doc) {
          await fileSystem.writeFile(
            `${projectFolder}/${diagram.path}`,
            JSON.stringify({
              version: '1.0.0',
              templateType: 'process',
              metadata: doc.metadata,
              diagram: {
                nodes: doc.nodes,
                edges: doc.edges,
              },
            }, null, 2)
          );
        }
      }

      const loadedProject = await loadProjectFromFolder(projectFolder);

      if (loadedProject) {
        const { config, documents: loadedDocs } = loadedProject;
        loadProject(config, loadedDocs);
        
        const main = config.diagrams.find((d) => d.id === config.main);
        if (main && loadedDocs[main.id]) {
          loadProcess(loadedDocs[main.id].metadata, loadedDocs[main.id].nodes, loadedDocs[main.id].edges);
        }

        setCurrentFile({
          id: mainDiagram.id,
          name,
          path: projectFolder,
          content: '',
          createdAt: timestamp,
          updatedAt: timestamp,
        });
      }

      logger.info('Created new project in folder:', projectFolder);
      setIsLoading(false);
      return true;
    } catch (e) {
      const error = `Failed to create project: ${e}`;
      logger.error(error);
      setLastError(error);
      setIsLoading(false);
      return false;
    }
  }, [createFolder, loadProjectFromFolder, loadProject, loadProcess, setCurrentFile]);

  const newProcess = useCallback((name: string, templateId?: string) => {
    const template = templateId ? getProcessTemplateById(templateId) : null;

    if (template && project) {
      const timestamp = new Date().toISOString();
      
      const newDiagram = addDiagram({
        name,
        type: 'sub-diagram',
        path: `${name.replace(/\s+/g, '-')}${PROCESS_EXTENSION}`,
      });

      if (newDiagram) {
        const nodeIdMap = new Map<string, string>();
        template.nodes.forEach((node) => {
          nodeIdMap.set(node.id, node.id === 'start' ? newDiagram.id : `${node.id}_${Date.now()}`);
        });

        const nodes = template.nodes.map((node) => ({
          id: nodeIdMap.get(node.id)!,
          type: node.type,
          position: node.position,
          data: {
            blockData: node.data as BlockData,
            activityValues: node.data.activity?.params || {},
          },
        }));

        const edges = template.edges.map((edge, i) => ({
          id: `e_${i}_${Date.now()}`,
          source: nodeIdMap.get(edge.source) || edge.source,
          target: nodeIdMap.get(edge.target) || edge.target,
          sourceHandle: edge.sourceHandle,
          targetHandle: edge.targetHandle,
          type: 'default' as const,
        }));

        const processMetadata = {
          id: newDiagram.id,
          name,
          createdAt: timestamp,
          updatedAt: timestamp,
        };

        loadProcess(processMetadata, nodes as Node[], edges as Edge[]);
        setActiveDiagram(newDiagram.id);
      }
    } else {
      addDiagram({
        name,
        type: 'sub-diagram',
        path: `${name.replace(/\s+/g, '-')}${PROCESS_EXTENSION}`,
      });
    }
  }, [addDiagram, loadProcess, project, setActiveDiagram]);

  const exportRobot = useCallback((code: string) => {
    if (!metadata) return;
    const filename = generateFilename(metadata.name, 'robot');
    downloadFile(code, filename, 'text/plain');
  }, [metadata]);

  const exportDiagram = useCallback(() => {
    if (project) {
      const projectExport = getProjectExport();
      if (!projectExport) {
        return;
      }

      const content = serializeProject(projectExport.project, projectExport.diagrams);
      const filename = generateProjectFilename(projectExport.project.name);
      downloadFile(content, filename);
      return;
    }

    if (!metadata) return;
    const content = serializeDiagram(nodes, edges, metadata);
    const filename = generateProcessFilename(metadata.name);
    downloadFile(content, filename);
  }, [edges, getProjectExport, metadata, nodes, project]);

  return {
    isSaving,
    isLoading,
    lastError,
    save,
    saveAs,
    open,
    openProjectFolder,
    newProject,
    newProjectInFolder,
    newProcess,
    exportRobot,
    exportDiagram,
  };
};

export default useFileOperations;
