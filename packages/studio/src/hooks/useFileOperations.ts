import { useCallback, useState } from 'react';
import { useProcessStore } from '../stores/processStore';
import { useFileStore } from '../stores/fileStore';
import {
  serializeDiagram,
  deserializeDiagram,
  downloadFile,
  readFileAsText,
  generateFilename,
  isValidDiagramFile,
} from '../utils/fileUtils';
import type { DiagramExport } from '../utils/fileUtils';

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

  const { nodes, edges, metadata, loadProcess, createProcess } = useProcessStore();
  const {
    currentFile,
    setCurrentFile,
    updateContent,
    markDirty,
    setLastSaved,
    createNewFile,
    addRecentFile,
  } = useFileStore();

  const save = useCallback(async () => {
    if (!currentFile || !metadata) return;

    setIsSaving(true);
    setLastError(null);

    try {
      const content = serializeDiagram(nodes, edges, metadata);
      updateContent(content);

      downloadFile(content, `${currentFile.name}.rpaforge`);

      const now = new Date().toISOString();
      setLastSaved(now);
      markDirty(false);
    } catch (e) {
      setLastError(`Failed to save: ${e}`);
    } finally {
      setIsSaving(false);
    }
  }, [currentFile, metadata, nodes, edges, updateContent, setLastSaved, markDirty]);

  const saveAs = useCallback(async (name: string) => {
    if (!metadata) return;

    setIsSaving(true);
    setLastError(null);

    try {
      const content = serializeDiagram(nodes, edges, { ...metadata, name });
      const filename = generateFilename(name, 'rpaforge');

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
  }, [metadata, nodes, edges, createNewFile, setCurrentFile, setLastSaved]);

  const open = useCallback(async (file: File): Promise<boolean> => {
    if (!isValidDiagramFile(file)) {
      setLastError('Invalid file type. Expected .rpaforge, .json, or .robot');
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
  }, [loadProcess, setCurrentFile, addRecentFile]);

  const newDiagram = useCallback((name: string) => {
    createProcess(name);
    createNewFile(name);
  }, [createProcess, createNewFile]);

  const exportRobot = useCallback((code: string) => {
    if (!metadata) return;
    const filename = generateFilename(metadata.name, 'robot');
    downloadFile(code, filename, 'text/plain');
  }, [metadata]);

  const exportDiagram = useCallback(() => {
    if (!metadata) return;
    const content = serializeDiagram(nodes, edges, metadata);
    const filename = generateFilename(metadata.name, 'rpaforge');
    downloadFile(content, filename);
  }, [metadata, nodes, edges]);

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
