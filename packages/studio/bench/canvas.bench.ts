/**
 * Canvas performance benchmarks (issue #830).
 *
 * Measures the two canvas pipelines that scale with diagram size and drive
 * perceived smoothness: ELK auto-layout (initial placement after import/AI
 * generation) and blockStore bulk/positional updates (drag transactions on
 * a large canvas). Node counts 250/500/1000 mirror the issue's regression
 * guard. All benches use deterministic synthetic chains, so means are
 * comparable across runs.
 *
 * Vitest 5 API: benchmarks are fixtures inside regular `test()` calls
 * (`await bench(name, fn).run()`); this file runs only through the
 * dedicated bench config (`pnpm bench`), never in the unit-test run.
 */

import { test } from 'vitest';
import type { Edge } from '@xyflow/react';
import { computeAutoLayout } from '../src/canvas/loadAutoLayout';
import { useBlockStore, type ProcessNode, type ProcessNodeData } from '../src/stores/blockStore';

const SIZES = [250, 500, 1000] as const;

function makeChainNodes(count: number): ProcessNode[] {
  const nodes: ProcessNode[] = [];
  for (let i = 0; i < count; i++) {
    nodes.push({
      id: `n${i}`,
      type: 'activity',
      position: { x: (i % 10) * 240, y: Math.floor(i / 10) * 120 },
      data: { description: `bench node ${i}`, tags: [] } as ProcessNodeData,
    });
  }
  return nodes;
}

function makeChainEdges(count: number): Edge[] {
  const edges: Edge[] = [];
  for (let i = 1; i < count; i++) {
    edges.push({ id: `e${i}`, source: `n${i - 1}`, target: `n${i}` });
  }
  return edges;
}

const resetStore = () => {
  const state = useBlockStore.getState();
  state.setNodes([]);
  state.setEdges([]);
};

const nodes250 = makeChainNodes(250);
const edges250 = makeChainEdges(250);
const nodes500 = makeChainNodes(500);
const edges500 = makeChainEdges(500);
const nodes1000 = makeChainNodes(1000);
const edges1000 = makeChainEdges(1000);

test(
  'elk layout 250 nodes',
  { timeout: 120_000 },
  async ({ bench }) => {
    await bench('layout 250 nodes', async () => {
      await computeAutoLayout(nodes250, edges250);
    }).run();
  },
);

test(
  'elk layout 500 nodes',
  { timeout: 120_000 },
  async ({ bench }) => {
    await bench('layout 500 nodes', async () => {
      await computeAutoLayout(nodes500, edges500);
    }).run();
  },
);

test(
  'elk layout 1000 nodes',
  { timeout: 120_000 },
  async ({ bench }) => {
    await bench('layout 1000 nodes', async () => {
      await computeAutoLayout(nodes1000, edges1000);
    }).run();
  },
);

test(
  'setNodes 1000 (bulk load)',
  { timeout: 120_000 },
  async ({ bench }) => {
    await bench('setNodes 1000', () => {
      useBlockStore.getState().setNodes(nodes1000);
      resetStore();
    }).run();
  },
);

test(
  'updateNodePosition x100 on 1000 nodes (drag burst)',
  { timeout: 120_000 },
  async ({ bench }) => {
    await bench('updateNodePosition x100 on 1000 nodes', () => {
      const state = useBlockStore.getState();
      state.setNodes(nodes1000);
      for (let i = 0; i < 100; i++) {
        state.updateNodePosition(`n${i * 7}`, { x: i, y: i * 2 });
      }
      resetStore();
    }).run();
  },
);
