import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import type { GitFileStatus } from '../../types/git';
import FileStatusRow from './FileStatusRow';

function mockFile(overrides: Partial<GitFileStatus> = {}): GitFileStatus {
  return { path: 'src/foo.ts', index: ' ', working_dir: 'M', staged: false, ...overrides };
}

describe('FileStatusRow', () => {
  test('renders the file basename', () => {
    render(<FileStatusRow file={mockFile({ path: 'src/dir/foo.ts' })} onViewDiff={vi.fn()} />);

    expect(screen.getByText('foo.ts')).toBeTruthy();
  });

  test('clicking the row triggers onViewDiff', () => {
    const onViewDiff = vi.fn();
    render(<FileStatusRow file={mockFile()} onViewDiff={onViewDiff} />);

    fireEvent.click(screen.getByText('foo.ts'));

    expect(onViewDiff).toHaveBeenCalledTimes(1);
  });

  test('clicking stage button calls onStage and not onViewDiff', () => {
    const onStage = vi.fn();
    const onViewDiff = vi.fn();
    render(<FileStatusRow file={mockFile()} onStage={onStage} onViewDiff={onViewDiff} />);

    fireEvent.click(screen.getByLabelText('gitSourceControl.stageAll'));

    expect(onStage).toHaveBeenCalledTimes(1);
    expect(onViewDiff).not.toHaveBeenCalled();
  });

  test('clicking unstage button calls onUnstage and not onViewDiff', () => {
    const onUnstage = vi.fn();
    const onViewDiff = vi.fn();
    render(
      <FileStatusRow file={mockFile({ staged: true, index: 'M' })} onUnstage={onUnstage} onViewDiff={onViewDiff} />
    );

    fireEvent.click(screen.getByLabelText('gitSourceControl.unstageAll'));

    expect(onUnstage).toHaveBeenCalledTimes(1);
    expect(onViewDiff).not.toHaveBeenCalled();
  });

  test('clicking discard button calls onDiscard and not onViewDiff', () => {
    const onDiscard = vi.fn();
    const onViewDiff = vi.fn();
    render(<FileStatusRow file={mockFile()} onDiscard={onDiscard} onViewDiff={onViewDiff} />);

    fireEvent.click(screen.getByLabelText('gitSourceControl.discardChanges'));

    expect(onDiscard).toHaveBeenCalledTimes(1);
    expect(onViewDiff).not.toHaveBeenCalled();
  });

  test('does not render stage/unstage/discard buttons when callbacks are not provided', () => {
    render(<FileStatusRow file={mockFile()} onViewDiff={vi.fn()} />);

    expect(screen.queryByLabelText('gitSourceControl.stageAll')).toBeNull();
    expect(screen.queryByLabelText('gitSourceControl.unstageAll')).toBeNull();
    expect(screen.queryByLabelText('gitSourceControl.discardChanges')).toBeNull();
  });
});
