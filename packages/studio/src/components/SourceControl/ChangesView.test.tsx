import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { useGitStore } from '../../stores/gitStore';
import type { GitFileStatus } from '../../types/git';

const { toastMock } = vi.hoisted(() => ({
  toastMock: {
    error: vi.fn(),
    success: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
  },
}));

vi.mock('sonner', () => ({
  toast: toastMock,
}));

vi.mock('../../hooks/useFocusTrap', () => ({
  useFocusTrap: () => React.createRef<HTMLDivElement>(),
}));

vi.mock('./DiffViewer', () => ({
  default: ({ filePath }: { filePath: string }) => <div data-testid="diff-viewer">{filePath}</div>,
}));

import ChangesView from './ChangesView';

function mockFile(overrides: Partial<GitFileStatus> = {}): GitFileStatus {
  return { path: 'src/foo.ts', index: ' ', working_dir: 'M', staged: false, ...overrides };
}

const BASE_STATE = {
  ahead: 0,
  behind: 0,
  staged: [] as GitFileStatus[],
  unstaged: [] as GitFileStatus[],
  conflicted: [] as string[],
  commitMessage: '',
  isPushing: false,
  isPulling: false,
  isCommitting: false,
  setCommitMessage: vi.fn(),
  stageFiles: vi.fn(),
  unstageFiles: vi.fn(),
  stageAll: vi.fn(),
  unstageAll: vi.fn(),
  commit: vi.fn(),
  push: vi.fn(),
  pull: vi.fn(),
  loadDiff: vi.fn(),
  setSelectedDiffFile: vi.fn(),
  discardChanges: vi.fn(),
  error: null as string | null,
};

describe('ChangesView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useGitStore.setState(BASE_STATE);
  });

  test('shows "no changes" text when staged and unstaged are empty', () => {
    render(<ChangesView />);

    expect(screen.getByText('gitSourceControl.noChanges')).toBeTruthy();
  });

  test('shows commit button disabled when commit message is empty', () => {
    useGitStore.setState({
      staged: [mockFile({ path: 'a.txt', staged: true, index: 'M' })],
      commitMessage: '',
    });

    render(<ChangesView />);

    const commitButton = screen.getByText('gitSourceControl.commit').closest('button') as HTMLButtonElement;
    expect(commitButton.disabled).toBe(true);
  });

  test('shows commit button disabled when staged is empty even with message', () => {
    useGitStore.setState({
      staged: [],
      commitMessage: 'hello',
    });

    render(<ChangesView />);

    const commitButton = screen.getByText('gitSourceControl.commit').closest('button') as HTMLButtonElement;
    expect(commitButton.disabled).toBe(true);
  });

  test('enables commit button when staged is non-empty and message is set', () => {
    useGitStore.setState({
      staged: [mockFile({ path: 'a.txt', staged: true, index: 'M' })],
      commitMessage: 'my commit',
    });

    render(<ChangesView />);

    const commitButton = screen.getByText('gitSourceControl.commit').closest('button') as HTMLButtonElement;
    expect(commitButton.disabled).toBe(false);
  });

  test('clicking commit button calls commit action', () => {
    const commit = vi.fn();
    useGitStore.setState({
      staged: [mockFile({ path: 'a.txt', staged: true, index: 'M' })],
      commitMessage: 'my commit',
      commit,
    });

    render(<ChangesView />);
    fireEvent.click(screen.getByText('gitSourceControl.commit'));

    expect(commit).toHaveBeenCalledTimes(1);
  });

  test('renders staged and unstaged file rows', () => {
    useGitStore.setState({
      staged: [mockFile({ path: 'staged.txt', staged: true, index: 'M' })],
      unstaged: [mockFile({ path: 'unstaged.txt' })],
    });

    render(<ChangesView />);

    expect(screen.getByText('staged.txt')).toBeTruthy();
    expect(screen.getByText('unstaged.txt')).toBeTruthy();
    expect(screen.getByText('gitSourceControl.stagedChanges')).toBeTruthy();
    expect(screen.getByText('gitSourceControl.changes')).toBeTruthy();
  });

  test('shows ahead/behind indicators when non-zero', () => {
    useGitStore.setState({ ahead: 3, behind: 2 });

    render(<ChangesView />);

    expect(screen.getByText('3')).toBeTruthy();
    expect(screen.getByText('2')).toBeTruthy();
  });

  test('clicking push button calls push action', () => {
    const push = vi.fn().mockResolvedValue(undefined);
    useGitStore.setState({ push });

    render(<ChangesView />);
    fireEvent.click(screen.getByText('gitSourceControl.push'));

    expect(push).toHaveBeenCalledTimes(1);
  });

  test('clicking pull button calls pull action', () => {
    const pull = vi.fn().mockResolvedValue(undefined);
    useGitStore.setState({ pull });

    render(<ChangesView />);
    fireEvent.click(screen.getByText('gitSourceControl.pull'));

    expect(pull).toHaveBeenCalledTimes(1);
  });

  test('shows conflicted files section when conflicts exist', () => {
    useGitStore.setState({ conflicted: ['conflict.txt'] });

    render(<ChangesView />);

    expect(screen.getByText('gitSourceControl.mergeConflict')).toBeTruthy();
    expect(screen.getByText('conflict.txt')).toBeTruthy();
  });
});
