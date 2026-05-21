import { useEffect, useRef, useCallback } from 'react';
import { useBlockStore } from '../stores/blockStore';
import { useProcessMetadataStore } from '../stores/processMetadataStore';
import { useFileStore } from '../stores/fileStore';
import { useDiagramStore } from '../stores/diagramStore';
import { useProjectFsStore } from '../stores/projectFsStore';
import { useVariableStore } from '../stores/variableStore';
import { serializeDiagram } from '../utils/fileUtils';
import { idb } from '../utils/db';
import { config } from '../config/app.config';
import { createLogger } from '../utils/logger';

export interface AutoSaveOptions {
  enabled?: boolean;
  intervalMs?: number;
  onSave?: () => void;
  onError?: (error: Error) => void;
}

const BACKUP_ID = 'current-diagram';
const LOCAL_STORAGE_BACKUP_KEY = 'rpaforge-autosave-backup';
const logger = createLogger('useAutoSave');

function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return hash.toString(16);
}

async function saveToIndexedDB(content: string, hash: string): Promise<void> {
  try {
    await idb.autosave.save(BACKUP_ID, content, hash);
  } catch (e) {
    logger.error('Failed to save to IndexedDB', e);
    try {
      localStorage.setItem(LOCAL_STORAGE_BACKUP_KEY, content);
    } catch {
      logger.error('Failed to save to localStorage as fallback');
    }
  }
}

async function getFromIndexedDB(): Promise<{ content: string; hash: string; timestamp: number } | null> {
  try {
    const result = await idb.autosave.get(BACKUP_ID);
    if (result) {
      return result;
    }
  } catch {
    logger.warn('Failed to get from IndexedDB, trying localStorage');
  }

  try {
    const local = localStorage.getItem(LOCAL_STORAGE_BACKUP_KEY);
    if (local) {
      return { content: local, hash: simpleHash(local), timestamp: Date.now() };
    }
  } catch {
    logger.warn('Failed to get from localStorage');
  }

  return null;
}

async function clearIndexedDB(): Promise<void> {
  try {
    await idb.autosave.delete(BACKUP_ID);
  } catch {
    logger.warn('Failed to clear from IndexedDB');
  }
  localStorage.removeItem(LOCAL_STORAGE_BACKUP_KEY);
}

async function hasIndexedDBBackup(): Promise<boolean> {
  try {
    const result = await idb.autosave.get(BACKUP_ID);
    return !!result;
  } catch {
    return localStorage.getItem(LOCAL_STORAGE_BACKUP_KEY) !== null;
  }
}

async function restoreFromIndexedDB(): Promise<{ metadata: unknown; nodes: unknown[]; edges: unknown[] } | null> {
  try {
    const result = await getFromIndexedDB();
    if (!result) return null;

    const data = JSON.parse(result.content);
    return {
      metadata: data.metadata,
      nodes: data.nodes,
      edges: data.edges,
    };
  } catch (err) {
    logger.warn('Failed to restore backup', err);
    return null;
  }
}

export function useAutoSave(options: AutoSaveOptions = {}): {
  forceSave: () => void;
  clearBackup: () => void;
  hasBackup: () => Promise<boolean>;
  restoreBackup: () => Promise<{ metadata: unknown; nodes: unknown[]; edges: unknown[] } | null>;
} {
  const {
    enabled = config.autosave.enabled,
    intervalMs = config.autosave.intervalMs,
    onSave,
    onError,
  } = options;

  const nodes = useBlockStore((state) => state.nodes);
  const edges = useBlockStore((state) => state.edges);
  const metadata = useProcessMetadataStore((state) => state.metadata);
  const isDirty = useFileStore((state) => state.isDirty);
  const markDirty = useFileStore((state) => state.markDirty);
  const setLastSaved = useFileStore((state) => state.setLastSaved);
  const project = useDiagramStore((state) => state.project);
  const activeDiagramId = useDiagramStore((state) => state.activeDiagramId);
  const saveDiagramDocument = useDiagramStore((state) => state.saveDiagramDocument);
  const projectPath = useProjectFsStore((state) => state.projectPath);
  const writeFile = useProjectFsStore((state) => state.writeFile);
  const variables = useVariableStore((state) => state.variables);

  const nodesRef = useRef(nodes);
  const edgesRef = useRef(edges);
  const metadataRef = useRef(metadata);
  const isDirtyRef = useRef(isDirty);
  const projectRef = useRef(project);
  const activeDiagramIdRef = useRef(activeDiagramId);
  const projectPathRef = useRef(projectPath);
  const variablesRef = useRef(variables);

  useEffect(() => { nodesRef.current = nodes; }, [nodes]);
  useEffect(() => { edgesRef.current = edges; }, [edges]);
  useEffect(() => { metadataRef.current = metadata; }, [metadata]);
  useEffect(() => { isDirtyRef.current = isDirty; }, [isDirty]);
  useEffect(() => { projectRef.current = project; }, [project]);
  useEffect(() => { activeDiagramIdRef.current = activeDiagramId; }, [activeDiagramId]);
  useEffect(() => { projectPathRef.current = projectPath; }, [projectPath]);
  useEffect(() => { variablesRef.current = variables; }, [variables]);

  const lastSaveRef = useRef<string>('');
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const rafRef = useRef<number | null>(null);
  const pendingSaveRef = useRef<boolean>(false);

  const performSave = useCallback(async (force = false) => {
    if (!force && !isDirtyRef.current) return;

    const metadata = metadataRef.current;
    const nodes = nodesRef.current;
    const edges = edgesRef.current;
    const project = projectRef.current;
    const activeDiagramId = activeDiagramIdRef.current;
    const projectPath = projectPathRef.current;
    const variables = variablesRef.current;

    if (!metadata || !nodes.length) {
      return;
    }

    const diagramVars = project?.id
      ? variables.filter((v) => v.projectId === project.id && (v.scope === 'process' || v.diagramId === activeDiagramId))
      : [];
    const content = serializeDiagram(nodes, edges, metadata, undefined, diagramVars);
    const contentHash = simpleHash(content);

    if (contentHash === lastSaveRef.current) {
      return;
    }

    try {
      await saveToIndexedDB(content, contentHash);

      if (projectPath && project && activeDiagramId) {
        const activeDiagram = project.diagrams.find((d) => d.id === activeDiagramId);
        if (activeDiagram) {
          const processContent = {
            version: '1.1.0',
            metadata,
            nodes,
            edges,
            variables: diagramVars,
          };
          await writeFile(activeDiagram.path, JSON.stringify(processContent, null, 2));

          saveDiagramDocument(activeDiagramId, {
            metadata,
            nodes,
            edges,
          });

          logger.debug(`Auto-saved diagram to ${activeDiagram.path}`);
        }
      }

      lastSaveRef.current = contentHash;
      const now = new Date().toISOString();
      setLastSaved(now);
      markDirty(false);
      onSave?.();
    } catch (e) {
      logger.error('Auto-save failed', e);
      onError?.(e instanceof Error ? e : new Error('Auto-save failed'));
    }
  }, [setLastSaved, markDirty, onSave, onError, writeFile, saveDiagramDocument]);

  const scheduleSaveWithRAF = useCallback(() => {
    if (pendingSaveRef.current) return;
    pendingSaveRef.current = true;

    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
    }

    rafRef.current = requestAnimationFrame(() => {
      pendingSaveRef.current = false;
      rafRef.current = null;
      performSave();
    });
  }, [performSave, pendingSaveRef, rafRef]);

  const forceSave = useCallback(async () => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    pendingSaveRef.current = false;
    await performSave(true);
  }, [performSave]);

  const clearBackup = useCallback(() => {
    clearIndexedDB();
  }, []);

  const hasBackup = useCallback(async (): Promise<boolean> => {
    return hasIndexedDBBackup();
  }, []);

  const restoreBackup = useCallback(async (): Promise<{ metadata: unknown; nodes: unknown[]; edges: unknown[] } | null> => {
    return restoreFromIndexedDB();
  }, []);

  useEffect(() => {
    if (!enabled) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    intervalRef.current = setInterval(() => {
      if (isDirtyRef.current) {
        scheduleSaveWithRAF();
      }
    }, intervalMs);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [enabled, intervalMs, performSave, scheduleSaveWithRAF]);

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirtyRef.current) {
        void performSave();
        e.preventDefault();
        e.returnValue = '';
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [performSave]);

  return {
    forceSave,
    clearBackup,
    hasBackup,
    restoreBackup,
  };
}

export default useAutoSave;
