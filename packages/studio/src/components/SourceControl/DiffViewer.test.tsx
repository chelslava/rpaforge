import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { useGitStore } from '../../stores/gitStore';

vi.mock('@monaco-editor/react', () => ({
  default: ({ value }: { value: string }) => <div data-testid="monaco-editor">{value}</div>,
}));

vi.mock('../../hooks/useTheme', () => ({
  useResolvedTheme: () => 'light' as const,
}));

vi.mock('../../hooks/useFocusTrap', () => ({
  useFocusTrap: () => React.createRef<HTMLDivElement>(),
}));

import DiffViewer from './DiffViewer';

describe('DiffViewer', () => {
  beforeEach(() => {
    useGitStore.setState({ diffCache: {} });
  });

  test('renders without crashing with a given filePath', () => {
    render(<DiffViewer filePath="src/foo.ts" staged={false} onClose={vi.fn()} />);

    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.getByTestId('monaco-editor')).toBeTruthy();
  });

  test('shows basename of the file path in the title', () => {
    render(<DiffViewer filePath="src/dir/foo.ts" staged={false} onClose={vi.fn()} />);

    expect(screen.getByText((content) => content.includes('foo.ts'))).toBeTruthy();
  });

  test('renders cached diff content for the given path/staged key', () => {
    useGitStore.setState({ diffCache: { 'src/foo.ts:false': 'diff content here' } });

    render(<DiffViewer filePath="src/foo.ts" staged={false} onClose={vi.fn()} />);

    expect(screen.getByTestId('monaco-editor').textContent).toBe('diff content here');
  });

  test('clicking close button calls onClose', () => {
    const onClose = vi.fn();
    render(<DiffViewer filePath="src/foo.ts" staged={false} onClose={onClose} />);

    fireEvent.click(screen.getByLabelText('actions.cancel'));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test('pressing Escape calls onClose', () => {
    const onClose = vi.fn();
    render(<DiffViewer filePath="src/foo.ts" staged={false} onClose={onClose} />);

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
