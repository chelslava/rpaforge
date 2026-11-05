import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, test, vi } from 'vitest';

vi.mock('../../hooks/useFocusTrap', () => ({
  useFocusTrap: () => React.createRef<HTMLDivElement>(),
}));

import DiagramMergeView from './DiagramMergeView';
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
    })) as unknown as Array<{ id: string; data: Record<string, unknown> }>,
    edges.map((e) => ({ id: `${e.source}->${e.target}`, source: e.source, target: e.target })),
    {
      id: 'p1',
      name: 'Main',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
    undefined,
    []
  );
}

function mockStages(stages: { base: string | null; ours: string | null; theirs: string | null }) {
  const git = {
    conflictStages: vi.fn(async () => stages),
    stage: vi.fn(async (_paths: string[]) => undefined),
    writeWorktreeFile: vi.fn(async (_path: string, _content: string) => undefined),
  };
  Object.defineProperty(window, 'rpaforge', {
    value: { git, fs: {} },
    writable: true,
    configurable: true,
  });
  return git;
}

const BASE = processJson(
  [
    { id: 'n1', label: 'Read file', params: { path: 'a.xlsx' } },
    { id: 'n2', label: 'Write cell', params: { sheet: 'S1' } },
  ],
  [{ source: 'n1', target: 'n2' }]
);

describe('DiagramMergeView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('auto-merges non-conflicting sides and reports no conflicts', async () => {
    const ours = processJson(
      [
        { id: 'n1', label: 'Read file', params: { path: 'ours.xlsx' } },
        { id: 'n2', label: 'Write cell', params: { sheet: 'S1' } },
      ],
      [{ source: 'n1', target: 'n2' }]
    );
    const theirs = processJson(
      [
        { id: 'n1', label: 'Read file', params: { path: 'a.xlsx' } },
        { id: 'n2', label: 'Write cell', params: { sheet: 'S2' } },
      ],
      [{ source: 'n1', target: 'n2' }]
    );
    mockStages({ base: BASE, ours, theirs });

    render(<DiagramMergeView filePath="main.process" onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('No conflicts - both sides merged cleanly.')).toBeTruthy();
    });
  });

  test('conflicting field edits appear with ours/theirs resolution', async () => {
    const ours = processJson(
      [{ id: 'n1', label: 'Read file', params: { path: 'ours.xlsx' } }],
      []
    );
    const theirs = processJson(
      [{ id: 'n1', label: 'Read file', params: { path: 'theirs.xlsx' } }],
      []
    );
    const base = processJson([{ id: 'n1', label: 'Read file', params: { path: 'a.xlsx' } }], []);
    mockStages({ base, ours, theirs });

    render(<DiagramMergeView filePath="main.process" onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText((c) => c.includes('Changed on both sides'))).toBeTruthy();
    });
    fireEvent.click(screen.getByText('Take theirs'));
    fireEvent.click(screen.getByText('Apply & mark resolved'));

    await waitFor(() => {
      expect(screen.getAllByText('Resolved and staged').length).toBeGreaterThan(0);
    });
  });

  test('apply writes the resolved JSON and stages the file', async () => {
    const ours = processJson(
      [{ id: 'n1', label: 'Read file', params: { path: 'ours.xlsx' } }],
      []
    );
    const theirs = processJson(
      [{ id: 'n1', label: 'Read file', params: { path: 'theirs.xlsx' } }],
      []
    );
    const base = processJson([{ id: 'n1', label: 'Read file', params: { path: 'a.xlsx' } }], []);
    const git = mockStages({ base, ours, theirs });

    render(<DiagramMergeView filePath="main.process" onClose={vi.fn()} />);

    const apply = await screen.findByText('Apply & mark resolved');
    fireEvent.click(apply);

    await waitFor(() => {
      expect(git.writeWorktreeFile).toHaveBeenCalledTimes(1);
      expect(git.stage).toHaveBeenCalledWith(['main.process']);
    });
    const written = JSON.parse(git.writeWorktreeFile.mock.calls[0][1]) as {
      nodes: Array<{ id: string; data: { params: Record<string, unknown> } }>;
    };
    expect(written.nodes).toHaveLength(1);
    expect(written.nodes[0].data.params.path).toBe('ours.xlsx');
  });

  test('shows the failure message when stages cannot be loaded', async () => {
    const git = {
      conflictStages: vi.fn(async () => {
        throw new Error('nope');
      }),
      stage: vi.fn(),
      writeWorktreeFile: vi.fn(),
    };
    Object.defineProperty(window, 'rpaforge', {
      value: { git, fs: {} },
      writable: true,
      configurable: true,
    });

    render(<DiagramMergeView filePath="main.process" onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText((c) => c.includes('mergeLoadFailed'))).toBeTruthy();
    });
  });
});
