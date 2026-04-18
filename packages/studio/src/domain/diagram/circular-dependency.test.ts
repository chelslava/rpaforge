import { describe, expect, test } from 'vitest';
import {
  canAddSubDiagramCall,
  findCircularDependencies,
  getAncestors,
  getNestingDepth,
  MAX_NESTING_DEPTH,
} from './circular-dependency';
import type { DiagramMetadata } from '../../stores/diagramStore';

const createMockDiagram = (
  id: string,
  name: string,
  type: 'main' | 'sub-diagram' = 'sub-diagram'
): DiagramMetadata => ({
  id,
  name,
  type,
  path: `${name}.process`,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});

describe('findCircularDependencies', () => {
  test('returns no cycle for independent diagrams', () => {
    const diagrams = [createMockDiagram('a', 'A'), createMockDiagram('b', 'B')];
    const getDeps = () => [];

    const result = findCircularDependencies(diagrams, getDeps);

    expect(result.hasCycle).toBe(false);
    expect(result.cycle).toBeNull();
  });

  test('returns no cycle for linear dependencies', () => {
    const diagrams = [
      createMockDiagram('a', 'A'),
      createMockDiagram('b', 'B'),
      createMockDiagram('c', 'C'),
    ];
    const getDeps = (id: string) => {
      if (id === 'a') return ['b'];
      if (id === 'b') return ['c'];
      return [];
    };

    const result = findCircularDependencies(diagrams, getDeps);

    expect(result.hasCycle).toBe(false);
  });

  test('detects direct self-reference', () => {
    const diagrams = [createMockDiagram('a', 'A')];
    const getDeps = (id: string) => (id === 'a' ? ['a'] : []);

    const result = findCircularDependencies(diagrams, getDeps);

    expect(result.hasCycle).toBe(true);
    expect(result.cycle).toContain('a');
  });

  test('detects circular dependency chain', () => {
    const diagrams = [
      createMockDiagram('a', 'A'),
      createMockDiagram('b', 'B'),
      createMockDiagram('c', 'C'),
    ];
    const getDeps = (id: string) => {
      if (id === 'a') return ['b'];
      if (id === 'b') return ['c'];
      if (id === 'c') return ['a'];
      return [];
    };

    const result = findCircularDependencies(diagrams, getDeps);

    expect(result.hasCycle).toBe(true);
  });
});

describe('canAddSubDiagramCall', () => {
  test('disallows self-reference', () => {
    const diagrams = [createMockDiagram('a', 'A')];
    const getDeps = () => [];

    const result = canAddSubDiagramCall('a', 'a', diagrams, getDeps);

    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('itself');
  });

  test('disallows adding call that creates cycle', () => {
    const diagrams = [
      createMockDiagram('main', 'Main', 'main'),
      createMockDiagram('sub1', 'Sub1'),
      createMockDiagram('sub2', 'Sub2'),
    ];
    const getDeps = (id: string) => {
      if (id === 'sub2') return ['sub1'];
      return [];
    };

    const result = canAddSubDiagramCall('sub1', 'sub2', diagrams, getDeps);

    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('circular');
  });

  test('allows valid call', () => {
    const diagrams = [
      createMockDiagram('main', 'Main', 'main'),
      createMockDiagram('sub', 'Sub'),
    ];
    const getDeps = () => [];

    const result = canAddSubDiagramCall('main', 'sub', diagrams, getDeps);

    expect(result.allowed).toBe(true);
  });
});

describe('getAncestors', () => {
  test('returns empty for diagram with no dependencies', () => {
    const diagrams = [createMockDiagram('a', 'A')];
    const getDeps = () => [];

    const ancestors = getAncestors('a', diagrams, getDeps);

    expect(ancestors).toEqual([]);
  });

  test('returns all ancestor diagrams', () => {
    const diagrams = [
      createMockDiagram('a', 'A'),
      createMockDiagram('b', 'B'),
      createMockDiagram('c', 'C'),
    ];
    const getDeps = (id: string) => {
      if (id === 'a') return ['b'];
      if (id === 'b') return ['c'];
      return [];
    };

    const ancestors = getAncestors('a', diagrams, getDeps);

    expect(ancestors).toContain('b');
    expect(ancestors).toContain('c');
  });

  test('respects maxDepth parameter', () => {
    const diagrams = ['a', 'b', 'c', 'd'].map((id) => createMockDiagram(id, id));
    const getDeps = (id: string) => {
      const order = ['a', 'b', 'c', 'd'];
      const idx = order.indexOf(id);
      return idx < order.length - 1 ? [order[idx + 1]] : [];
    };

    const ancestors = getAncestors('a', diagrams, getDeps, 2);

    expect(ancestors.length).toBeLessThanOrEqual(2);
  });
});

describe('getNestingDepth', () => {
  test('returns 0 for diagram with no dependencies', () => {
    const diagrams = [createMockDiagram('a', 'A')];
    const getDeps = () => [];

    const depth = getNestingDepth('a', diagrams, getDeps);

    expect(depth).toBe(0);
  });

  test('calculates correct nesting depth', () => {
    const diagrams = [
      createMockDiagram('a', 'A'),
      createMockDiagram('b', 'B'),
      createMockDiagram('c', 'C'),
    ];
    const getDeps = (id: string) => {
      if (id === 'a') return ['b'];
      if (id === 'b') return ['c'];
      return [];
    };

    const depth = getNestingDepth('a', diagrams, getDeps);

    expect(depth).toBe(2);
  });
});

describe('MAX_NESTING_DEPTH', () => {
  test('is set to 10', () => {
    expect(MAX_NESTING_DEPTH).toBe(10);
  });
});
