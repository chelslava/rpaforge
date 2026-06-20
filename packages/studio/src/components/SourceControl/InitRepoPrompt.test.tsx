import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { useGitStore } from '../../stores/gitStore';
import InitRepoPrompt from './InitRepoPrompt';

describe('InitRepoPrompt', () => {
  beforeEach(() => {
    useGitStore.setState({ isRepo: false });
  });

  test('renders the init button', () => {
    render(<InitRepoPrompt />);

    expect(screen.getByText('gitSourceControl.notARepo')).toBeTruthy();
    expect(screen.getByText('gitSourceControl.initRepo')).toBeTruthy();
  });

  test('clicking the button calls initRepo', () => {
    const initRepo = vi.fn();
    useGitStore.setState({ initRepo });

    render(<InitRepoPrompt />);
    fireEvent.click(screen.getByText('gitSourceControl.initRepo'));

    expect(initRepo).toHaveBeenCalledTimes(1);
  });
});
