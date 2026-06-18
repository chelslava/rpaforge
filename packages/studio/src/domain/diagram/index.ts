export * from '@rpaforge/diagram-core';

export type { RpaNode, RpaEdge } from '@rpaforge/domain-model';

import type { Node, Edge } from '@xyflow/react';
import {
  countStartNodes as rpaCount,
  findStartNode as rpaFindStart,
  findOrphanedNodes as rpaFindOrphaned,
  validateDiagram as rpaValidate,
  cloneNodes as rpaCloneNodes,
  cloneEdges as rpaCloneEdges,
  normalizeEdge as rpaNormalizeEdge,
  isStartNode as rpaIsStartNode,
} from '@rpaforge/diagram-core';
import type { DiagramValidationError } from '@rpaforge/diagram-core';

export function isStartNode(node: Node): boolean {
  return rpaIsStartNode(node as unknown as Parameters<typeof rpaIsStartNode>[0]);
}

export function countStartNodes(nodes: Node[]): number {
  return rpaCount(nodes as unknown as Parameters<typeof rpaCount>[0]);
}

export function findStartNode(nodes: Node[]): Node | null {
  return rpaFindStart(nodes as unknown as Parameters<typeof rpaFindStart>[0]) as Node | null;
}

export function findOrphanedNodes(nodes: Node[], edges: Edge[]): Node[] {
  return rpaFindOrphaned(
    nodes as unknown as Parameters<typeof rpaFindOrphaned>[0],
    edges as unknown as Parameters<typeof rpaFindOrphaned>[1]
  ) as Node[];
}

export function validateDiagram(nodes: Node[], edges: Edge[]): DiagramValidationError[] {
  return rpaValidate(
    nodes as unknown as Parameters<typeof rpaValidate>[0],
    edges as unknown as Parameters<typeof rpaValidate>[1]
  );
}

export function cloneNodes<T extends Record<string, unknown>>(nodes: Node<T>[]): Node<T>[] {
  return rpaCloneNodes(nodes as unknown as Parameters<typeof rpaCloneNodes>[0]) as Node<T>[];
}

export function cloneEdges(edges: Edge[]): Edge[] {
  return rpaCloneEdges(edges as unknown as Parameters<typeof rpaCloneEdges>[0]) as Edge[];
}

export function normalizeEdge(edge: Edge): Edge {
  return rpaNormalizeEdge(edge as unknown as Parameters<typeof rpaNormalizeEdge>[0]) as Edge;
}
