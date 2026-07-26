import { idb } from './db';

const STORAGE_KEYS = [
  'rpaforge-diagrams',
  'rpaforge-process',
  'rpaforge-files',
  'rpaforge-settings',
  'rpaforge-variables',
  'rpaforge_welcomed',
];

export const WELCOME_PREFERENCE_KEY = 'rpaforge_welcomed';

const MAX_STORAGE_MB = 10;
const WARNING_THRESHOLD_MB = 5;

export interface LocalStorageInfo {
  key: string;
  bytes: number;
  mb: number;
}

export interface IndexedDBStorageInfo {
  autosaveCount: number;
  variablesCount: number;
  diagramsCount: number;
  estimateUsed: number;
  estimateQuota: number;
}

export interface StorageInfo {
  localStorage: {
    totalBytes: number;
    totalMB: number;
    keys: LocalStorageInfo[];
    isWarning: boolean;
    isExceeded: boolean;
  };
  indexedDB: IndexedDBStorageInfo | null;
  totalLocalMB: number;
}

export async function getStorageInfo(): Promise<StorageInfo> {
  const keys: LocalStorageInfo[] = [];
  let totalBytes = 0;

  for (const key of STORAGE_KEYS) {
    const value = localStorage.getItem(key);
    if (value) {
      const bytes = new Blob([value]).size;
      keys.push({ key, bytes, mb: bytes / (1024 * 1024) });
      totalBytes += bytes;
    }
  }

  const totalMB = totalBytes / (1024 * 1024);

  let indexedDBInfo: IndexedDBStorageInfo | null = null;
  if (typeof indexedDB !== 'undefined') {
    const estimate = await navigator.storage.estimate();
    indexedDBInfo = {
      autosaveCount: 0,
      variablesCount: 0,
      diagramsCount: 0,
      estimateUsed: estimate.usage || 0,
      estimateQuota: estimate.quota || 0,
    };
  }

  return {
    localStorage: {
      totalBytes,
      totalMB,
      keys,
      isWarning: totalMB >= WARNING_THRESHOLD_MB,
      isExceeded: totalMB >= MAX_STORAGE_MB,
    },
    indexedDB: indexedDBInfo,
    totalLocalMB: totalMB,
  };
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function clearAllStorage(): void {
  for (const key of STORAGE_KEYS) {
    localStorage.removeItem(key);
  }
}

export function clearStorageKey(key: string): void {
  localStorage.removeItem(key);
}

export function hasDismissedWelcome(): boolean {
  return localStorage.getItem(WELCOME_PREFERENCE_KEY) === '1';
}

export function markWelcomeDismissed(): void {
  localStorage.setItem(WELCOME_PREFERENCE_KEY, '1');
}

export function resetWelcomePreference(): void {
  localStorage.removeItem(WELCOME_PREFERENCE_KEY);
}

export async function clearIndexedDB(): Promise<void> {
  await idb.clearAll();
}

export async function getDetailedIndexedDBInfo(): Promise<IndexedDBStorageInfo | null> {
  if (typeof indexedDB === 'undefined') return null;

  const estimate = await navigator.storage.estimate();

  return {
    autosaveCount: 1,
    variablesCount: 0,
    diagramsCount: 0,
    estimateUsed: estimate.usage || 0,
    estimateQuota: estimate.quota || 0,
  };
}
