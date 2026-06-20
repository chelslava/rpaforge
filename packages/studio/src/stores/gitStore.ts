import { create } from 'zustand';
import type { GitAPI } from '../types/ipc-contracts';
import type { GitFileStatus, GitLogEntry } from '../types/git';
import { createLogger } from '../utils/logger';

const logger = createLogger('gitStore');

interface GitState {
  isRepo: boolean | null;
  branch: string | null;
  ahead: number;
  behind: number;
  staged: GitFileStatus[];
  unstaged: GitFileStatus[];
  conflicted: string[];
  commitMessage: string;
  history: GitLogEntry[];
  isLoading: boolean;
  isPushing: boolean;
  isPulling: boolean;
  isCommitting: boolean;
  error: string | null;
  diffCache: Record<string, string>;
  selectedDiffFile: string | null;
  remoteUrl: string | null;
  isSavingRemote: boolean;

  refreshStatus: () => Promise<void>;
  initRepo: () => Promise<void>;
  stageFiles: (paths: string[]) => Promise<void>;
  unstageFiles: (paths: string[]) => Promise<void>;
  stageAll: () => Promise<void>;
  unstageAll: () => Promise<void>;
  setCommitMessage: (msg: string) => void;
  commit: () => Promise<void>;
  push: () => Promise<void>;
  pull: () => Promise<void>;
  loadHistory: (limit?: number) => Promise<void>;
  loadDiff: (path: string, staged: boolean) => Promise<void>;
  setSelectedDiffFile: (path: string | null) => void;
  discardChanges: (paths: string[]) => Promise<void>;
  loadRemoteUrl: () => Promise<void>;
  setRemoteUrl: (url: string) => Promise<void>;
  startWatching: () => void;
  stopWatching: () => void;
}

function getApi(): GitAPI | undefined {
  return window.rpaforge?.git;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

let unsubscribeFsEvent: (() => void) | null = null;
let watchDebounceTimeout: ReturnType<typeof setTimeout> | null = null;

export const useGitStore = create<GitState>((set, get) => ({
  isRepo: null,
  branch: null,
  ahead: 0,
  behind: 0,
  staged: [],
  unstaged: [],
  conflicted: [],
  commitMessage: '',
  history: [],
  isLoading: false,
  isPushing: false,
  isPulling: false,
  isCommitting: false,
  error: null,
  diffCache: {},
  selectedDiffFile: null,
  remoteUrl: null,
  isSavingRemote: false,

  refreshStatus: async () => {
    const api = getApi();
    if (!api) {
      set({ error: 'Git API not available' });
      return;
    }

    set({ isLoading: true, error: null });

    try {
      const result = await api.status();
      set({
        isRepo: result.isRepo,
        branch: result.branch,
        ahead: result.ahead,
        behind: result.behind,
        staged: result.staged,
        unstaged: result.unstaged,
        conflicted: result.conflicted,
        isLoading: false,
        error: null,
      });
    } catch (err) {
      logger.error('Failed to refresh git status', err);
      set({ error: errorMessage(err), isLoading: false });
    }
  },

  initRepo: async () => {
    const api = getApi();
    if (!api) {
      set({ error: 'Git API not available' });
      return;
    }

    set({ isLoading: true, error: null });

    try {
      await api.init();
      await get().refreshStatus();
    } catch (err) {
      logger.error('Failed to init git repo', err);
      set({ error: errorMessage(err), isLoading: false });
    }
  },

  stageFiles: async (paths: string[]) => {
    const api = getApi();
    if (!api) {
      set({ error: 'Git API not available' });
      return;
    }

    try {
      await api.stage(paths);
      await get().refreshStatus();
    } catch (err) {
      logger.error('Failed to stage files', err);
      set({ error: errorMessage(err) });
    }
  },

  unstageFiles: async (paths: string[]) => {
    const api = getApi();
    if (!api) {
      set({ error: 'Git API not available' });
      return;
    }

    try {
      await api.unstage(paths);
      await get().refreshStatus();
    } catch (err) {
      logger.error('Failed to unstage files', err);
      set({ error: errorMessage(err) });
    }
  },

  stageAll: async () => {
    const { unstaged } = get();
    await get().stageFiles(unstaged.map((f) => f.path));
  },

  unstageAll: async () => {
    const { staged } = get();
    await get().unstageFiles(staged.map((f) => f.path));
  },

  setCommitMessage: (msg: string) => {
    set({ commitMessage: msg });
  },

  commit: async () => {
    const api = getApi();
    if (!api) {
      set({ error: 'Git API not available' });
      return;
    }

    const { commitMessage } = get();
    set({ isCommitting: true, error: null });

    try {
      await api.commit(commitMessage);
      set({ commitMessage: '', isCommitting: false });
      await get().refreshStatus();
      await get().loadHistory();
    } catch (err) {
      logger.error('Failed to commit', err);
      set({ error: errorMessage(err), isCommitting: false });
    }
  },

  push: async () => {
    const api = getApi();
    if (!api) {
      set({ error: 'Git API not available' });
      return;
    }

    set({ isPushing: true, error: null });

    try {
      await api.push();
      set({ isPushing: false });
      await get().refreshStatus();
    } catch (err) {
      logger.error('Failed to push', err);
      set({ error: errorMessage(err), isPushing: false });
    }
  },

  pull: async () => {
    const api = getApi();
    if (!api) {
      set({ error: 'Git API not available' });
      return;
    }

    set({ isPulling: true, error: null });

    try {
      await api.pull();
      set({ isPulling: false });
      await get().refreshStatus();
    } catch (err) {
      logger.error('Failed to pull', err);
      set({ error: errorMessage(err), isPulling: false });
    }
  },

  loadHistory: async (limit?: number) => {
    const api = getApi();
    if (!api) {
      set({ error: 'Git API not available' });
      return;
    }

    try {
      const history = await api.log(limit);
      set({ history, error: null });
    } catch (err) {
      logger.error('Failed to load git history', err);
      set({ error: errorMessage(err) });
    }
  },

  loadDiff: async (path: string, staged: boolean) => {
    const api = getApi();
    if (!api) {
      set({ error: 'Git API not available' });
      return;
    }

    const key = `${path}:${staged}`;
    if (get().diffCache[key] !== undefined) {
      return;
    }

    try {
      const diff = await api.diff(path, staged);
      set((state) => ({ diffCache: { ...state.diffCache, [key]: diff }, error: null }));
    } catch (err) {
      logger.error('Failed to load diff', err);
      set({ error: errorMessage(err) });
    }
  },

  setSelectedDiffFile: (path: string | null) => {
    set({ selectedDiffFile: path });
  },

  discardChanges: async (paths: string[]) => {
    const api = getApi();
    if (!api) {
      set({ error: 'Git API not available' });
      return;
    }

    try {
      await api.discardChanges(paths);
      await get().refreshStatus();
    } catch (err) {
      logger.error('Failed to discard changes', err);
      set({ error: errorMessage(err) });
    }
  },

  loadRemoteUrl: async () => {
    const api = getApi();
    if (!api) {
      set({ error: 'Git API not available' });
      return;
    }

    try {
      const remoteUrl = await api.getRemoteUrl();
      set({ remoteUrl, error: null });
    } catch (err) {
      logger.error('Failed to load git remote URL', err);
      set({ error: errorMessage(err) });
    }
  },

  setRemoteUrl: async (url: string) => {
    const api = getApi();
    if (!api) {
      set({ error: 'Git API not available' });
      return;
    }

    set({ isSavingRemote: true, error: null });

    try {
      await api.setRemoteUrl(url);
      set({ remoteUrl: url, isSavingRemote: false });
    } catch (err) {
      logger.error('Failed to set git remote URL', err);
      set({ error: errorMessage(err), isSavingRemote: false });
    }
  },

  startWatching: () => {
    const fs = window.rpaforge?.fs;
    if (!fs) {
      logger.warn('FileSystem API not available, cannot start watching for git status');
      return;
    }

    if (unsubscribeFsEvent) {
      return;
    }

    unsubscribeFsEvent = fs.onFsEvent(() => {
      if (watchDebounceTimeout) {
        clearTimeout(watchDebounceTimeout);
      }

      watchDebounceTimeout = setTimeout(() => {
        void get().refreshStatus();
        watchDebounceTimeout = null;
      }, 500);
    });
  },

  stopWatching: () => {
    if (watchDebounceTimeout) {
      clearTimeout(watchDebounceTimeout);
      watchDebounceTimeout = null;
    }

    if (unsubscribeFsEvent) {
      unsubscribeFsEvent();
      unsubscribeFsEvent = null;
    }
  },
}));
