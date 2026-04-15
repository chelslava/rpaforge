import { useEffect, useRef, useCallback } from 'react';
import { useProcessStore } from '../stores/processStore';
import { useFileStore } from '../stores/fileStore';
import { useDiagramStore } from '../stores/diagramStore';
import { useProjectFsStore } from '../stores/projectFsStore';
import { serializeDiagram } from '../utils/fileUtils';
import { config } from '../config/app.config';
import { createLogger } from '../utils/logger';

export interface AutoSaveOptions {
  enabled?: boolean;
  intervalMs?: number;
  onSave?: () => void;
  onError?: (error: Error) => void;
}

const BACKUP_KEY = 'rpaforge-autosave-backup';
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

export function useAutoSave(options: AutoSaveOptions = {}): {
  forceSave: () => void;
  clearBackup: () => void;
  hasBackup: () => boolean;
  restoreBackup: () => { metadata: unknown; nodes: unknown[]; edges: unknown[] } | null;
} {
  const {
    enabled = config.autosave.enabled,
    intervalMs = config.autosave.intervalMs,
    onSave,
    onError,
  } = options;

  const nodes = useProcessStore((state) => state.nodes);
  const edges = useProcessStore((state) => state.edges);
  const metadata = useProcessStore((state) => state.metadata);
  const isDirty = useFileStore((state) => state.isDirty);
  const markDirty = useFileStore((state) => state.markDirty);
  const setLastSaved = useFileStore((state) => state.setLastSaved);
  const project = useDiagramStore((state) => state.project);
  const activeDiagramId = useDiagramStore((state) => state.activeDiagramId);
  const saveDiagramDocument = useDiagramStore((state) => state.saveDiagramDocument);
  const projectPath = useProjectFsStore((state) => state.projectPath);
  const writeFile = useProjectFsStore((state) => state.writeFile);

  const lastSaveRef = useRef<string>('');
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const performSave = useCallback(async () => {
    if (!metadata || !nodes.length) {
      return;
    }

    const content = serializeDiagram(nodes, edges, metadata);
    const contentHash = simpleHash(content);

    if (contentHash === lastSaveRef.current) {
      return;
    }

    try {
      localStorage.setItem(BACKUP_KEY, content);
      
      if (projectPath && project && activeDiagramId) {
        const activeDiagram = project.diagrams.find((d) => d.id === activeDiagramId);
        if (activeDiagram) {
          const processContent = {
            version: '1.0.0',
            metadata,
            nodes,
            edges,
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
  }, [metadata, nodes, edges, setLastSaved, markDirty, onSave, onError, projectPath, project, activeDiagramId, writeFile, saveDiagramDocument]);

  const forceSave = useCallback(() => {
    performSave();
  }, [performSave]);

  const clearBackup = useCallback(() => {
    localStorage.removeItem(BACKUP_KEY);
  }, []);

  const hasBackup = useCallback((): boolean => {
    return localStorage.getItem(BACKUP_KEY) !== null;
  }, []);

  const restoreBackup = useCallback((): { metadata: unknown; nodes: unknown[]; edges: unknown[] } | null => {
    try {
      const backup = localStorage.getItem(BACKUP_KEY);
      if (!backup) return null;

      const data = JSON.parse(backup);
      return {
        metadata: data.metadata,
        nodes: data.nodes,
        edges: data.edges,
      };
    } catch (err) {
      logger.warn('Failed to restore backup', err);
      return null;
    }
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
      if (isDirty) {
        performSave();
      }
    }, intervalMs);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [enabled, intervalMs, isDirty, performSave]);

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        performSave();
        e.preventDefault();
        e.returnValue = '';
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isDirty, performSave]);

  return {
    forceSave,
    clearBackup,
    hasBackup,
    restoreBackup,
  };
}

export default useAutoSave;
