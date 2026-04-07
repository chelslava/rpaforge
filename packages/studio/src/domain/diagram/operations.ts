import type { Edge, Node } from '@reactflow/core';
import type {
  DiagramValidationError,
  StartNodePredicate,
} from './types';

const START_BLOCK_TYPE = 'start';

export const isStartNode: StartNodePredicate = (node) =>
  node.data?.blockData?.type === START_BLOCK_TYPE;

export function countStartNodes(nodes: Node[]): number {
  return nodes.filter(isStartNode).length;
}

export function findStartNode(nodes: Node[]): Node | null {
  return nodes.find(isStartNode) || null;
}

export function hasStartNode(nodes: Node[]): boolean {
  return countStartNodes(nodes) > 0;
}

export function getReachableNodes(
  startId: string,
  edges: Edge[]
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
  nodes: Node[],
  edges: Edge[]
): Node[] {
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
  nodes: Node[],
  edges: Edge[]
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
  edges: Edge[]
): Map<string, Array<{ target: string; handle?: string | null }>> {
  const graph = new Map<string, Array<{ target: string; handle?: string | null }>>();

  for (const edge of edges) {
    const outgoing = graph.get(edge.source) || [];
    outgoing.push({ target: edge.target, handle: edge.sourceHandle });
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

export function cloneNodes<T>(nodes: Node<T>[]): Node<T>[] {
  return nodes.map((node) => ({
    ...node,
    position: { ...node.position },
    data: node.data
      ? JSON.parse(JSON.stringify(node.data))
      : node.data,
  }));
}

export function cloneEdges(edges: Edge[]): Edge[] {
  return edges.map((edge) => ({
    ...edge,
    data: edge.data ? JSON.parse(JSON.stringify(edge.data)) : edge.data,
    style: edge.style ? { ...edge.style } : edge.style,
  }));
}

export function normalizeEdge(edge: Edge): Edge {
  return {
    ...edge,
    type: edge.type ?? 'custom',
    sourceHandle: edge.sourceHandle ?? 'output',
    targetHandle: edge.targetHandle ?? 'input',
    data: edge.data ? JSON.parse(JSON.stringify(edge.data)) : edge.data,
    style: edge.style ? { ...edge.style } : edge.style,
  };
}
