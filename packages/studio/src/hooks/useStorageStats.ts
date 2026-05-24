import { useState, useEffect, useCallback } from 'react';
import { formatBytes, getStorageInfo, type StorageInfo, clearAllStorage, clearIndexedDB } from '../utils/storage';

export interface UseStorageStatsReturn {
  storageInfo: StorageInfo | null;
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  clearLocalStorage: () => void;
  clearAllData: () => Promise<void>;
  isWarning: boolean;
  isExceeded: boolean;
}

export function useStorageStats(): UseStorageStatsReturn {
  const [storageInfo, setStorageInfo] = useState<StorageInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    await Promise.resolve();
    setIsLoading(true);
    setError(null);
    try {
      const info = await getStorageInfo();
      setStorageInfo(info);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to get storage info');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(() => refresh());
  }, [refresh]);

  const clearLocalStorageHandler = useCallback(() => {
    if (window.confirm('Clear all local storage data? This will not delete project files.')) {
      clearAllStorage();
      refresh();
    }
  }, [refresh]);

  const clearAllDataHandler = useCallback(async () => {
    if (window.confirm('Clear ALL data including IndexedDB? This cannot be undone.')) {
      clearAllStorage();
      await clearIndexedDB();
      refresh();
    }
  }, [refresh]);

  return {
    storageInfo,
    isLoading,
    error,
    refresh,
    clearLocalStorage: clearLocalStorageHandler,
    clearAllData: clearAllDataHandler,
    isWarning: storageInfo?.localStorage.isWarning ?? false,
    isExceeded: storageInfo?.localStorage.isExceeded ?? false,
  };
}

export function formatStorageSummary(info: StorageInfo | null): string {
  if (!info) return 'Loading...';
  
  const local = `Local: ${info.localStorage.totalMB.toFixed(2)} MB`;
  if (info.indexedDB) {
    const idbUsed = formatBytes(info.indexedDB.estimateUsed);
    return `${local} | IndexedDB: ${idbUsed}`;
  }
  return local;
}
