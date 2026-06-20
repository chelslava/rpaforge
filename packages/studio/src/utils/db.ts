import type { ProcessVariable } from '../stores/variableStore';
import { createLogger } from './logger';

const logger = createLogger('IndexedDB');

const DB_NAME = 'rpaforge';
const DB_VERSION = 1;

const STORES = {
  AUTOSAVE: 'autosave',
  VARIABLES: 'variables',
  DIAGRAMS: 'diagrams',
} as const;

let dbInstance: IDBDatabase | null = null;

function openDatabase(): Promise<IDBDatabase> {
  if (dbInstance) {
    return Promise.resolve(dbInstance);
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      const error = request.error;
      console.error('[IndexedDB] Failed to open database:', error);
      reject(new Error(`Failed to open database: ${error?.message || 'Unknown error'}`));
    };

    request.onsuccess = () => {
      dbInstance = request.result;
      logger.debug('Database opened successfully');
      resolve(dbInstance);
    };

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      logger.debug('Upgrade needed, creating stores');

      if (!db.objectStoreNames.contains(STORES.AUTOSAVE)) {
        const autosaveStore = db.createObjectStore(STORES.AUTOSAVE, { keyPath: 'id' });
        autosaveStore.createIndex('by-timestamp', 'timestamp');
        logger.debug('Created autosave store');
      }

      if (!db.objectStoreNames.contains(STORES.VARIABLES)) {
        const variablesStore = db.createObjectStore(STORES.VARIABLES, { keyPath: 'id' });
        variablesStore.createIndex('by-project', 'projectId');
        variablesStore.createIndex('by-diagram', 'diagramId');
        logger.debug('Created variables store');
      }

      if (!db.objectStoreNames.contains(STORES.DIAGRAMS)) {
        const diagramsStore = db.createObjectStore(STORES.DIAGRAMS, { keyPath: 'id' });
        diagramsStore.createIndex('by-project', 'projectId');
        logger.debug('Created diagrams store');
      }
    };

    request.onblocked = () => {
      console.warn('[IndexedDB] Database blocked - another tab may have it open');
    };
  });
}

function transaction(
  storeName: string,
  mode: IDBTransactionMode,
  callback: (store: IDBObjectStore) => IDBRequest | void
): Promise<unknown> {
  return openDatabase().then((db) => {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, mode);
      const store = tx.objectStore(storeName);

      const result = callback(store);

      tx.oncomplete = () => {
        if (result instanceof IDBRequest) {
          resolve(result.result);
        } else {
          resolve(result);
        }
      };

      tx.onerror = () => {
        reject(tx.error);
      };

      tx.onabort = () => {
        reject(tx.error);
      };
    });
  });
}

export const idb = {
  autosave: {
    async save(id: string, content: string, hash: string): Promise<void> {
      await transaction(STORES.AUTOSAVE, 'readwrite', (store) => {
        return store.put({
          id,
          content,
          hash,
          timestamp: Date.now(),
        });
      });
    },

    async get(id: string): Promise<{ content: string; hash: string; timestamp: number } | undefined> {
      const result = await transaction(STORES.AUTOSAVE, 'readonly', (store) => {
        return store.get(id);
      }) as { id: string; content: string; hash: string; timestamp: number } | undefined;
      if (result) {
        return {
          content: result.content,
          hash: result.hash,
          timestamp: result.timestamp,
        };
      }
      return undefined;
    },

    async getLatest(): Promise<{ id: string; content: string; hash: string; timestamp: number } | undefined> {
      const results = await transaction(STORES.AUTOSAVE, 'readonly', (store) => {
        const index = store.index('by-timestamp');
        return index.openCursor(null, 'prev');
      });

      if (results) {
        const cursor = results as IDBCursorWithValue;
        if (cursor.value) {
          return cursor.value;
        }
      }
      return undefined;
    },

    async delete(id: string): Promise<void> {
      await transaction(STORES.AUTOSAVE, 'readwrite', (store) => {
        return store.delete(id);
      });
    },

    async clear(): Promise<void> {
      await transaction(STORES.AUTOSAVE, 'readwrite', (store) => {
        return store.clear();
      });
    },
  },

  variables: {
    async save(variable: ProcessVariable): Promise<void> {
      await transaction(STORES.VARIABLES, 'readwrite', (store) => {
        return store.put(variable);
      });
    },

    async get(id: string): Promise<ProcessVariable | undefined> {
      return transaction(STORES.VARIABLES, 'readonly', (store) => {
        return store.get(id);
      }) as Promise<ProcessVariable | undefined>;
    },

    async getByProject(projectId: string): Promise<ProcessVariable[]> {
      const results = await transaction(STORES.VARIABLES, 'readonly', (store) => {
        const index = store.index('by-project');
        return index.getAll(projectId);
      }) as ProcessVariable[];
      return results || [];
    },

    async getByDiagram(projectId: string, diagramId: string): Promise<ProcessVariable[]> {
      const all = await this.getByProject(projectId);
      return all.filter(
        (v) => v.scope === 'process' || v.diagramId === diagramId
      );
    },

    async delete(id: string): Promise<void> {
      await transaction(STORES.VARIABLES, 'readwrite', (store) => {
        return store.delete(id);
      });
    },

    async deleteByProject(projectId: string): Promise<void> {
      const variables = await this.getByProject(projectId);
      for (const v of variables) {
        await this.delete(v.id);
      }
    },

    async clear(): Promise<void> {
      await transaction(STORES.VARIABLES, 'readwrite', (store) => {
        return store.clear();
      });
    },
  },

  diagrams: {
    async save(id: string, projectId: string, data: string): Promise<void> {
      await transaction(STORES.DIAGRAMS, 'readwrite', (store) => {
        return store.put({
          id,
          projectId,
          data,
          timestamp: Date.now(),
        });
      });
    },

    async get(id: string): Promise<{ projectId: string; data: string; timestamp: number } | undefined> {
      const result = await transaction(STORES.DIAGRAMS, 'readonly', (store) => {
        return store.get(id);
      }) as { id: string; projectId: string; data: string; timestamp: number } | undefined;
      if (result) {
        return {
          projectId: result.projectId,
          data: result.data,
          timestamp: result.timestamp,
        };
      }
      return undefined;
    },

    async getByProject(projectId: string): Promise<Array<{ id: string; data: string; timestamp: number }>> {
      const results = await transaction(STORES.DIAGRAMS, 'readonly', (store) => {
        const index = store.index('by-project');
        return index.getAll(projectId);
      }) as Array<{ id: string; projectId: string; data: string; timestamp: number }>;
      return (results || []).map(({ id, data, timestamp }) => ({ id, data, timestamp }));
    },

    async delete(id: string): Promise<void> {
      await transaction(STORES.DIAGRAMS, 'readwrite', (store) => {
        return store.delete(id);
      });
    },

    async deleteByProject(projectId: string): Promise<void> {
      const diagrams = await this.getByProject(projectId);
      for (const d of diagrams) {
        await this.delete(d.id);
      }
    },

    async clear(): Promise<void> {
      await transaction(STORES.DIAGRAMS, 'readwrite', (store) => {
        return store.clear();
      });
    },
  },

  async clearAll(): Promise<void> {
    await Promise.all([
      this.autosave.clear(),
      this.variables.clear(),
      this.diagrams.clear(),
    ]);
  },

  async getStorageEstimate(): Promise<{ used: number; quota: number }> {
    if ('storage' in navigator && 'estimate' in navigator.storage) {
      const estimate = await navigator.storage.estimate();
      return {
        used: estimate.usage || 0,
        quota: estimate.quota || 0,
      };
    }
    return { used: 0, quota: 0 };
  },
};

export type { ProcessVariable };
