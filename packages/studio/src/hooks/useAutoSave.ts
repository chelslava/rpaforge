import { useEffect, useRef, useCallback, useState } from 'react';
import { useBlockStore } from '../stores/blockStore';
import { useProcessMetadataStore } from '../stores/processMetadataStore';
import { useFileStore } from '../stores/fileStore';
import { useDiagramStore } from '../stores/diagramStore';
import { useProjectFsStore } from '../stores/projectFsStore';
import { useVariableStore } from '../stores/variableStore';
import { serializeDiagram } from '../utils/fileUtils';
import { sanitizeVariablesForPersistence } from '../utils/secretSerialization';
import { idb } from '../utils/db';
import { config } from '../config/app.config';
import { createLogger } from '../utils/logger';
import type { ProcessMetadata } from '../stores/processMetadataStore';
import type { ProcessNode } from '../stores/blockStore';
import type { ProcessVariable } from '../stores/variableStore';

export interface AutoSaveOptions {
  enabled?: boolean;
  intervalMs?: number;
  onSave?: () => void;
  onError?: (error: Error) => void;
}

const BACKUP_ID = 'current-diagram';
const LOCAL_STORAGE_BACKUP_KEY = 'rpaforge-autosave-backup';
const SESSION_STATE_KEY = 'rpaforge-session-state';
const CLEAN_SESSION = 'clean';
const ACTIVE_SESSION = 'active';
const logger = createLogger('useAutoSave');

export interface AutoSaveBackup {
  metadata: ProcessMetadata;
  nodes: ProcessNode[];
  edges: unknown[];
  variables?: ProcessVariable[];
  timestamp?: number;
  hash?: string;
}

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
    logger.warn('Autosave fallback is disabled to keep sensitive payloads out of renderer storage');
  }
}

async function getFromIndexedDB(): Promise<{ content: string; hash: string; timestamp: number } | null> {
  try {
    const result = await idb.autosave.get(BACKUP_ID);
    if (result) {
      return result;
    }
  } catch {
    logger.warn('Failed to get from IndexedDB');
  }

  return null;
}

async function clearIndexedDB(): Promise<void> {
  try {
    localStorage.removeItem(LOCAL_STORAGE_BACKUP_KEY);
  } catch {
    // Ignore storage failures while clearing a legacy recovery artifact.
  }
  try {
    await idb.autosave.delete(BACKUP_ID);
  } catch {
    logger.warn('Failed to clear from IndexedDB');
  }
}

async function hasIndexedDBBackup(): Promise<boolean> {
  try {
    const result = await idb.autosave.get(BACKUP_ID);
    return !!result;
  } catch {
    return false;
  }
}

function parseBackup(
  result: { content: string; hash: string; timestamp: number }
): AutoSaveBackup {
  const data = JSON.parse(result.content) as Partial<AutoSaveBackup>;
  if (
    !data.metadata ||
    typeof data.metadata !== 'object' ||
    !Array.isArray(data.nodes) ||
    !Array.isArray(data.edges)
  ) {
    throw new Error('Autosave backup is missing a valid metadata, nodes, or edges payload.');
  }

  return {
    metadata: data.metadata as ProcessMetadata,
    nodes: data.nodes as ProcessNode[],
    edges: data.edges,
    ...(Array.isArray(data.variables) ? { variables: data.variables as ProcessVariable[] } : {}),
    timestamp: result.timestamp,
    hash: result.hash,
  };
}

async function restoreFromIndexedDB(): Promise<AutoSaveBackup | null> {
  try {
    const result = await getFromIndexedDB();
    if (!result) return null;
    return parseBackup(result);
  } catch (err) {
    logger.warn('Failed to restore backup', err);
    return null;
  }
}

export function useAutoSave(options: AutoSaveOptions = {}): {
  forceSave: () => void;
  clearBackup: () => void;
  hasBackup: () => Promise<boolean>;
  restoreBackup: () => Promise<AutoSaveBackup | null>;
  recoveryBackup: AutoSaveBackup | null;
  recoveryError: string | null;
  dismissRecovery: () => void;
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
  const [recoveryBackup, setRecoveryBackup] = useState<AutoSaveBackup | null>(null);
  const [recoveryError, setRecoveryError] = useState<string | null>(null);

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
            variables: sanitizeVariablesForPersistence(diagramVars),
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
      void performSave();
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
    void clearIndexedDB();
  }, []);

  const hasBackup = useCallback(async (): Promise<boolean> => {
    return hasIndexedDBBackup();
  }, []);

  const restoreBackup = useCallback(async (): Promise<AutoSaveBackup | null> => {
    const backup = await restoreFromIndexedDB();
    if (!backup) return null;
    return {
      metadata: backup.metadata,
      nodes: backup.nodes,
      edges: backup.edges,
      ...(backup.variables ? { variables: backup.variables } : {}),
    };
  }, []);

  const dismissRecovery = useCallback(() => {
    setRecoveryBackup(null);
    setRecoveryError(null);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const previousSession = localStorage.getItem(SESSION_STATE_KEY);
    localStorage.setItem(SESSION_STATE_KEY, ACTIVE_SESSION);

    void (async () => {
      const rawBackup = await getFromIndexedDB();
      if (!rawBackup || cancelled || previousSession === CLEAN_SESSION) return;

      try {
        const backup = parseBackup(rawBackup);
        const metadataUpdatedAt = Date.parse(backup.metadata.updatedAt);
        if (Number.isFinite(metadataUpdatedAt) && (backup.timestamp ?? 0) < metadataUpdatedAt) {
          setRecoveryError('The autosave is older than the document it was created from.');
          return;
        }
        setRecoveryBackup(backup);
      } catch (err) {
        setRecoveryError(err instanceof Error ? err.message : 'The autosave backup is invalid.');
      }
    })();

    const handleBeforeUnload = () => {
      localStorage.setItem(
        SESSION_STATE_KEY,
        isDirtyRef.current ? ACTIVE_SESSION : CLEAN_SESSION
      );
    };
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      cancelled = true;
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [isDirtyRef]);

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
      if (!isDirtyRef.current) return;
      void performSave();
      if (isDirtyRef.current) {
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
    recoveryBackup,
    recoveryError,
    dismissRecovery,
  };
}

export default useAutoSave;
