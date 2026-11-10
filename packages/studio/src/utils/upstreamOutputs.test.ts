import { describe, expect, test } from 'vitest';
import type { Edge } from '@xyflow/react';

import { computeUpstreamOutputs, getDeclaredOutputVariable } from './upstreamOutputs';
import type { ProcessNode, ProcessNodeData } from '../stores/blockStore';

function node(
  id: string,
  outputVariable?: string,
  extra?: Record<string, unknown>,
): ProcessNode {
  return {
    id,
    position: { x: 0, y: 0 },
    data: {
      outputVariable,
      ...extra,
    } as unknown as ProcessNodeData,
  };
}

function chain(...ids: string[]): Edge[] {
  return ids.slice(0, -1).map((source, index) => ({
    id: `e-${source}-${ids[index + 1]}`,
    source,
    target: ids[index + 1],
  }));
}

describe('computeUpstreamOutputs', () => {
  test('linear chain lists nearest-first outputs', () => {
    const nodes = [
      node('a', 'raw_data', { activity: { name: 'Fetch' } }),
      node('b', 'filtered', { activity: { name: 'Filter' } }),
      node('c', 'result', { activity: { name: 'Save' } }),
      node('d'),
    ];
    const edges = chain('a', 'b', 'c', 'd');
    const model = computeUpstreamOutputs(nodes, edges, 'd');
    expect(model.outputs.map((o) => o.name)).toEqual(['result', 'filtered', 'raw_data']);
    expect(model.outputs[0]).toMatchObject({ nodeId: 'c', distance: 1, nodeLabel: 'Save' });
    expect(model.outputs[2].distance).toBe(3);
    expect(model.downstreamNames.size).toBe(0);
  });

  test('node itself is not its own upstream', () => {
    const nodes = [node('a', 'x'), node('b', 'y')];
    const edges = chain('a', 'b');
    const model = computeUpstreamOutputs(nodes, edges, 'b');
    expect(model.outputs.map((o) => o.name)).toEqual(['x']);
  });

  test('sibling-branch outputs are downstream, not upstream', () => {
    // a -> b -> d, a -> c -> e: from b, c's output is not reachable.
    const nodes = [
      node('a', 'shared'),
      node('b', 'branch_b'),
      node('c', 'branch_c'),
      node('d'),
      node('e'),
    ];
    const edges = [...chain('a', 'b', 'd'), ...chain('a', 'c', 'e')];
    const modelB = computeUpstreamOutputs(nodes, edges, 'b');
    expect(modelB.outputs.map((o) => o.name)).toEqual(['shared']);
    expect(modelB.downstreamNames).toEqual(new Set(['branch_c']));

    // At the merge node d both branches converge — both are upstream.
    const mergeNodes = [node('a', 'shared'), node('b', 'branch_b'), node('c', 'branch_c'), node('d')];
    const modelD = computeUpstreamOutputs(mergeNodes, [...chain('a', 'b', 'd'), ...chain('a', 'c', 'd')], 'd');
    expect(modelD.outputs.map((o) => o.name).sort()).toEqual(['branch_b', 'branch_c', 'shared']);
    expect(modelD.downstreamNames.size).toBe(0);
  });

  test('duplicate output names keep the nearest declaration', () => {
    const nodes = [node('a', 'result'), node('b', 'result'), node('c')];
    const model = computeUpstreamOutputs(nodes, chain('a', 'b', 'c'), 'c');
    expect(model.outputs).toHaveLength(1);
    expect(model.outputs[0].nodeId).toBe('b');
  });

  test('sub-diagram-call is a boundary: output included, walk stops', () => {
    const nodes = [
      node('before', 'before_var'),
      node('call', 'call_result', { blockData: { type: 'sub-diagram-call' } }),
      node('consumer'),
    ];
    const model = computeUpstreamOutputs(nodes, chain('before', 'call', 'consumer'), 'consumer');
    expect(model.outputs.map((o) => o.name)).toEqual(['call_result']);
    // beyond the boundary → downstream
    expect(model.downstreamNames).toEqual(new Set(['before_var']));
  });

  test('if/while body scope: container is upstream, outside sibling is not', () => {
    // entry -> if -> body1 -> body2 -> merge; entry -> else1 -> merge
    const nodes = [
      node('entry', 'entry_out'),
      node('ifc', undefined, { blockData: { type: 'if' } }),
      node('body1', 'body_out'),
      node('body2', 'body2_out'),
      node('else1', 'else_out'),
      node('merge'),
    ];
    const edges = [
      ...chain('entry', 'ifc', 'body1', 'body2', 'merge'),
      ...chain('entry', 'else1', 'merge'),
    ];
    const model = computeUpstreamOutputs(nodes, edges, 'body2');
    expect(model.outputs.map((o) => o.name)).toEqual(['body_out', 'entry_out']);
    expect(model.downstreamNames.has('else_out')).toBe(true);
  });

  test('empty inputs and missing node are safe', () => {
    expect(computeUpstreamOutputs([], [], null)).toEqual({ outputs: [], downstreamNames: new Set() });
    expect(computeUpstreamOutputs([node('a', 'x')], [], 'missing').outputs).toEqual([]);
    const model = computeUpstreamOutputs([node('a', 'x')], [], 'a');
    expect(model.outputs).toEqual([]);
    // The node itself is neither upstream nor downstream of itself.
    expect(model.downstreamNames.size).toBe(0);
  });

  test('blockData.output_variable (approval/agentic) is discovered', () => {
    const nodes = [
      node('ap', undefined, {
        blockData: { type: 'approval', question: '?', output_variable: 'approved' },
      }),
      node('agentic', undefined, {
        blockData: { type: 'agentic-loop', goal: 'g', allowed_activities: [], output_variable: 'agent_out' },
      }),
      node('c'),
    ];
    const model = computeUpstreamOutputs(nodes, chain('ap', 'agentic', 'c'), 'c');
    expect(model.outputs.map((o) => o.name)).toEqual(['agent_out', 'approved']);
    expect(model.outputs[1].nodeLabel).toBe('approval');
  });
});

describe('getDeclaredOutputVariable', () => {
  test('prefers direct outputVariable over blockData', () => {
    expect(getDeclaredOutputVariable({ outputVariable: 'direct' })).toBe('direct');
    expect(
      getDeclaredOutputVariable({
        outputVariable: '  ',
        blockData: { type: 'approval', question: '', output_variable: 'nested' },
      } as never),
    ).toBe('nested');
    expect(getDeclaredOutputVariable({})).toBe('');
  });
});
