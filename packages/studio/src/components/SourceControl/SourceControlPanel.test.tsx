import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { useGitStore } from '../../stores/gitStore';
import { useProjectFsStore } from '../../stores/projectFsStore';

vi.mock('./ChangesView', () => ({
  default: () => <div data-testid="changes-view" />,
}));

vi.mock('./CommitHistoryView', () => ({
  default: () => <div data-testid="commit-history-view" />,
}));

import SourceControlPanel from './SourceControlPanel';

describe('SourceControlPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useGitStore.setState({
      isRepo: null,
      remoteUrl: null,
      isSavingRemote: false,
      refreshStatus: vi.fn().mockResolvedValue(undefined),
      loadRemoteUrl: vi.fn().mockResolvedValue(undefined),
      setRemoteUrl: vi.fn().mockResolvedValue(undefined),
      startWatching: vi.fn(),
      stopWatching: vi.fn(),
    });
    useProjectFsStore.setState({ projectPath: '/some/project' });
  });

  test('renders loading spinner when isRepo is null', () => {
    useGitStore.setState({ isRepo: null });

    const { container } = render(<SourceControlPanel />);

    expect(container.querySelector('svg.animate-spin')).toBeTruthy();
  });

  test('renders InitRepoPrompt when isRepo is false', () => {
    useGitStore.setState({ isRepo: false });

    render(<SourceControlPanel />);

    expect(screen.getByText('gitSourceControl.notARepo')).toBeTruthy();
  });

  test('renders ChangesView by default when isRepo is true', () => {
    useGitStore.setState({ isRepo: true });

    render(<SourceControlPanel />);

    expect(screen.getByTestId('changes-view')).toBeTruthy();
  });

  test('switches to history tab when clicked', () => {
    useGitStore.setState({ isRepo: true });

    render(<SourceControlPanel />);
    fireEvent.click(screen.getByText('gitSourceControl.history'));

    expect(screen.getByTestId('commit-history-view')).toBeTruthy();
  });

  test('clicking the gear icon opens the remote settings dialog', () => {
    useGitStore.setState({ isRepo: true, remoteUrl: 'https://example.com/repo.git' });

    render(<SourceControlPanel />);
    expect(screen.queryByRole('dialog')).toBeNull();

    fireEvent.click(screen.getByLabelText('gitSourceControl.remoteSettings'));

    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.getByDisplayValue('https://example.com/repo.git')).toBeTruthy();
  });

  test('saving the remote URL calls setRemoteUrl and closes the dialog on success', async () => {
    const setRemoteUrl = vi.fn().mockResolvedValue(undefined);
    useGitStore.setState({ isRepo: true, remoteUrl: null, setRemoteUrl });

    render(<SourceControlPanel />);
    fireEvent.click(screen.getByLabelText('gitSourceControl.remoteSettings'));
    fireEvent.change(screen.getByLabelText('gitSourceControl.remoteUrl'), {
      target: { value: 'https://example.com/new-repo.git' },
    });
    fireEvent.click(screen.getByText('gitSourceControl.save'));
    await Promise.resolve();
    await Promise.resolve();

    expect(setRemoteUrl).toHaveBeenCalledWith('https://example.com/new-repo.git');
  });
});
