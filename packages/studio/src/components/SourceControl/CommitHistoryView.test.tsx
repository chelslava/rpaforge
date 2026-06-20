import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { useGitStore } from '../../stores/gitStore';
import type { GitLogEntry } from '../../types/git';
import CommitHistoryView from './CommitHistoryView';

function mockEntry(overrides: Partial<GitLogEntry> = {}): GitLogEntry {
  return {
    hash: 'abcdef1234567890',
    date: '2024-01-01T00:00:00.000Z',
    message: 'Initial commit',
    author_name: 'Jane Doe',
    author_email: 'jane@example.com',
    ...overrides,
  };
}

describe('CommitHistoryView', () => {
  beforeEach(() => {
    useGitStore.setState({ history: [], loadHistory: vi.fn() });
  });

  test('shows empty state when history is empty', () => {
    render(<CommitHistoryView />);

    expect(screen.getByText('gitSourceControl.noChanges')).toBeTruthy();
  });

  test('calls loadHistory when history is empty', () => {
    const loadHistory = vi.fn();
    useGitStore.setState({ history: [], loadHistory });

    render(<CommitHistoryView />);

    expect(loadHistory).toHaveBeenCalled();
  });

  test('renders history entries with hash, message and author', () => {
    useGitStore.setState({
      history: [mockEntry({ hash: 'abcdef1234567890', message: 'Fix bug', author_name: 'Jane Doe' })],
      loadHistory: vi.fn(),
    });

    render(<CommitHistoryView />);

    expect(screen.getByText('Fix bug')).toBeTruthy();
    expect(screen.getByText('abcdef1')).toBeTruthy();
    expect(screen.getByText((content) => content.includes('Jane Doe'))).toBeTruthy();
  });

  test('renders multiple history entries', () => {
    useGitStore.setState({
      history: [
        mockEntry({ hash: 'hash1', message: 'First commit' }),
        mockEntry({ hash: 'hash2', message: 'Second commit' }),
      ],
      loadHistory: vi.fn(),
    });

    render(<CommitHistoryView />);

    expect(screen.getByText('First commit')).toBeTruthy();
    expect(screen.getByText('Second commit')).toBeTruthy();
  });
});
