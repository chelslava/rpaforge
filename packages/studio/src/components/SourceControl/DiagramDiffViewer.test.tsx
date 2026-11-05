import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, test, vi } from 'vitest';

vi.mock('@monaco-editor/react', () => ({
  default: ({ value }: { value: string }) => <div data-testid="monaco-editor">{value}</div>,
}));

vi.mock('../../hooks/useTheme', () => ({
  useResolvedTheme: () => 'light' as const,
}));

vi.mock('../../hooks/useFocusTrap', () => ({
  useFocusTrap: () => React.createRef<HTMLDivElement>(),
}));

import DiagramDiffViewer from './DiagramDiffViewer';
import { serializeDiagram } from '../../utils/fileUtils';

function processJson(
  nodes: Array<{ id: string; label: string; params: Record<string, unknown> }>,
  edges: Array<{ source: string; target: string }>
): string {
  return serializeDiagram(
    nodes.map((n, i) => ({
      id: n.id,
      type: 'activity',
      position: { x: i * 200, y: 0 },
      data: { type: 'activity', label: n.label, params: n.params },
    })) as never,
    edges.map((e) => ({ id: `${e.source}->${e.target}`, source: e.source, target: e.target })),
    {
      id: 'p1',
      name: 'Main',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    } as never,
    undefined,
    []
  );
}

type StageSpec = { head: string | null; worktree: string | null; staged?: string | null; diff?: string };

function mockBridge(spec: StageSpec) {
  const git = {
    showBlob: vi.fn(
      async (rev: string, _path: string) =>
        rev === 'HEAD' ? spec.head : rev === ':0:' ? (spec.staged ?? null) : null
    ),
    readWorktreeFile: vi.fn(async (_path: string) => spec.worktree),
    diff: vi.fn(async () => spec.diff ?? ''),
    conflictStages: vi.fn(async () => ({ base: null, ours: null, theirs: null })),
    stage: vi.fn(async () => undefined),
    writeWorktreeFile: vi.fn(async () => undefined),
  };
  Object.defineProperty(window, 'rpaforge', {
    value: { git },
    writable: true,
    configurable: true,
  });
  return git;
}

describe('DiagramDiffViewer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('renders semantic panes with node status for .process files', async () => {
    const head = processJson(
      [
        { id: 'n1', label: 'Read file', params: { path: 'a.xlsx' } },
        { id: 'n2', label: 'Write cell', params: { path: 'a.xlsx' } },
      ],
      [{ source: 'n1', target: 'n2' }]
    );
    const worktree = processJson(
      [
        { id: 'n1', label: 'Read file', params: { path: 'b.xlsx' } },
        { id: 'n2', label: 'Write cell', params: { path: 'a.xlsx' } },
        { id: 'n3', label: 'Send mail', params: {} },
      ],
      [{ source: 'n1', target: 'n2' }, { source: 'n2', target: 'n3' }]
    );
    mockBridge({ head, worktree });

    render(<DiagramDiffViewer filePath="main.process" staged={false} onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeTruthy();
    });
    // Modified node in the change list with its field path.
    await waitFor(() => {
      expect(screen.getByText((c) => c.includes('Changed Read file'))).toBeTruthy();
    });
    expect(screen.getByText((c) => c.includes('params.path'))).toBeTruthy();
    // Added node entry (label resolved from the target revision).
    expect(screen.getByText((c) => c.includes('Added Send mail'))).toBeTruthy();
  });

  test('falls back to the text diff when a revision is unparseable', async () => {
    mockBridge({ head: 'not json at all', worktree: processJson([{ id: 'n1', label: 'A', params: {} }], []), diff: 'diff-text-here' });

    render(<DiagramDiffViewer filePath="main.process" staged={false} onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByTestId('monaco-editor').textContent).toBe('diff-text-here');
    });
  });

  test('reads the staged blob when staged=true', async () => {
    const head = processJson([{ id: 'n1', label: 'A', params: {} }], []);
    const staged = processJson([{ id: 'n1', label: 'A', params: { x: 1 } }], []);
    const git = mockBridge({ head, worktree: null, staged });

    render(<DiagramDiffViewer filePath="main.process" staged onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText((c) => c.includes('Changed A'))).toBeTruthy();
    });
    expect(git.showBlob).toHaveBeenCalledWith(':0:', 'main.process');
  });

  test('close button and Escape invoke onClose', async () => {
    mockBridge({ head: null, worktree: null });
    const onClose = vi.fn();
    render(<DiagramDiffViewer filePath="main.process" staged={false} onClose={onClose} />);

    await waitFor(() => {
      expect(screen.getByLabelText('actions.cancel')).toBeTruthy();
    });
    fireEvent.click(screen.getByLabelText('actions.cancel'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
