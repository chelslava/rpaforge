import type { DiagramMetadata } from '../../stores/diagramStore';

interface DiagramGraph {
  diagramId: string;
  dependencies: string[];
}

function buildDependencyGraph(
  diagrams: DiagramMetadata[],
  getDiagramDependencies: (id: string) => string[]
): Map<string, Set<string>> {
  const graph = new Map<string, Set<string>>();

  for (const diagram of diagrams) {
    const deps = getDiagramDependencies(diagram.id);
    graph.set(diagram.id, new Set(deps));
  }

  return graph;
}

function detectCycle(
  graph: Map<string, Set<string>>,
  startId: string,
  visited: Set<string>,
  path: Set<string>
): string[] | null {
  visited.add(startId);
  path.add(startId);

  const dependencies = graph.get(startId);
  if (dependencies) {
    for (const depId of Array.from(dependencies)) {
      if (!visited.has(depId)) {
        const cycle = detectCycle(graph, depId, visited, path);
        if (cycle) {
          return cycle;
        }
      } else if (path.has(depId)) {
        const cycleStart = Array.from(path).indexOf(depId);
        return [...Array.from(path).slice(cycleStart), depId];
      }
    }
  }

  path.delete(startId);
  return null;
}

export function findCircularDependencies(
  diagrams: DiagramMetadata[],
  getDiagramDependencies: (id: string) => string[]
): { hasCycle: boolean; cycle: string[] | null; affectedDiagrams: string[] } {
  if (diagrams.length === 0) {
    return { hasCycle: false, cycle: null, affectedDiagrams: [] };
  }

  const graph = buildDependencyGraph(diagrams, getDiagramDependencies);
  const visited = new Set<string>();

  for (const diagram of diagrams) {
    if (!visited.has(diagram.id)) {
      const cycle = detectCycle(graph, diagram.id, visited, new Set());
      if (cycle) {
        return {
          hasCycle: true,
          cycle,
          affectedDiagrams: cycle,
        };
      }
    }
  }

  return { hasCycle: false, cycle: null, affectedDiagrams: [] };
}

export function getAncestors(
  diagramId: string,
  diagrams: DiagramMetadata[],
  getDiagramDependencies: (id: string) => string[],
  maxDepth: number = 10
): string[] {
  const ancestors: string[] = [];
  const visited = new Set<string>();
  const queue: Array<{ id: string; depth: number }> = [{ id: diagramId, depth: 0 }];

  while (queue.length > 0) {
    const { id, depth } = queue.shift()!;

    if (depth >= maxDepth || visited.has(id)) {
      continue;
    }

    visited.add(id);
    const deps = getDiagramDependencies(id);

    for (const depId of deps) {
      if (!visited.has(depId)) {
        ancestors.push(depId);
        queue.push({ id: depId, depth: depth + 1 });
      }
    }
  }

  return ancestors;
}

export function canAddSubDiagramCall(
  sourceDiagramId: string,
  targetDiagramId: string,
  diagrams: DiagramMetadata[],
  getDiagramDependencies: (id: string) => string[]
): { allowed: boolean; reason?: string } {
  if (sourceDiagramId === targetDiagramId) {
    return { allowed: false, reason: 'Cannot call itself' };
  }

  const ancestors = getAncestors(targetDiagramId, diagrams, getDiagramDependencies);
  if (ancestors.includes(sourceDiagramId)) {
    return {
      allowed: false,
      reason: `Circular reference detected: calling this diagram would create a cycle`,
    };
  }

  const simulatedDeps = (id: string) => {
    if (id === sourceDiagramId) {
      return [...getDiagramDependencies(id), targetDiagramId];
    }
    return getDiagramDependencies(id);
  };

  const { hasCycle } = findCircularDependencies(diagrams, simulatedDeps);
  if (hasCycle) {
    return { allowed: false, reason: 'Adding this call would create a circular dependency' };
  }

  return { allowed: true };
}

export const MAX_NESTING_DEPTH = 10;

export function getNestingDepth(
  diagramId: string,
  diagrams: DiagramMetadata[],
  getDiagramDependencies: (id: string) => string[]
): number {
  const visited = new Set<string>();

  function dfs(id: string, depth: number): number {
    if (visited.has(id)) {
      return depth;
    }
    visited.add(id);

    const deps = getDiagramDependencies(id);
    if (deps.length === 0) {
      return depth;
    }

    return Math.max(...deps.map((depId) => dfs(depId, depth + 1)));
  }

  return dfs(diagramId, 0);
}
