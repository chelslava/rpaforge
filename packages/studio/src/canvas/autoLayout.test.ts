import { describe, expect, test } from 'vitest';
import type { Edge, Node } from '@xyflow/react';

import { computeAutoLayout } from './autoLayout';
import {
  createDefaultBlockData,
  type BlockData,
  type BlockType,
  type ParallelBlockData,
  type SwitchBlockData,
  type TryCatchBlockData,
} from '../types/blocks';
import type { ProcessNodeData } from '../stores/blockStore';

function makeNode(id: string): Node<ProcessNodeData> {
  return {
    id,
    position: { x: 0, y: 0 },
    data: {},
    measured: { width: 200, height: 104 },
  };
}

function makeBlockNode(id: string, blockData: BlockData): Node<ProcessNodeData> {
  return {
    id,
    position: { x: 0, y: 0 },
    data: { blockData },
    measured: { width: 200, height: 104 },
  };
}

function makeEdge(
  id: string,
  source: string,
  target: string,
  sourceHandle?: string,
  targetHandle?: string
): Edge {
  return { id, source, target, sourceHandle, targetHandle };
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
    const unmeasured: Node<ProcessNodeData> = { id: 'n1', position: { x: 0, y: 0 }, data: {} };
    const result = await computeAutoLayout([unmeasured], []);

    expect(result).toHaveLength(1);
    expect(Number.isFinite(result[0].position.x)).toBe(true);
    expect(Number.isFinite(result[0].position.y)).toBe(true);
  });

  test('nodes without blockData fall back to plain node-to-node edges (no ports)', async () => {
    const nodes = [makeNode('start'), makeNode('a'), makeNode('b')];
    const edges = [makeEdge('e1', 'start', 'a'), makeEdge('e2', 'start', 'b')];

    const result = await computeAutoLayout(nodes, edges);

    expect(result).toHaveLength(3);
    for (const node of nodes) {
      const positioned = result.find((r) => r.id === node.id);
      expect(Number.isFinite(positioned?.position.x)).toBe(true);
      expect(Number.isFinite(positioned?.position.y)).toBe(true);
    }
  });

  describe('port-aware branch ordering', () => {
    test('If: true branch lays out left of false branch', async () => {
      const nodes = [
        makeBlockNode('start', createDefaultBlockData('if', 'start')),
        makeBlockNode('a', createDefaultBlockData('activity', 'a')),
        makeBlockNode('b', createDefaultBlockData('activity', 'b')),
      ];
      const edges = [makeEdge('e1', 'start', 'a', 'true'), makeEdge('e2', 'start', 'b', 'false')];

      const result = await computeAutoLayout(nodes, edges);
      const byId = new Map(result.map((r) => [r.id, r.position]));

      expect(byId.get('a')!.x).toBeLessThan(byId.get('b')!.x);
    });

    test('Switch: dynamic cases lay out left-to-right in declared order, default last', async () => {
      const switchData: BlockData = {
        ...(createDefaultBlockData('switch', 'sw') as SwitchBlockData),
        cases: [
          { id: 'case-1', value: '1', label: 'One' },
          { id: 'case-2', value: '2', label: 'Two' },
          { id: 'case-3', value: '3', label: 'Three' },
        ],
      };

      const nodes = [
        makeBlockNode('sw', switchData),
        makeBlockNode('n1', createDefaultBlockData('activity', 'n1')),
        makeBlockNode('n2', createDefaultBlockData('activity', 'n2')),
        makeBlockNode('n3', createDefaultBlockData('activity', 'n3')),
        makeBlockNode('def', createDefaultBlockData('activity', 'def')),
      ];
      const edges = [
        makeEdge('e1', 'sw', 'n1', 'case-1'),
        makeEdge('e2', 'sw', 'n2', 'case-2'),
        makeEdge('e3', 'sw', 'n3', 'case-3'),
        makeEdge('e4', 'sw', 'def', 'default'),
      ];

      const result = await computeAutoLayout(nodes, edges);
      const byId = new Map(result.map((r) => [r.id, r.position]));

      expect(byId.get('n1')!.x).toBeLessThan(byId.get('n2')!.x);
      expect(byId.get('n2')!.x).toBeLessThan(byId.get('n3')!.x);
      expect(byId.get('n3')!.x).toBeLessThan(byId.get('def')!.x);
    });

    test('Try-catch: success branch lays out left of error branch', async () => {
      const nodes = [
        makeBlockNode('tc', createDefaultBlockData('try-catch', 'tc')),
        makeBlockNode('ok', createDefaultBlockData('activity', 'ok')),
        makeBlockNode('err', createDefaultBlockData('activity', 'err')),
      ];
      const edges = [makeEdge('e1', 'tc', 'ok', 'output'), makeEdge('e2', 'tc', 'err', 'error')];

      const result = await computeAutoLayout(nodes, edges);
      const byId = new Map(result.map((r) => [r.id, r.position]));

      expect(byId.get('ok')!.x).toBeLessThan(byId.get('err')!.x);
    });

    test('Try-catch with multiple except blocks and a finally block lays out output, except*, finally left-to-right', async () => {
      const tryCatchData: BlockData = {
        ...(createDefaultBlockData('try-catch', 'tc') as TryCatchBlockData),
        exceptBlocks: [
          { id: 'except-1', exceptionType: 'ValueError' },
          { id: 'except-2', exceptionType: 'IOError' },
        ],
        finallyBlock: ['cleanup'],
      };

      const nodes = [
        makeBlockNode('tc', tryCatchData),
        makeBlockNode('ok', createDefaultBlockData('activity', 'ok')),
        makeBlockNode('e1', createDefaultBlockData('activity', 'e1')),
        makeBlockNode('e2', createDefaultBlockData('activity', 'e2')),
        makeBlockNode('fin', createDefaultBlockData('activity', 'fin')),
      ];
      const edges = [
        makeEdge('a1', 'tc', 'ok', 'output'),
        makeEdge('a2', 'tc', 'e1', 'except-1'),
        makeEdge('a3', 'tc', 'e2', 'except-2'),
        makeEdge('a4', 'tc', 'fin', 'finally'),
      ];

      const result = await computeAutoLayout(nodes, edges);
      const byId = new Map(result.map((r) => [r.id, r.position]));

      expect(byId.get('ok')!.x).toBeLessThan(byId.get('e1')!.x);
      expect(byId.get('e1')!.x).toBeLessThan(byId.get('e2')!.x);
      expect(byId.get('e2')!.x).toBeLessThan(byId.get('fin')!.x);
    });

    test('Parallel: branches lay out left-to-right in declared order', async () => {
      const parallelData: BlockData = {
        ...(createDefaultBlockData('parallel', 'p') as ParallelBlockData),
        branches: [
          { id: 'left-branch', name: 'Left', activities: [] },
          { id: 'right-branch', name: 'Right', activities: [] },
        ],
      };

      const nodes = [
        makeBlockNode('p', parallelData),
        makeBlockNode('l', createDefaultBlockData('activity', 'l')),
        makeBlockNode('r', createDefaultBlockData('activity', 'r')),
      ];
      const edges = [
        makeEdge('e1', 'p', 'l', 'left-branch'),
        makeEdge('e2', 'p', 'r', 'right-branch'),
      ];

      const result = await computeAutoLayout(nodes, edges);
      const byId = new Map(result.map((r) => [r.id, r.position]));

      expect(byId.get('l')!.x).toBeLessThan(byId.get('r')!.x);
    });
  });

  describe('loop back-edges (while/for-each)', () => {
    test.each<BlockType>(['while', 'for-each'])(
      '%s: body sits below the loop node despite the back-edge, left of the exit branch',
      async (type) => {
        const nodes = [
          makeBlockNode('loop', createDefaultBlockData(type, 'loop')),
          makeBlockNode('loopBody', createDefaultBlockData('activity', 'loopBody')),
          makeBlockNode('loopExit', createDefaultBlockData('activity', 'loopExit')),
        ];
        // Mirrors the real shape from templates/index.ts: loop --body--> body,
        // body --(back-edge, no handle)--> loop, loop --next--> exit.
        const edges = [
          makeEdge('e1', 'loop', 'loopBody', 'body'),
          makeEdge('e2', 'loopBody', 'loop'),
          makeEdge('e3', 'loop', 'loopExit', 'next'),
        ];

        const result = await computeAutoLayout(nodes, edges);
        const byId = new Map(result.map((r) => [r.id, r.position]));

        expect(Number.isFinite(byId.get('loopBody')!.x)).toBe(true);
        expect(Number.isFinite(byId.get('loopBody')!.y)).toBe(true);
        expect(byId.get('loopBody')!.y).toBeGreaterThan(byId.get('loop')!.y);
        expect(byId.get('loopExit')!.y).toBeGreaterThan(byId.get('loop')!.y);
        expect(byId.get('loopBody')!.x).toBeLessThan(byId.get('loopExit')!.x);
      }
    );
  });
});
