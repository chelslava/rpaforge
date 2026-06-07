/**
 * Diagram graph operations for code generation
 */

import type { RpaEdge } from '@rpaforge/domain-model';

export interface GraphNode {
  target: string;
  handle?: string | null;
}

export function buildGraph(
  edges: RpaEdge[]
): Map<string, GraphNode[]> {
  const graph = new Map<string, GraphNode[]>();

  for (const edge of edges) {
    const outgoing = graph.get(edge.source) || [];
    outgoing.push({ target: edge.target, handle: edge.handle });
    graph.set(edge.source, outgoing);
  }

  return graph;
}

export function findReachableDistances(
  startId: string,
  graph: Map<string, GraphNode[]>
): Map<string, number> {
  const distances = new Map<string, number>();
  const queue: Array<{ id: string; distance: number }> = [{ id: startId, distance: 0 }];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) {
      continue;
    }

    const knownDistance = distances.get(current.id);
    if (knownDistance !== undefined && knownDistance <= current.distance) {
      continue;
    }

    distances.set(current.id, current.distance);

    for (const edge of graph.get(current.id) || []) {
      queue.push({ id: edge.target, distance: current.distance + 1 });
    }
  }

  return distances;
}

export function findCommonMergeNode(
  targets: Array<string | undefined>,
  graph: Map<string, GraphNode[]>
): string | undefined {
  const validTargets = targets.filter((target): target is string => Boolean(target));
  if (validTargets.length < 2) {
    return undefined;
  }

  const distanceMaps = validTargets.map((target) => findReachableDistances(target, graph));
  const common = [...distanceMaps[0].keys()].filter((nodeId) =>
    distanceMaps.every((map) => map.has(nodeId))
  );

  if (common.length === 0) {
    return undefined;
  }

  common.sort((left, right) => {
    const leftScore = distanceMaps.reduce((sum, map) => sum + (map.get(left) || 0), 0);
    const rightScore = distanceMaps.reduce((sum, map) => sum + (map.get(right) || 0), 0);
    return leftScore - rightScore || left.localeCompare(right);
  });

  return common[0];
}
