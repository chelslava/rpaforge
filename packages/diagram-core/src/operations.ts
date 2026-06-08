import type { RpaNode, RpaEdge } from '@rpaforge/domain-model';
import type {
  DiagramValidationError,
  StartNodePredicate,
} from './types';

const START_BLOCK_TYPE = 'start';

export const isStartNode: StartNodePredicate = <D>(node: RpaNode<D>) =>
  (node.data as { blockData?: { type?: string } })?.blockData?.type === START_BLOCK_TYPE;

export function countStartNodes(nodes: RpaNode[]): number {
  return nodes.filter(isStartNode).length;
}

export function findStartNode(nodes: RpaNode[]): RpaNode | null {
  return nodes.find(isStartNode) || null;
}

export function hasStartNode(nodes: RpaNode[]): boolean {
  return countStartNodes(nodes) > 0;
}

export function getReachableNodes(
  startId: string,
  edges: RpaEdge[]
): Set<string> {
  const reachable = new Set<string>();
  const queue = [startId];

  while (queue.length > 0) {
    const currentId = queue.shift();
    if (!currentId || reachable.has(currentId)) {
      continue;
    }

    reachable.add(currentId);
    edges
      .filter((edge) => edge.source === currentId)
      .forEach((edge) => {
        if (!reachable.has(edge.target)) {
          queue.push(edge.target);
        }
      });
  }

  return reachable;
}

export function findOrphanedNodes(
  nodes: RpaNode[],
  edges: RpaEdge[]
): RpaNode[] {
  const startNode = findStartNode(nodes);
  if (!startNode) {
    return nodes.filter((node) => !isStartNode(node));
  }

  const reachable = getReachableNodes(startNode.id, edges);
  return nodes.filter(
    (node) => !reachable.has(node.id) && !isStartNode(node)
  );
}

export function validateDiagram(
  nodes: RpaNode[],
  edges: RpaEdge[]
): DiagramValidationError[] {
  const errors: DiagramValidationError[] = [];

  const startNodes = nodes.filter(isStartNode);
  if (startNodes.length === 0) {
    errors.push({
      type: 'no_start',
      message: 'Diagram must have exactly one Start node',
    });
  } else if (startNodes.length > 1) {
    errors.push({
      type: 'multiple_start',
      message: 'Diagram must have exactly one Start node',
      nodeIds: startNodes.map((n) => n.id),
    });
  }

  const orphaned = findOrphanedNodes(nodes, edges);
  if (orphaned.length > 0) {
    errors.push({
      type: 'orphaned_nodes',
      message: `${orphaned.length} node(s) are not reachable from Start`,
      nodeIds: orphaned.map((node) => node.id),
    });
  }

  return errors;
}

export function buildGraph(
  edges: RpaEdge[]
): Map<string, Array<{ target: string; handle?: string | null }>> {
  const graph = new Map<string, Array<{ target: string; handle?: string | null }>>();

  for (const edge of edges) {
    const outgoing = graph.get(edge.source) || [];
    outgoing.push({ target: edge.target, handle: edge.handle });
    graph.set(edge.source, outgoing);
  }

  return graph;
}

export function findReachableDistances(
  startId: string,
  graph: Map<string, Array<{ target: string; handle?: string | null }>>
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
  graph: Map<string, Array<{ target: string; handle?: string | null }>>
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

export function cloneNodes<T>(nodes: RpaNode<T>[]): RpaNode<T>[] {
  if (typeof structuredClone === 'function') {
    return structuredClone(nodes);
  }
  return nodes.map((node) => ({
    ...node,
    position: { x: node.position?.x ?? 0, y: node.position?.y ?? 0 },
    data: node.data ? JSON.parse(JSON.stringify(node.data)) : node.data,
  }));
}

export function cloneEdges(edges: RpaEdge[]): RpaEdge[] {
  if (typeof structuredClone === 'function') {
    return structuredClone(edges);
  }
  return edges.map((edge) => ({
    ...edge,
  }));
}

export function normalizeEdge(edge: RpaEdge): RpaEdge {
  return {
    ...edge,
    handle: edge.handle ?? 'output',
  };
}
