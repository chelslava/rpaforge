import { useCallback, useState } from 'react';
import { useDiagramStore } from '../stores/diagramStore';
import { useProcessStore } from '../stores/processStore';
import { useFileStore } from '../stores/fileStore';
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
} from '../utils/fileUtils';
import type { DiagramExport, ProjectExport } from '../utils/fileUtils';

export interface UseFileOperationsResult {
  isSaving: boolean;
  isLoading: boolean;
  lastError: string | null;

  save: () => Promise<void>;
  saveAs: (name: string) => Promise<void>;
  open: (file: File) => Promise<boolean>;
  newDiagram: (name: string) => void;
  exportRobot: (code: string) => void;
  exportDiagram: () => void;
}

export const useFileOperations = (): UseFileOperationsResult => {
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);

  const { nodes, edges, metadata, loadProcess } = useProcessStore();
  const project = useDiagramStore((state) => state.project);
  const activeDiagramId = useDiagramStore((state) => state.activeDiagramId);
  const diagramDocuments = useDiagramStore((state) => state.diagramDocuments);
  const createProject = useDiagramStore((state) => state.createProject);
  const loadProject = useDiagramStore((state) => state.loadProject);
  const {
    currentFile,
    setCurrentFile,
    updateContent,
    markDirty,
    setLastSaved,
    createNewFile,
    addRecentFile,
  } = useFileStore();

  const getProjectExport = useCallback((): ProjectExport | null => {
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
    if (!currentFile || (!metadata && !project)) return;

    setIsSaving(true);
    setLastError(null);

    try {
      let content: string;

      if (project) {
        const projectExport = getProjectExport();
        if (!projectExport) {
          return;
        }
        content = serializeProject(projectExport.project, projectExport.diagrams);
      } else {
        if (!metadata) {
          return;
        }
        content = serializeDiagram(nodes, edges, metadata);
      }

      updateContent(content);
      downloadFile(
        content,
        project
          ? `${currentFile.name}.rpaforge-project`
          : `${currentFile.name}.rpaforge`
      );

      const now = new Date().toISOString();
      setLastSaved(now);
      markDirty(false);
    } catch (e) {
      setLastError(`Failed to save: ${e}`);
    } finally {
      setIsSaving(false);
    }
  }, [
    currentFile,
    edges,
    getProjectExport,
    markDirty,
    metadata,
    nodes,
    project,
    setLastSaved,
    updateContent,
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
        filename = generateFilename(name, 'rpaforge-project');
      } else {
        if (!metadata) {
          return;
        }
        content = serializeDiagram(nodes, edges, { ...metadata, name });
        filename = generateFilename(name, 'rpaforge');
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
      setLastError('Invalid file type. Expected .rpaforge, .rpaforge-project, .json, or .robot');
      return false;
    }

    setIsLoading(true);
    setLastError(null);

    try {
      const content = await readFileAsText(file);

      if (file.name.endsWith('.robot')) {
        setLastError('Robot Framework files cannot be imported as diagrams yet');
        return false;
      }

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

      const diagram = result.diagram as DiagramExport;
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

  const newDiagram = useCallback((name: string) => {
    createProject(name);
    createNewFile(name);
  }, [createNewFile, createProject]);

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
      const filename = generateFilename(projectExport.project.name, 'rpaforge-project');
      downloadFile(content, filename);
      return;
    }

    if (!metadata) return;
    const content = serializeDiagram(nodes, edges, metadata);
    const filename = generateFilename(metadata.name, 'rpaforge');
    downloadFile(content, filename);
  }, [edges, getProjectExport, metadata, nodes, project]);

  return {
    isSaving,
    isLoading,
    lastError,
    save,
    saveAs,
    open,
    newDiagram,
    exportRobot,
    exportDiagram,
  };
};

export default useFileOperations;
