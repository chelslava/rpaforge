import { describe, expect, test } from 'vitest';
import {
  diffDiagrams,
  edgeStatusMap,
  isDiffEmpty,
  mergeDiagrams,
  nodeStatusMap,
  type DiagramDocLike,
} from './diagramDiff';

function doc(
  nodes: Array<Partial<DiagramDocLike['nodes'][number]> & { id: string }>,
  edges: Array<{ source: string; target: string; id?: string }>,
  extra: Partial<DiagramDocLike> = {}
): DiagramDocLike {
  return {
    metadata: { name: 'Main' },
    nodes: nodes.map((n) => ({
      data: {},
      position: { x: 0, y: 0 },
      ...n,
    })) as DiagramDocLike['nodes'],
    edges: edges.map((e) => {
      const { source, target, id, ...rest } = e;
      return { id: id ?? `${source}->${target}`, source, target, ...rest };
    }) as DiagramDocLike['edges'],
    variables: {},
    ...extra,
  };
}

function activityNode(
  id: string,
  label: string,
  params: Record<string, unknown>,
  x = 0,
  y = 0
): Partial<DiagramDocLike['nodes'][number]> & { id: string } {
  return {
    id,
    data: { type: 'activity', label, params },
    position: { x, y },
  };
}

describe('diffDiagrams', () => {
  test('identical diagrams produce an empty diff', () => {
    const a = doc([activityNode('n1', 'Read', { path: 'a.xlsx' })], []);
    expect(isDiffEmpty(diffDiagrams(a, a))).toBe(true);
  });

  test('param change is reported at params.<key> granularity', () => {
    const base = doc([activityNode('n1', 'Read', { path: 'a.xlsx', sheet: 'S1' })], []);
    const target = doc([activityNode('n1', 'Read', { path: 'b.xlsx', sheet: 'S1' })], []);
    const diff = diffDiagrams(base, target);
    expect(diff.nodeChanges).toHaveLength(1);
    expect(diff.nodeChanges[0].kind).toBe('modified');
    expect(diff.nodeChanges[0].changes).toEqual([
      { field: 'params.path', base: 'a.xlsx', target: 'b.xlsx' },
    ]);
  });

  test('condition change is reported as a data field', () => {
    const base = doc([{ id: 'c1', data: { type: 'if', condition: 'x > 1' } }], []);
    const target = doc([{ id: 'c1', data: { type: 'if', condition: 'x > 2' } }], []);
    const diff = diffDiagrams(base, target);
    expect(diff.nodeChanges[0].changes[0]).toEqual({
      field: 'condition',
      base: 'x > 1',
      target: 'x > 2',
    });
  });

  test('label change is reported per field', () => {
    const base = doc([activityNode('n1', 'Old', {})], []);
    const target = doc([activityNode('n1', 'New', {})], []);
    const diff = diffDiagrams(base, target);
    expect(diff.nodeChanges[0].changes[0]).toEqual({ field: 'label', base: 'Old', target: 'New' });
  });

  test('node insert between existing nodes is detected with an edge-split hint', () => {
    const base = doc(
      [activityNode('a', 'A', {}, 0, 0), activityNode('b', 'B', {}, 200, 0)],
      [{ source: 'a', target: 'b' }]
    );
    const target = doc(
      [
        activityNode('a', 'A', {}, 0, 0),
        activityNode('mid', 'M', {}, 100, 0),
        activityNode('b', 'B', {}, 200, 0),
      ],
      [{ source: 'a', target: 'mid' }, { source: 'mid', target: 'b' }]
    );
    const diff = diffDiagrams(base, target);
    expect(diff.nodeChanges.map((c) => c.kind)).toEqual(['added']);
    expect(diff.nodeChanges[0].nodeId).toBe('mid');
    expect(diff.edgeChanges.map((c) => c.kind).sort()).toEqual(['added', 'added', 'removed']);
    expect(diff.structuralHints).toEqual([
      { kind: 'inserted-between', nodeId: 'mid', neighbors: ['a', 'b'] },
    ]);
  });

  test('node delete with edge rejoin is detected', () => {
    const base = doc(
      [
        activityNode('a', 'A', {}, 0, 0),
        activityNode('mid', 'M', {}, 100, 0),
        activityNode('b', 'B', {}, 200, 0),
      ],
      [{ source: 'a', target: 'mid' }, { source: 'mid', target: 'b' }]
    );
    const target = doc(
      [activityNode('a', 'A', {}, 0, 0), activityNode('b', 'B', {}, 200, 0)],
      [{ source: 'a', target: 'b' }]
    );
    const diff = diffDiagrams(base, target);
    expect(diff.nodeChanges.map((c) => c.kind)).toEqual(['removed']);
    expect(diff.structuralHints).toEqual([
      { kind: 'removed-rejoin', nodeId: 'mid', neighbors: ['a', 'b'] },
    ]);
  });

  test('sub-diagram rename is surfaced as a reference change', () => {
    const base = doc(
      [{ id: 's1', data: { type: 'sub-diagram-call', diagramId: 'd1', diagramName: 'Invoices' } }],
      []
    );
    const target = doc(
      [{ id: 's1', data: { type: 'sub-diagram-call', diagramId: 'd2', diagramName: 'Invoices v2' } }],
      []
    );
    const diff = diffDiagrams(base, target);
    expect(diff.subDiagramChanges).toEqual([
      { nodeId: 's1', field: 'diagramId', base: 'd1', target: 'd2' },
      { nodeId: 's1', field: 'diagramName', base: 'Invoices', target: 'Invoices v2' },
    ]);
  });

  test('position-only change is reported as a move, not a modification', () => {
    const base = doc([activityNode('n1', 'Read', { p: 1 }, 0, 0)], []);
    const target = doc([activityNode('n1', 'Read', { p: 1 }, 120, 40)], []);
    const diff = diffDiagrams(base, target);
    expect(diff.nodeChanges[0].kind).toBe('moved');
    expect(diff.nodeChanges[0].from).toEqual({ x: 0, y: 0 });
    expect(diff.nodeChanges[0].to).toEqual({ x: 120, y: 40 });
  });

  test('metadata and variables diff at key granularity', () => {
    const base = doc([], [], {
      variables: [
        { id: 'v1', name: 'v1', defaultValue: 'a' },
        { id: 'v2', name: 'v2', defaultValue: 'keep' },
      ],
    });
    const target = doc(
      [],
      [],
      {
        metadata: { name: 'Renamed' },
        variables: [
          { id: 'v1', name: 'v1', defaultValue: 'b' },
          { id: 'v2', name: 'v2', defaultValue: 'keep' },
          { id: 'v3', name: 'v3', defaultValue: 'new' },
        ],
      }
    );
    const diff = diffDiagrams(base, target);
    expect(diff.metadataChanges).toEqual([{ field: 'name', base: 'Main', target: 'Renamed' }]);
    expect(diff.variableChanges.map((c) => c.field).sort()).toEqual(['v1', 'v3']);
  });

  test('status maps drive canvas colorization', () => {
    const base = doc([activityNode('n1', 'A', {}), activityNode('n2', 'B', {})], [
      { source: 'n1', target: 'n2' },
    ]);
    const target = doc([activityNode('n1', 'A', { p: 2 }), activityNode('n3', 'C', {})], [
      { source: 'n1', target: 'n3' },
    ]);
    const diff = diffDiagrams(base, target);
    const nodes = nodeStatusMap(diff);
    expect(nodes.get('n1')).toBe('modified');
    expect(nodes.get('n2')).toBe('removed');
    expect(nodes.get('n3')).toBe('added');
    const edges = edgeStatusMap(diff);
    expect(edges.get('n1->n2')).toBe('removed');
    expect(edges.get('n1->n3')).toBe('added');
  });
});

describe('mergeDiagrams', () => {
  test('non-overlapping changes from both sides merge automatically', () => {
    const base = doc(
      [activityNode('n1', 'Read', { path: 'a' }), activityNode('n2', 'Write', { path: 'b' })],
      [{ source: 'n1', target: 'n2' }]
    );
    const ours = doc(
      [
        activityNode('n1', 'Read', { path: 'ours.xlsx' }),
        activityNode('n2', 'Write', { path: 'b' }),
      ],
      [{ source: 'n1', target: 'n2' }]
    );
    const theirs = doc(
      [
        activityNode('n1', 'Read', { path: 'a' }),
        activityNode('n2', 'Write', { path: 'theirs.xlsx' }),
        activityNode('n3', 'Log', {}, 300, 0),
      ],
      [{ source: 'n1', target: 'n2' }, { source: 'n2', target: 'n3' }]
    );
    const { merged, conflicts } = mergeDiagrams(base, ours, theirs);
    expect(conflicts).toEqual([]);
    const byId = Object.fromEntries(merged.nodes.map((n) => [n.id, n]));
    expect((byId.n1.data as Record<string, unknown>).params).toEqual({ path: 'ours.xlsx' });
    expect((byId.n2.data as Record<string, unknown>).params).toEqual({ path: 'theirs.xlsx' });
    expect(merged.nodes.some((n) => n.id === 'n3')).toBe(true);
    expect(merged.edges.some((e) => e.source === 'n2' && e.target === 'n3')).toBe(true);
  });

  test('diverging field edits produce a conflict resolvable to either side', () => {
    const base = doc([activityNode('n1', 'Read', { path: 'a' })], []);
    const ours = doc([activityNode('n1', 'Read', { path: 'ours' })], []);
    const theirs = doc([activityNode('n1', 'Read', { path: 'theirs' })], []);
    const conflicted = mergeDiagrams(base, ours, theirs);
    expect(conflicted.conflicts).toHaveLength(1);
    expect(conflicted.conflicts[0].kind).toBe('node-field');
    expect(conflicted.conflicts[0].field).toBe('params.path');
    const resolvedTheirs = mergeDiagrams(base, ours, theirs, {
      [conflicted.conflicts[0].key]: 'theirs',
    });
    const data = resolvedTheirs.merged.nodes[0].data as Record<string, unknown>;
    expect((data.params as Record<string, unknown>).path).toBe('theirs');
    // Conflicts describe the divergence and stay listed; the resolution
    // only changes which side's value lands in the merged document.
    expect(resolvedTheirs.conflicts).toHaveLength(1);
  });

  test('node added on both sides with different payloads conflicts per node', () => {
    const base = doc([activityNode('n1', 'A', {})], []);
    const ours = doc([activityNode('n1', 'A', {}), activityNode('x', 'Ours node', { v: 1 }, 0, 100)], []);
    const theirs = doc([activityNode('n1', 'A', {}), activityNode('x', 'Theirs node', { v: 2 }, 0, 100)], []);
    const { conflicts, merged } = mergeDiagrams(base, ours, theirs);
    expect(conflicts.map((c) => c.kind)).toEqual(['node-add']);
    const added = merged.nodes.find((n) => n.id === 'x');
    expect((added?.data as Record<string, unknown> | undefined)?.label).toBe('Ours node');
    const resolved = mergeDiagrams(base, ours, theirs, { [conflicts[0].key]: 'theirs' });
    expect(
      (resolved.merged.nodes.find((n) => n.id === 'x')?.data as Record<string, unknown> | undefined)?.label
    ).toBe('Theirs node');
    expect(resolved.conflicts).toHaveLength(1);
  });

  test('delete-vs-modify conflicts and respects the resolution', () => {
    const mk = (label: string) =>
      doc([activityNode('n1', label, {}), activityNode('n2', 'B', {})], [
        { source: 'n1', target: 'n2' },
      ]);
    const base = mk('Old');
    const ours = doc([activityNode('n2', 'B', {})], []); // deleted n1
    const theirs = mk('New'); // modified n1 label
    const { conflicts, merged } = mergeDiagrams(base, ours, theirs);
    expect(conflicts.map((c) => c.kind)).toEqual(['node-delete']);
    // Default resolution (ours): deletion wins.
    expect(merged.nodes.some((n) => n.id === 'n1')).toBe(false);
    const keep = mergeDiagrams(base, ours, theirs, { [conflicts[0].key]: 'theirs' });
    const kept = keep.merged.nodes.find((n) => n.id === 'n1');
    expect((kept?.data as Record<string, unknown> | undefined)?.label).toBe('New');
  });

  test('edge conflicts resolve per edge', () => {
    // Topology-keyed edges can only diverge when both sides keep the same
    // endpoints but change edge attributes (e.g. the source handle).
    const nodes = [activityNode('n1', 'A', {}), activityNode('n2', 'B', {})];
    const edge = (handle: string) => [{ source: 'n1', target: 'n2', id: 'n1->n2', handle }];
    const base = doc(nodes, edge('a'));
    const ours = doc(nodes, edge('b'));
    const theirs = doc(nodes, edge('c'));
    const { conflicts, merged } = mergeDiagrams(base, ours, theirs);
    expect(conflicts.map((c) => c.kind)).toEqual(['edge']);
    // Default ours keeps our handle.
    expect(merged.edges[0].handle).toBe('b');
    const resolved = mergeDiagrams(base, ours, theirs, { [conflicts[0].key]: 'theirs' });
    expect(resolved.merged.edges[0].handle).toBe('c');
  });

  test('metadata and variable divergences are surfaced and resolvable', () => {
    const vars = (v: number) => [{ id: 'v', name: 'v', defaultValue: v }];
    const base = doc([], [], { metadata: { name: 'Main' }, variables: vars(1) });
    const ours = doc([], [], { metadata: { name: 'Ours' }, variables: vars(2) });
    const theirs = doc([], [], { metadata: { name: 'Theirs' }, variables: vars(3) });
    const { conflicts } = mergeDiagrams(base, ours, theirs);
    expect(conflicts.map((c) => c.kind).sort()).toEqual(['metadata', 'variable']);
    const resolved = mergeDiagrams(base, ours, theirs, {
      [conflicts[0].key]: 'theirs',
      [conflicts[1].key]: 'theirs',
    });
    expect(resolved.merged.metadata?.name).toBe('Theirs');
    expect(resolved.merged.variables).toEqual([vars(3)[0]]);
  });

  test('round-trip: resolved conflict fixture serializes to a valid diagram', async () => {
    const metadata = (name: string) => ({
      id: 'proc-1',
      name,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    const base: DiagramDocLike = {
      version: '1.1.0',
      exportedAt: '2026-01-01T00:00:00.000Z',
      metadata: metadata('Main'),
      nodes: [
        activityNode('n1', 'Read', { path: 'a.xlsx' }, 0, 0),
        activityNode('n2', 'Write', { path: 'b.xlsx' }, 200, 0),
      ],
      edges: [{ id: 'n1->n2', source: 'n1', target: 'n2' }],
      variables: [{ id: 'v-out', name: 'outPath', defaultValue: 'b.xlsx' }],
    };
    const ours: DiagramDocLike = {
      ...base,
      metadata: metadata('Ours rename'),
      nodes: [activityNode('n1', 'Read', { path: 'ours.xlsx' }, 0, 0), base.nodes[1]],
    };
    const theirs: DiagramDocLike = {
      ...base,
      metadata: metadata('Theirs rename'),
      nodes: [activityNode('n1', 'Read', { path: 'theirs.xlsx' }, 0, 0), base.nodes[1]],
    };
    const { conflicts } = mergeDiagrams(base, ours, theirs);
    expect(conflicts.map((c) => c.kind)).toEqual(['node-field', 'metadata']);
    const resolved = mergeDiagrams(base, ours, theirs, {
      [conflicts[0].key]: 'ours',
      [conflicts[1].key]: 'theirs',
    });
    // Serialize through the real exporter shape and re-validate with the
    // real import path (schema validation + migration machinery).
    const serialized = JSON.stringify(
      {
        version: '1.1.0',
        exportedAt: '2026-01-01T00:00:00.000Z',
        metadata: resolved.merged.metadata,
        nodes: resolved.merged.nodes,
        edges: resolved.merged.edges,
        variables: resolved.merged.variables,
      },
      null,
      2
    );
    const { deserializeDiagram } = await import('./fileUtils');
    const result = deserializeDiagram(serialized);
    expect(result.success).toBe(true);
    expect(result.diagram?.nodes).toHaveLength(2);
    expect((result.diagram?.nodes[0].data as Record<string, unknown> | undefined)?.params).toEqual({
      path: 'ours.xlsx',
    });
    expect(result.diagram?.metadata.name).toBe('Theirs rename');
  });
});
