import { describe, it, expect } from 'vitest';
import { buildGraph, findReachableDistances, findCommonMergeNode } from './graph';

describe('buildGraph', () => {
  it('creates empty graph for empty edges array', () => {
    const result = buildGraph([]);
    expect(result).toBeInstanceOf(Map);
    expect(result.size).toBe(0);
  });

  it('creates graph with single edge', () => {
    const edges = [
      { id: 'e1', source: 'A', target: 'B', handle: 'output' },
    ];
    const result = buildGraph(edges);
    expect(result.size).toBe(1);
    expect(result.get('A')).toHaveLength(1);
    expect(result.get('A')?.[0]).toEqual({ target: 'B', handle: 'output' });
  });

  it('handles edges without handle (undefined)', () => {
    const edges = [
      { id: 'e1', source: 'A', target: 'B', handle: undefined },
    ];
    const result = buildGraph(edges);
    expect(result.get('A')?.[0]).toEqual({ target: 'B', handle: undefined });
  });

  it('handles edges without handle (null)', () => {
    const edges = [
      { id: 'e1', source: 'A', target: 'B', handle: null },
    ];
    const result = buildGraph(edges);
    expect(result.get('A')?.[0]).toEqual({ target: 'B', handle: null });
  });

  it('handles multiple edges from same source', () => {
    const edges = [
      { id: 'e1', source: 'A', target: 'B', handle: 'out1' },
      { id: 'e2', source: 'A', target: 'C', handle: 'out2' },
      { id: 'e3', source: 'A', target: 'D', handle: 'out3' },
    ];
    const result = buildGraph(edges);
    expect(result.get('A')).toHaveLength(3);
    expect(result.get('A')?.[0]).toEqual({ target: 'B', handle: 'out1' });
    expect(result.get('A')?.[1]).toEqual({ target: 'C', handle: 'out2' });
    expect(result.get('A')?.[2]).toEqual({ target: 'D', handle: 'out3' });
  });

  it('creates separate entries for different sources', () => {
    const edges = [
      { id: 'e1', source: 'A', target: 'B' },
      { id: 'e2', source: 'C', target: 'D' },
    ];
    const result = buildGraph(edges);
    expect(result.size).toBe(2);
    expect(result.get('A')).toHaveLength(1);
    expect(result.get('C')).toHaveLength(1);
  });

  it('builds complete chain graph', () => {
    const edges = [
      { id: 'e1', source: 'A', target: 'B' },
      { id: 'e2', source: 'B', target: 'C' },
      { id: 'e3', source: 'C', target: 'D' },
    ];
    const result = buildGraph(edges);
    expect(result.size).toBe(3);
    expect(result.get('A')?.[0]).toEqual({ target: 'B', handle: undefined });
    expect(result.get('B')?.[0]).toEqual({ target: 'C', handle: undefined });
    expect(result.get('C')?.[0]).toEqual({ target: 'D', handle: undefined });
  });

  it('handles diamond pattern', () => {
    const edges = [
      { id: 'e1', source: 'A', target: 'B' },
      { id: 'e2', source: 'A', target: 'C' },
      { id: 'e3', source: 'B', target: 'D' },
      { id: 'e4', source: 'C', target: 'D' },
    ];
    const result = buildGraph(edges);
    expect(result.size).toBe(3);
    expect(result.get('A')).toHaveLength(2);
    expect(result.get('B')).toHaveLength(1);
    expect(result.get('C')).toHaveLength(1);
    expect(result.get('D')).toBeUndefined();
  });
});

describe('findReachableDistances', () => {
  it('returns map with only start node for unreachable target', () => {
    const graph = buildGraph([
      { id: 'e1', source: 'A', target: 'B' },
    ]);
    const result = findReachableDistances('Z', graph);
    expect(result.size).toBe(1);
    expect(result.get('Z')).toBe(0);
  });

  it('returns start node with distance 0', () => {
    const graph = buildGraph([
      { id: 'e1', source: 'A', target: 'B' },
    ]);
    const result = findReachableDistances('A', graph);
    expect(result.get('A')).toBe(0);
  });

  it('finds distances in linear chain', () => {
    const edges = [
      { id: 'e1', source: 'A', target: 'B' },
      { id: 'e2', source: 'B', target: 'C' },
      { id: 'e3', source: 'C', target: 'D' },
    ];
    const graph = buildGraph(edges);
    const result = findReachableDistances('A', graph);
    expect(result.get('A')).toBe(0);
    expect(result.get('B')).toBe(1);
    expect(result.get('C')).toBe(2);
    expect(result.get('D')).toBe(3);
  });

  it('handles diamond pattern with equal distances', () => {
    const edges = [
      { id: 'e1', source: 'A', target: 'B' },
      { id: 'e2', source: 'A', target: 'C' },
      { id: 'e3', source: 'B', target: 'D' },
      { id: 'e4', source: 'C', target: 'D' },
    ];
    const graph = buildGraph(edges);
    const result = findReachableDistances('A', graph);
    expect(result.get('A')).toBe(0);
    expect(result.get('B')).toBe(1);
    expect(result.get('C')).toBe(1);
    expect(result.get('D')).toBe(2);
  });

  it('handles cycles correctly', () => {
    const edges = [
      { id: 'e1', source: 'A', target: 'B' },
      { id: 'e2', source: 'B', target: 'C' },
      { id: 'e3', source: 'C', target: 'A' },
    ];
    const graph = buildGraph(edges);
    const result = findReachableDistances('A', graph);
    expect(result.get('A')).toBe(0);
    expect(result.get('B')).toBe(1);
    expect(result.get('C')).toBe(2);
  });

  it('handles self-loop node', () => {
    const edges = [
      { id: 'e1', source: 'A', target: 'A' },
    ];
    const graph = buildGraph(edges);
    const result = findReachableDistances('A', graph);
    expect(result.size).toBe(1);
    expect(result.get('A')).toBe(0);
  });

  it('finds all nodes in disconnected graph', () => {
    const edges = [
      { id: 'e1', source: 'A', target: 'B' },
      { id: 'e2', source: 'C', target: 'D' },
    ];
    const graph = buildGraph(edges);
    const result = findReachableDistances('A', graph);
    expect(result.size).toBe(2);
    expect(result.get('A')).toBe(0);
    expect(result.get('B')).toBe(1);
  });

  it('ignores unreachable nodes in disconnected subgraph', () => {
    const edges = [
      { id: 'e1', source: 'A', target: 'B' },
      { id: 'e2', source: 'C', target: 'D' },
    ];
    const graph = buildGraph(edges);
    const result = findReachableDistances('C', graph);
    expect(result.size).toBe(2);
    expect(result.has('A')).toBe(false);
    expect(result.has('B')).toBe(false);
    expect(result.get('C')).toBe(0);
    expect(result.get('D')).toBe(1);
  });

  it('finds all distances in complex graph', () => {
    const edges = [
      { id: 'e1', source: 'S', target: 'A' },
      { id: 'e2', source: 'S', target: 'B' },
      { id: 'e3', source: 'A', target: 'C' },
      { id: 'e4', source: 'B', target: 'C' },
      { id: 'e5', source: 'C', target: 'T' },
    ];
    const graph = buildGraph(edges);
    const result = findReachableDistances('S', graph);
    expect(result.get('S')).toBe(0);
    expect(result.get('A')).toBe(1);
    expect(result.get('B')).toBe(1);
    expect(result.get('C')).toBe(2);
    expect(result.get('T')).toBe(3);
  });
});

describe('findCommonMergeNode', () => {
  it('returns undefined for less than 2 valid targets', () => {
    const graph = buildGraph([
      { id: 'e1', source: 'A', target: 'B' },
    ]);

    expect(findCommonMergeNode([], graph)).toBeUndefined();
    expect(findCommonMergeNode(['A'], graph)).toBeUndefined();
    expect(findCommonMergeNode(['A', undefined], graph)).toBeUndefined();
    expect(findCommonMergeNode([undefined, 'A'], graph)).toBeUndefined();
    expect(findCommonMergeNode([undefined, undefined], graph)).toBeUndefined();
  });

  it('returns undefined when no common reachable node exists', () => {
    const edges = [
      { id: 'e1', source: 'A', target: 'B' },
      { id: 'e2', source: 'C', target: 'D' },
    ];
    const graph = buildGraph(edges);
    expect(findCommonMergeNode(['B', 'D'], graph)).toBeUndefined();
  });

  it('returns common node for simple merge', () => {
    const edges = [
      { id: 'e1', source: 'A', target: 'C' },
      { id: 'e2', source: 'B', target: 'C' },
    ];
    const graph = buildGraph(edges);
    expect(findCommonMergeNode(['A', 'B'], graph)).toBe('C');
  });

  it('finds optimal merge node', () => {
    const edges = [
      { id: 'e1', source: 'A', target: 'B' },
      { id: 'e2', source: 'B', target: 'D' },
      { id: 'e3', source: 'A', target: 'C' },
      { id: 'e4', source: 'C', target: 'D' },
    ];
    const graph = buildGraph(edges);
    const result = findCommonMergeNode(['B', 'C'], graph);
    expect(result).toBe('D');
  });

  it('handles diamond pattern - finds convergence point', () => {
    const edges = [
      { id: 'e1', source: 'A', target: 'B' },
      { id: 'e2', source: 'A', target: 'C' },
      { id: 'e3', source: 'B', target: 'D' },
      { id: 'e4', source: 'C', target: 'D' },
    ];
    const graph = buildGraph(edges);
    const result = findCommonMergeNode(['B', 'C'], graph);
    expect(result).toBe('D');
  });

  it('selects node with minimum combined distance', () => {
    const edges = [
      { id: 'e1', source: 'A', target: 'X' },
      { id: 'e2', source: 'X', target: 'Z' },
      { id: 'e3', source: 'B', target: 'Y' },
      { id: 'e4', source: 'Y', target: 'Z' },
      { id: 'e5', source: 'A', target: 'W' },
      { id: 'e6', source: 'B', target: 'W' },
    ];
    const graph = buildGraph(edges);
    const result = findCommonMergeNode(['A', 'B'], graph);
    expect(result).toBe('W');
  });

  it('breaks ties alphabetically', () => {
    const edges = [
      { id: 'e1', source: 'A', target: 'Z' },
      { id: 'e2', source: 'B', target: 'Z' },
      { id: 'e3', source: 'A', target: 'A1' },
      { id: 'e4', source: 'B', target: 'A1' },
    ];
    const graph = buildGraph(edges);
    const result = findCommonMergeNode(['A', 'B'], graph);
    expect(result).toBe('A1');
  });

  it('filters undefined/null targets and finds merge', () => {
    const edges = [
      { id: 'e1', source: 'A', target: 'C' },
      { id: 'e2', source: 'B', target: 'C' },
    ];
    const graph = buildGraph(edges);

    expect(findCommonMergeNode(['A', 'B', undefined], graph)).toBe('C');
    expect(findCommonMergeNode([undefined, 'A', 'B'], graph)).toBe('C');
    expect(findCommonMergeNode(['A', undefined, 'B'], graph)).toBe('C');
  });

  it('finds merge in complex graph', () => {
    const edges = [
      { id: 'e1', source: 'A', target: 'C' },
      { id: 'e2', source: 'B', target: 'C' },
      { id: 'e3', source: 'C', target: 'E' },
      { id: 'e4', source: 'D', target: 'E' },
    ];
    const graph = buildGraph(edges);
    const result = findCommonMergeNode(['A', 'D'], graph);
    expect(result).toBe('E');
  });
});
