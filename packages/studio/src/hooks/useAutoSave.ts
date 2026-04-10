/**
 * Auto-save hook for RPAForge Studio
 *
 * Automatically saves process state at configurable intervals.
 * Provides backup and crash recovery support.
 */

import { useEffect, useRef, useCallback } from 'react';
import { useProcessStore } from '../stores/processStore';
import { useFileStore } from '../stores/fileStore';
import { serializeDiagram } from '../utils/fileUtils';

export interface AutoSaveOptions {
  enabled?: boolean;
  intervalMs?: number;
  onSave?: () => void;
  onError?: (error: Error) => void;
}

const DEFAULT_INTERVAL = 30000;
const BACKUP_KEY = 'rpaforge-autosave-backup';

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
    enabled = true,
    intervalMs = DEFAULT_INTERVAL,
    onSave,
    onError,
  } = options;

  const nodes = useProcessStore((state) => state.nodes);
  const edges = useProcessStore((state) => state.edges);
  const metadata = useProcessStore((state) => state.metadata);
  const isDirty = useFileStore((state) => state.isDirty);
  const markDirty = useFileStore((state) => state.markDirty);
  const setLastSaved = useFileStore((state) => state.setLastSaved);

  const lastSaveRef = useRef<string>('');
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const performSave = useCallback(() => {
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
      lastSaveRef.current = contentHash;
      const now = new Date().toISOString();
      setLastSaved(now);
      markDirty(false);
      onSave?.();
    } catch (e) {
      onError?.(e instanceof Error ? e : new Error('Auto-save failed'));
    }
  }, [metadata, nodes, edges, setLastSaved, markDirty, onSave, onError]);

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
      console.warn('[useAutoSave] Failed to restore backup:', err);
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
