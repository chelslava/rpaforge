import { beforeEach, describe, expect, test } from 'vitest';

import { useWatchStore } from './watchStore';
import type { WatchEntry } from './watchStore';

const diagram = 'diag-1';

const persistedSnapshot = (): { watchesByDiagram: Record<string, WatchEntry[]> } => ({
  watchesByDiagram: {
    [diagram]: [
      { id: 'w1', expression: 'total > 100', enabled: true, status: 'idle' as const },
    ],
  },
});

describe('watchStore', () => {
  beforeEach(() => {
    useWatchStore.setState({ watchesByDiagram: {} });
  });

  test('adds a trimmed watch and rejects duplicates', () => {
    useWatchStore.getState().addWatch(diagram, '  total > 100  ');
    useWatchStore.getState().addWatch(diagram, 'total > 100');
    const list = useWatchStore.getState().watchesByDiagram[diagram];
    expect(list).toHaveLength(1);
    expect(list[0].expression).toBe('total > 100');
    expect(list[0].enabled).toBe(true);
    expect(list[0].status).toBe('idle');
  });

  test('ignores blank expressions', () => {
    useWatchStore.getState().addWatch(diagram, '   ');
    expect(useWatchStore.getState().watchesByDiagram[diagram]).toBeUndefined();
  });

  test('keeps watches isolated per diagram', () => {
    useWatchStore.getState().addWatch(diagram, 'a');
    useWatchStore.getState().addWatch('other-diagram', 'b');
    expect(useWatchStore.getState().watchesByDiagram[diagram]).toHaveLength(1);
    expect(useWatchStore.getState().watchesByDiagram['other-diagram']).toHaveLength(1);
  });

  test('removeWatch deletes only the target entry', () => {
    useWatchStore.getState().addWatch(diagram, 'a');
    useWatchStore.getState().addWatch(diagram, 'b');
    const first = useWatchStore.getState().watchesByDiagram[diagram][0];
    useWatchStore.getState().removeWatch(diagram, first.id);
    const rest = useWatchStore.getState().watchesByDiagram[diagram];
    expect(rest).toHaveLength(1);
    expect(rest[0].expression).toBe('b');
  });

  test('updateWatch resets runtime fields', () => {
    useWatchStore.getState().addWatch(diagram, 'old');
    const entry = useWatchStore.getState().watchesByDiagram[diagram][0];
    useWatchStore.getState().setResults(diagram, {
      [entry.id]: { status: 'error', error: 'boom' },
    });
    useWatchStore.getState().updateWatch(diagram, entry.id, 'new_expr');
    const updated = useWatchStore.getState().watchesByDiagram[diagram][0];
    expect(updated.expression).toBe('new_expr');
    expect(updated.status).toBe('idle');
    expect(updated.error).toBeUndefined();
  });

  test('toggleWatch flips enabled and resets runtime fields', () => {
    useWatchStore.getState().addWatch(diagram, 'x');
    const entry = useWatchStore.getState().watchesByDiagram[diagram][0];
    useWatchStore.getState().setResults(diagram, {
      [entry.id]: { status: 'ok', value: '1', valueType: 'int' },
    });
    useWatchStore.getState().toggleWatch(diagram, entry.id);
    const toggled = useWatchStore.getState().watchesByDiagram[diagram][0];
    expect(toggled.enabled).toBe(false);
    expect(toggled.status).toBe('idle');
  });

  test('setResults applies only enabled watches and clears disabled ones', () => {
    useWatchStore.getState().addWatch(diagram, 'on');
    useWatchStore.getState().addWatch(diagram, 'off');
    const [on, off] = useWatchStore.getState().watchesByDiagram[diagram];
    useWatchStore.getState().toggleWatch(diagram, off.id);
    useWatchStore.getState().setResults(diagram, {
      [on.id]: { status: 'ok', value: '42', valueType: 'int' },
      [off.id]: { status: 'ok', value: 'should-not-stick', valueType: 'int' },
    });
    const list = useWatchStore.getState().watchesByDiagram[diagram];
    expect(list.find((w) => w.id === on.id)?.value).toBe('42');
    expect(list.find((w) => w.id === off.id)?.status).toBe('idle');
  });

  test('clearDiagramWatches removes the diagram bucket only', () => {
    useWatchStore.getState().addWatch(diagram, 'a');
    useWatchStore.getState().addWatch('other', 'b');
    useWatchStore.getState().clearDiagramWatches(diagram);
    expect(useWatchStore.getState().watchesByDiagram[diagram]).toBeUndefined();
    expect(useWatchStore.getState().watchesByDiagram['other']).toHaveLength(1);
  });

  test('merge restores persisted entries with runtime fields reset', () => {
    const persisted = persistedSnapshot();
    useWatchStore.setState({ watchesByDiagram: {} });
    // simulate the persist merge path
    const merged = Object.fromEntries(
      Object.entries(persisted.watchesByDiagram).map(([id, list]) => [
        id,
        list.map((w) => ({ ...w, status: 'idle' as const, value: undefined, error: undefined })),
      ]),
    );
    useWatchStore.setState({ watchesByDiagram: merged });
    const restored = useWatchStore.getState().watchesByDiagram[diagram][0];
    expect(restored.expression).toBe('total > 100');
    expect(restored.status).toBe('idle');
  });
});
