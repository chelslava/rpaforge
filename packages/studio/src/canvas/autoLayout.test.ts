import { describe, expect, test } from 'vitest';
import type { Edge, Node } from '@xyflow/react';

import { computeAutoLayout } from './autoLayout';

function makeNode(id: string): Node {
  return {
    id,
    position: { x: 0, y: 0 },
    data: {},
    measured: { width: 200, height: 104 },
  };
}

function makeEdge(id: string, source: string, target: string): Edge {
  return { id, source, target };
}

describe('computeAutoLayout', () => {
  test('returns an empty array for an empty canvas', async () => {
    const result = await computeAutoLayout([], []);
    expect(result).toEqual([]);
  });

  test('returns a position for every node, with no NaN/undefined coordinates', async () => {
    const nodes = [makeNode('start'), makeNode('a'), makeNode('b'), makeNode('end')];
    const edges = [
      makeEdge('e1', 'start', 'a'),
      makeEdge('e2', 'start', 'b'),
      makeEdge('e3', 'a', 'end'),
      makeEdge('e4', 'b', 'end'),
    ];

    const result = await computeAutoLayout(nodes, edges);

    expect(result).toHaveLength(nodes.length);
    for (const node of nodes) {
      const positioned = result.find((r) => r.id === node.id);
      expect(positioned).toBeDefined();
      expect(Number.isFinite(positioned?.position.x)).toBe(true);
      expect(Number.isFinite(positioned?.position.y)).toBe(true);
    }
  });

  test('lays out a linear chain top-down: each node sits strictly below its predecessor', async () => {
    const nodes = [makeNode('start'), makeNode('mid'), makeNode('end')];
    const edges = [makeEdge('e1', 'start', 'mid'), makeEdge('e2', 'mid', 'end')];

    const result = await computeAutoLayout(nodes, edges);
    const byId = new Map(result.map((r) => [r.id, r.position]));

    expect(byId.get('start')!.y).toBeLessThan(byId.get('mid')!.y);
    expect(byId.get('mid')!.y).toBeLessThan(byId.get('end')!.y);
  });

  test('places a branch (If-like) so both branches sit in the same layer below the source', async () => {
    const nodes = [makeNode('start'), makeNode('a'), makeNode('b'), makeNode('end')];
    const edges = [
      makeEdge('e1', 'start', 'a'),
      makeEdge('e2', 'start', 'b'),
      makeEdge('e3', 'a', 'end'),
      makeEdge('e4', 'b', 'end'),
    ];

    const result = await computeAutoLayout(nodes, edges);
    const byId = new Map(result.map((r) => [r.id, r.position]));

    expect(byId.get('a')!.y).toBe(byId.get('b')!.y);
    expect(byId.get('a')!.x).not.toBe(byId.get('b')!.x);
    expect(byId.get('start')!.y).toBeLessThan(byId.get('a')!.y);
    expect(byId.get('end')!.y).toBeGreaterThan(byId.get('a')!.y);
  });

  test('handles an isolated node with no edges without throwing', async () => {
    const nodes = [makeNode('lonely')];
    const result = await computeAutoLayout(nodes, []);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('lonely');
  });

  test('falls back to default dimensions when a node has no measured size', async () => {
    const unmeasured: Node = { id: 'n1', position: { x: 0, y: 0 }, data: {} };
    const result = await computeAutoLayout([unmeasured], []);

    expect(result).toHaveLength(1);
    expect(Number.isFinite(result[0].position.x)).toBe(true);
    expect(Number.isFinite(result[0].position.y)).toBe(true);
  });
});
