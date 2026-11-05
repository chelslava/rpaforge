import { describe, expect, test } from 'vitest';
import { deriveSelectionContract, extractSubDiagram } from './extractSubDiagram';
import type { CanvasEdgeLike, CanvasNodeLike } from './extractSubDiagram';

function startNode(id = 'start'): CanvasNodeLike {
  return {
    id,
    type: 'start',
    position: { x: 0, y: 0 },
    data: { blockData: { id, type: 'start', name: 'Start', label: 'Start' } },
  };
}

function endNode(id = 'end'): CanvasNodeLike {
  return {
    id,
    type: 'end',
    position: { x: 400, y: 0 },
    data: { blockData: { id, type: 'end', name: 'End', label: 'End' } },
  };
}

function activityNode(
  id: string,
  label: string,
  extra: Record<string, unknown> = {}
): CanvasNodeLike {
  return {
    id,
    type: 'activity',
    position: { x: 100, y: 0 },
    data: {
      blockData: {
        id,
        type: 'activity',
        name: label,
        label,
        category: 'flow',
        library: 'Flow',
        activity: 'Log Message',
        args: [label],
        output_variable: '',
        ...extra,
      },
    },
  };
}

function edge(id: string, source: string, target: string): CanvasEdgeLike {
  return { id, source, target };
}

describe('deriveSelectionContract', () => {
  test('outputs come from activity output_variables', () => {
    const contract = deriveSelectionContract([
      activityNode('a', 'A', { output_variable: 'row_count' }),
      activityNode('b', 'B', { output_variable: 'row_count' }),
    ]);
    expect(contract.outputs).toEqual(['row_count']);
  });

  test('unassigned expression identifiers become inputs', () => {
    const contract = deriveSelectionContract([
      activityNode('a', 'A', { output_variable: 'out', expression: 'threshold > 0' }),
    ]);
    expect(contract.inputs).toEqual(['threshold']);
    expect(contract.outputs).toEqual(['out']);
  });

  test('assigned names and keywords are not proposed as inputs', () => {
    const contract = deriveSelectionContract([
      activityNode('a', 'A', { expression: 'True and not False' }),
    ]);
    expect(contract.inputs).toEqual([]);
  });
});

describe('extractSubDiagram', () => {
  test('happy path: selection becomes a sub-diagram with a call node', () => {
    const nodes = [
      startNode(),
      activityNode('a', 'Read'),
      activityNode('b', 'Write'),
      endNode(),
    ];
    const edges = [
      edge('s-a', 'start', 'a'),
      edge('a-b', 'a', 'b'),
      edge('b-e', 'b', 'end'),
    ];
    const result = extractSubDiagram(nodes, edges, ['a', 'b'], 'My Extract', 'd1');

    // Sub document: fresh start + the two selected nodes.
    expect(result.document.diagram.nodes).toHaveLength(3);
    expect(result.document.diagram.nodes[0].id).toBe('sub-start-d1');
    expect(result.document.metadata.name).toBe('My Extract');

    // Internal edge preserved, entry edge created from the fresh start.
    expect(result.document.diagram.edges).toEqual([
      { id: 'sub-start-edge-d1', source: 'sub-start-d1', target: 'a' },
      edge('a-b', 'a', 'b'),
    ]);

    // Call node replaces the selection and carries the contract mapping.
    const blockData = (result.callNode.data as Record<string, unknown>).blockData as Record<string, unknown>;
    expect(blockData.type).toBe('sub-diagram-call');
    expect(blockData.diagramId).toBe('d1');
    expect(blockData.diagramName).toBe('My Extract');

    // Parent rewiring: entry now targets the call node, exit sources from it.
    expect(result.rewiredEdges).toEqual([
      { id: 's-a', source: 'start', target: 'call-d1' },
      { id: 'b-e', source: 'call-d1', target: 'end' },
    ]);
    expect(result.removedNodeIds).toEqual(['a', 'b']);
    expect(result.removedEdgeIds.sort()).toEqual(['a-b', 'b-e', 's-a']);
  });

  test('throws empty-selection', () => {
    expect(() => extractSubDiagram([startNode()], [], [], 'X', 'd1')).toThrow(
      'empty-selection'
    );
  });

  test('boundary-entry selection works without a start in the selection', () => {
    const nodes = [startNode(), activityNode('a', 'A'), endNode()];
    const edges = [edge('s-a', 'start', 'a'), edge('a-e', 'a', 'end')];
    const result = extractSubDiagram(nodes, edges, ['a'], 'X', 'd1');
    expect(result.rewiredEdges.map((e) => e.target)).toContain('call-d1');
  });

  test('throws no-start when the selection has no entry at all', () => {
    const nodes = [startNode(), activityNode('a', 'A'), endNode()];
    const edges = [edge('s-e', 'start', 'end')];
    expect(() => extractSubDiagram(nodes, edges, ['a'], 'X', 'd1')).toThrow('no-start');
  });

  test('start-driven prefix extraction re-sources internal edges', () => {
    const nodes = [startNode(), activityNode('a', 'A'), endNode()];
    const edges = [edge('s-a', 'start', 'a'), edge('a-e', 'a', 'end')];
    const result = extractSubDiagram(nodes, edges, ['start', 'a'], 'X', 'd1');
    const subEdges = result.document.diagram.edges;
    // The selected start's internal edge re-sources from the fresh start.
    expect(subEdges[0]).toEqual({ id: 's-a', source: 'sub-start-d1', target: 'a' });
    // The parent call node inherits the prefix's exit edge.
    expect(result.rewiredEdges).toEqual([{ id: 'a-e', source: 'call-d1', target: 'end' }]);
    expect(result.removedNodeIds).toEqual(['start', 'a']);
  });

  test('throws end-in-selection', () => {
    expect(() =>
      extractSubDiagram([startNode(), endNode()], [edge('s-e', 'start', 'end')], ['start', 'end'], 'X', 'd1')
    ).toThrow('end-in-selection');
  });

  test('throws multiple-entries on several boundary incoming edges', () => {
    const nodes = [
      startNode(),
      activityNode('p1', 'P1'),
      activityNode('p2', 'P2'),
      activityNode('a', 'A'),
      activityNode('b', 'B'),
      endNode(),
    ];
    const edges = [
      edge('s-p1', 'start', 'p1'),
      edge('s-p2', 'start', 'p2'),
      edge('p1-a', 'p1', 'a'),
      edge('p2-b', 'p2', 'b'),
      edge('a-b', 'a', 'b'),
      edge('b-e', 'b', 'end'),
    ];
    expect(() =>
      extractSubDiagram(nodes, edges, ['a', 'b'], 'X', 'd1')
    ).toThrow('multiple-entries');
  });
});
