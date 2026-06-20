import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { GitStatusResult, GitLogEntry, GitFileStatus } from '../types/git';
import { useGitStore } from './gitStore';

function mockFile(path: string, overrides: Partial<GitFileStatus> = {}): GitFileStatus {
  return { path, index: ' ', working_dir: 'M', staged: false, ...overrides };
}

function setupRpaforge() {
  const git = {
    isGitRepo: vi.fn(),
    init: vi.fn(),
    status: vi.fn(),
    stage: vi.fn(),
    unstage: vi.fn(),
    commit: vi.fn(),
    push: vi.fn(),
    pull: vi.fn(),
    log: vi.fn(),
    diff: vi.fn(),
    currentBranch: vi.fn(),
    discardChanges: vi.fn(),
    getRemoteUrl: vi.fn(),
    setRemoteUrl: vi.fn(),
  };
  const fs = {
    onFsEvent: vi.fn((_listener: () => void) => vi.fn()),
  };

  Object.defineProperty(window, 'rpaforge', {
    value: { git, fs },
    writable: true,
    configurable: true,
  });

  return { git, fs };
}

const INITIAL_STATE = {
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
};

describe('gitStore', () => {
  beforeEach(() => {
    useGitStore.setState(INITIAL_STATE);
    vi.clearAllMocks();
  });

  test('refreshStatus updates state from API result', async () => {
    const { git } = setupRpaforge();
    const result: GitStatusResult = {
      isRepo: true,
      branch: 'main',
      ahead: 1,
      behind: 2,
      tracking: 'origin/main',
      staged: [mockFile('a.txt', { staged: true, index: 'M' })],
      unstaged: [mockFile('b.txt')],
      conflicted: [],
    };
    git.status.mockResolvedValue(result);

    await useGitStore.getState().refreshStatus();

    const state = useGitStore.getState();
    expect(state.isRepo).toBe(true);
    expect(state.branch).toBe('main');
    expect(state.ahead).toBe(1);
    expect(state.behind).toBe(2);
    expect(state.staged).toEqual(result.staged);
    expect(state.unstaged).toEqual(result.unstaged);
    expect(state.isLoading).toBe(false);
    expect(state.error).toBeNull();
  });

  test('refreshStatus sets error and clears isLoading on rejection', async () => {
    const { git } = setupRpaforge();
    git.status.mockRejectedValue(new Error('boom'));

    await useGitStore.getState().refreshStatus();

    const state = useGitStore.getState();
    expect(state.error).toBe('boom');
    expect(state.isLoading).toBe(false);
  });

  test('commit clears commitMessage and refreshes status/history', async () => {
    const { git } = setupRpaforge();
    git.commit.mockResolvedValue({ hash: 'abc123' });
    git.status.mockResolvedValue({
      isRepo: true,
      branch: 'main',
      ahead: 0,
      behind: 0,
      tracking: null,
      staged: [],
      unstaged: [],
      conflicted: [],
    });
    const historyEntry: GitLogEntry = {
      hash: 'abc123',
      date: '2024-01-01T00:00:00.000Z',
      message: 'msg',
      author_name: 'Author',
      author_email: 'a@b.com',
    };
    git.log.mockResolvedValue([historyEntry]);

    useGitStore.setState({ commitMessage: 'my commit' });
    await useGitStore.getState().commit();

    expect(git.commit).toHaveBeenCalledWith('my commit');
    expect(git.status).toHaveBeenCalled();
    expect(git.log).toHaveBeenCalled();

    const state = useGitStore.getState();
    expect(state.commitMessage).toBe('');
    expect(state.isCommitting).toBe(false);
    expect(state.history).toEqual([historyEntry]);
  });

  test('commit sets error and isCommitting false on failure', async () => {
    const { git } = setupRpaforge();
    git.commit.mockRejectedValue(new Error('commit failed'));

    useGitStore.setState({ commitMessage: 'my commit' });
    await useGitStore.getState().commit();

    const state = useGitStore.getState();
    expect(state.error).toBe('commit failed');
    expect(state.isCommitting).toBe(false);
    expect(state.commitMessage).toBe('my commit');
  });

  test('push sets isPushing true during call and refreshes status afterward', async () => {
    const { git } = setupRpaforge();
    let pushResolve!: () => void;
    git.push.mockReturnValue(
      new Promise<void>((resolve) => {
        pushResolve = resolve;
      })
    );
    git.status.mockResolvedValue({
      isRepo: true,
      branch: 'main',
      ahead: 0,
      behind: 0,
      tracking: null,
      staged: [],
      unstaged: [],
      conflicted: [],
    });

    const pushPromise = useGitStore.getState().push();
    expect(useGitStore.getState().isPushing).toBe(true);

    pushResolve();
    await pushPromise;

    expect(useGitStore.getState().isPushing).toBe(false);
    expect(git.status).toHaveBeenCalled();
  });

  test('push sets error and isPushing false on failure', async () => {
    const { git } = setupRpaforge();
    git.push.mockRejectedValue(new Error('push failed'));

    await useGitStore.getState().push();

    const state = useGitStore.getState();
    expect(state.error).toBe('push failed');
    expect(state.isPushing).toBe(false);
  });

  test('pull sets isPulling true during call and refreshes status afterward', async () => {
    const { git } = setupRpaforge();
    let pullResolve!: () => void;
    git.pull.mockReturnValue(
      new Promise<void>((resolve) => {
        pullResolve = resolve;
      })
    );
    git.status.mockResolvedValue({
      isRepo: true,
      branch: 'main',
      ahead: 0,
      behind: 0,
      tracking: null,
      staged: [],
      unstaged: [],
      conflicted: [],
    });

    const pullPromise = useGitStore.getState().pull();
    expect(useGitStore.getState().isPulling).toBe(true);

    pullResolve();
    await pullPromise;

    expect(useGitStore.getState().isPulling).toBe(false);
    expect(git.status).toHaveBeenCalled();
  });

  test('pull sets error and isPulling false on failure', async () => {
    const { git } = setupRpaforge();
    git.pull.mockRejectedValue(new Error('pull failed'));

    await useGitStore.getState().pull();

    const state = useGitStore.getState();
    expect(state.error).toBe('pull failed');
    expect(state.isPulling).toBe(false);
  });

  test('stageFiles calls API with paths and refreshes status', async () => {
    const { git } = setupRpaforge();
    git.status.mockResolvedValue({
      isRepo: true,
      branch: 'main',
      ahead: 0,
      behind: 0,
      tracking: null,
      staged: [],
      unstaged: [],
      conflicted: [],
    });

    await useGitStore.getState().stageFiles(['a.txt', 'b.txt']);

    expect(git.stage).toHaveBeenCalledWith(['a.txt', 'b.txt']);
    expect(git.status).toHaveBeenCalled();
  });

  test('unstageFiles calls API with paths and refreshes status', async () => {
    const { git } = setupRpaforge();
    git.status.mockResolvedValue({
      isRepo: true,
      branch: 'main',
      ahead: 0,
      behind: 0,
      tracking: null,
      staged: [],
      unstaged: [],
      conflicted: [],
    });

    await useGitStore.getState().unstageFiles(['a.txt']);

    expect(git.unstage).toHaveBeenCalledWith(['a.txt']);
    expect(git.status).toHaveBeenCalled();
  });

  test('discardChanges calls API with paths and refreshes status', async () => {
    const { git } = setupRpaforge();
    git.status.mockResolvedValue({
      isRepo: true,
      branch: 'main',
      ahead: 0,
      behind: 0,
      tracking: null,
      staged: [],
      unstaged: [],
      conflicted: [],
    });

    await useGitStore.getState().discardChanges(['c.txt']);

    expect(git.discardChanges).toHaveBeenCalledWith(['c.txt']);
    expect(git.status).toHaveBeenCalled();
  });

  test('stageAll stages all paths currently in unstaged', async () => {
    const { git } = setupRpaforge();
    git.status.mockResolvedValue({
      isRepo: true,
      branch: 'main',
      ahead: 0,
      behind: 0,
      tracking: null,
      staged: [],
      unstaged: [],
      conflicted: [],
    });

    useGitStore.setState({
      unstaged: [mockFile('a.txt'), mockFile('b.txt')],
    });

    await useGitStore.getState().stageAll();

    expect(git.stage).toHaveBeenCalledWith(['a.txt', 'b.txt']);
  });

  test('unstageAll unstages all paths currently in staged', async () => {
    const { git } = setupRpaforge();
    git.status.mockResolvedValue({
      isRepo: true,
      branch: 'main',
      ahead: 0,
      behind: 0,
      tracking: null,
      staged: [],
      unstaged: [],
      conflicted: [],
    });

    useGitStore.setState({
      staged: [mockFile('a.txt', { staged: true }), mockFile('b.txt', { staged: true })],
    });

    await useGitStore.getState().unstageAll();

    expect(git.unstage).toHaveBeenCalledWith(['a.txt', 'b.txt']);
  });

  test('loadDiff caches result and does not call API again for same key', async () => {
    const { git } = setupRpaforge();
    git.diff.mockResolvedValue('diff content');

    await useGitStore.getState().loadDiff('file.txt', false);
    await useGitStore.getState().loadDiff('file.txt', false);

    expect(git.diff).toHaveBeenCalledTimes(1);
    expect(useGitStore.getState().diffCache['file.txt:false']).toBe('diff content');
  });

  test('loadDiff uses separate cache entries for staged vs unstaged', async () => {
    const { git } = setupRpaforge();
    git.diff.mockResolvedValueOnce('unstaged diff').mockResolvedValueOnce('staged diff');

    await useGitStore.getState().loadDiff('file.txt', false);
    await useGitStore.getState().loadDiff('file.txt', true);

    expect(git.diff).toHaveBeenCalledTimes(2);
    expect(useGitStore.getState().diffCache['file.txt:false']).toBe('unstaged diff');
    expect(useGitStore.getState().diffCache['file.txt:true']).toBe('staged diff');
  });

  test('startWatching subscribes once and refreshStatus on fs event after debounce', async () => {
    vi.useFakeTimers();
    const { git, fs } = setupRpaforge();
    git.status.mockResolvedValue({
      isRepo: true,
      branch: 'main',
      ahead: 0,
      behind: 0,
      tracking: null,
      staged: [],
      unstaged: [],
      conflicted: [],
    });

    let fsListener: (() => void) | undefined;
    fs.onFsEvent.mockImplementation((listener: () => void) => {
      fsListener = listener;
      return vi.fn();
    });

    useGitStore.getState().startWatching();
    expect(fs.onFsEvent).toHaveBeenCalledTimes(1);

    fsListener?.();
    await vi.advanceTimersByTimeAsync(500);

    expect(git.status).toHaveBeenCalled();

    useGitStore.getState().stopWatching();
    vi.useRealTimers();
  });

  test('stopWatching calls the unsubscribe function returned by onFsEvent', () => {
    const { fs } = setupRpaforge();
    const unsubscribe = vi.fn();
    fs.onFsEvent.mockReturnValue(unsubscribe);

    useGitStore.getState().startWatching();
    useGitStore.getState().stopWatching();

    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  test('initRepo calls API init and refreshes status', async () => {
    const { git } = setupRpaforge();
    git.init.mockResolvedValue(undefined);
    git.status.mockResolvedValue({
      isRepo: true,
      branch: 'main',
      ahead: 0,
      behind: 0,
      tracking: null,
      staged: [],
      unstaged: [],
      conflicted: [],
    });

    await useGitStore.getState().initRepo();

    expect(git.init).toHaveBeenCalled();
    expect(git.status).toHaveBeenCalled();
    expect(useGitStore.getState().isRepo).toBe(true);
  });

  test('setCommitMessage updates commitMessage', () => {
    setupRpaforge();
    useGitStore.getState().setCommitMessage('hello');
    expect(useGitStore.getState().commitMessage).toBe('hello');
  });

  test('setSelectedDiffFile updates selectedDiffFile', () => {
    setupRpaforge();
    useGitStore.getState().setSelectedDiffFile('file.txt');
    expect(useGitStore.getState().selectedDiffFile).toBe('file.txt');
    useGitStore.getState().setSelectedDiffFile(null);
    expect(useGitStore.getState().selectedDiffFile).toBeNull();
  });

  test('loadRemoteUrl stores the URL returned by the API', async () => {
    const { git } = setupRpaforge();
    git.getRemoteUrl.mockResolvedValue('https://example.com/repo.git');

    await useGitStore.getState().loadRemoteUrl();

    expect(useGitStore.getState().remoteUrl).toBe('https://example.com/repo.git');
    expect(useGitStore.getState().error).toBeNull();
  });

  test('loadRemoteUrl sets error on failure', async () => {
    const { git } = setupRpaforge();
    git.getRemoteUrl.mockRejectedValue(new Error('no remote'));

    await useGitStore.getState().loadRemoteUrl();

    expect(useGitStore.getState().error).toBe('no remote');
  });

  test('setRemoteUrl saves the URL and updates state', async () => {
    const { git } = setupRpaforge();
    git.setRemoteUrl.mockResolvedValue(undefined);

    await useGitStore.getState().setRemoteUrl('https://example.com/new-repo.git');

    expect(git.setRemoteUrl).toHaveBeenCalledWith('https://example.com/new-repo.git');
    expect(useGitStore.getState().remoteUrl).toBe('https://example.com/new-repo.git');
    expect(useGitStore.getState().isSavingRemote).toBe(false);
  });

  test('setRemoteUrl sets error and isSavingRemote false on failure', async () => {
    const { git } = setupRpaforge();
    git.setRemoteUrl.mockRejectedValue(new Error('invalid url'));

    await useGitStore.getState().setRemoteUrl('not-a-url');

    expect(useGitStore.getState().error).toBe('invalid url');
    expect(useGitStore.getState().isSavingRemote).toBe(false);
  });
});
