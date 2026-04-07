import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface ProcessFile {
  id: string;
  name: string;
  path: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

export interface RecentFile {
  id: string;
  name: string;
  path: string;
  lastOpened: string;
}

interface FileState {
  currentFile: ProcessFile | null;
  recentFiles: RecentFile[];
  isDirty: boolean;
  lastSaved: string | null;

  setCurrentFile: (file: ProcessFile | null) => void;
  updateContent: (content: string) => void;
  markDirty: (dirty: boolean) => void;
  setLastSaved: (timestamp: string) => void;

  addRecentFile: (file: RecentFile) => void;
  removeRecentFile: (id: string) => void;
  clearRecentFiles: () => void;

  createNewFile: (name: string) => ProcessFile;
}

const generateId = () => `file_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

export const useFileStore = create<FileState>()(
  persist(
    (set, get) => ({
      currentFile: null,
      recentFiles: [],
      isDirty: false,
      lastSaved: null,

      setCurrentFile: (file) => {
        set({ currentFile: file, isDirty: false });
        if (file) {
          get().addRecentFile({
            id: file.id,
            name: file.name,
            path: file.path,
            lastOpened: new Date().toISOString(),
          });
        }
      },

      updateContent: (content) => {
        set((state) => ({
          currentFile: state.currentFile
            ? { ...state.currentFile, content, updatedAt: new Date().toISOString() }
            : null,
          isDirty: true,
        }));
      },

      markDirty: (dirty) => set({ isDirty: dirty }),

      setLastSaved: (timestamp) => set({ lastSaved: timestamp, isDirty: false }),

      addRecentFile: (file) => {
        set((state) => {
          const filtered = state.recentFiles.filter((f) => f.id !== file.id);
          const updated = [file, ...filtered].slice(0, 10);
          return { recentFiles: updated };
        });
      },

      removeRecentFile: (id) => {
        set((state) => ({
          recentFiles: state.recentFiles.filter((f) => f.id !== id),
        }));
      },

      clearRecentFiles: () => set({ recentFiles: [] }),

      createNewFile: (name) => {
        const now = new Date().toISOString();
        const file: ProcessFile = {
          id: generateId(),
          name,
          path: '',
          content: '',
          createdAt: now,
          updatedAt: now,
        };
        set({ currentFile: file, isDirty: false, lastSaved: null });
        return file;
      },
    }),
    {
      name: 'rpaforge-files',
      partialize: (state) => ({
        recentFiles: state.recentFiles,
      }),
    }
  )
);
