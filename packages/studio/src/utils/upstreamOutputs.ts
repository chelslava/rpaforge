/**
 * Upstream data-pill discovery (issue #868).
 *
 * Pure static analysis of the canvas graph: for a given node, which
 * activities reachable backwards through edges declare an
 * `output_variable` — those are the variables an expression on the node
 * may reference. Works before the first run (declared outputs, not
 * execution snapshots) and is scope-aware for free: a node on the other
 * branch of an if/parallel split has no edge path back to the current
 * node, so its outputs never appear as upstream.
 */

import type { Edge } from '@xyflow/react';
import type { ProcessNode, ProcessNodeData } from '../stores/blockStore';

export interface UpstreamOutput {
  /** Declared output_variable (runtime variable name). */
  name: string;
  /** Source node id producing the output. */
  nodeId: string;
  /** Human-readable producer label (activity name or block type). */
  nodeLabel: string;
  /** Edge distance from the consumer node (1 = direct predecessor). */
  distance: number;
}

export interface UpstreamOutputModel {
  /** Declared upstream outputs, nearest first, deduped by name. */
  outputs: UpstreamOutput[];
  /**
   * Output names declared by nodes that are NOT upstream of the current
   * node (downstream or on sibling branches) — greyed out with a warning
   * in the picker to prevent ordering bugs.
   */
  downstreamNames: Set<string>;
}

/** Read the declared output variable from either node-data shape. */
export function getDeclaredOutputVariable(data: ProcessNodeData): string {
  const direct = data.outputVariable;
  if (typeof direct === 'string' && direct.trim()) {
    return direct.trim();
  }
  const blockData = data.blockData as { output_variable?: string } | undefined;
  const nested = blockData?.output_variable;
  return typeof nested === 'string' && nested.trim() ? nested.trim() : '';
}

function nodeLabel(data: ProcessNodeData): string {
  const activityName = data.activity?.name;
  if (typeof activityName === 'string' && activityName.trim()) {
    return activityName.trim();
  }
  const blockType = data.blockData?.type;
  if (typeof blockType === 'string' && blockType) {
    return blockType;
  }
  return 'node';
}

function isSubDiagramBoundary(data: ProcessNodeData): boolean {
  return data.blockData?.type === 'sub-diagram-call';
}

/**
 * Compute the upstream output model for `nodeId`.
 *
 * Traversal walks incoming edges backwards (BFS, nearest-first). A
 * sub-diagram-call node is a boundary: its own declared output is
 * included, but the walk does not continue past it — the sub-diagram's
 * internals live in another diagram and are not visible here.
 */
export function computeUpstreamOutputs(
  nodes: ProcessNode[],
  edges: Edge[],
  nodeId: string | null | undefined,
): UpstreamOutputModel {
  if (!nodeId) {
    return { outputs: [], downstreamNames: new Set() };
  }

  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const incoming = new Map<string, string[]>();
  for (const edge of edges) {
    const list = incoming.get(edge.target) ?? [];
    list.push(edge.source);
    incoming.set(edge.target, list);
  }

  const upstreamIds = new Set<string>();
  const outputs: UpstreamOutput[] = [];
  const seenNames = new Set<string>();
  const visited = new Set<string>([nodeId]);
  const queue: Array<{ id: string; distance: number }> = [{ id: nodeId, distance: 0 }];

  while (queue.length > 0) {
    const current = queue.shift() as { id: string; distance: number };
    const node = nodeById.get(current.id);

    if (node && current.id !== nodeId) {
      const name = getDeclaredOutputVariable(node.data);
      if (name && !seenNames.has(name)) {
        seenNames.add(name);
        outputs.push({
          name,
          nodeId: current.id,
          nodeLabel: nodeLabel(node.data),
          distance: current.distance,
        });
      }
    }
    if (node && current.id !== nodeId && isSubDiagramBoundary(node.data)) {
      continue; // boundary: include the call node's output, stop the walk
    }
    for (const sourceId of incoming.get(current.id) ?? []) {
      if (!visited.has(sourceId)) {
        visited.add(sourceId);
        upstreamIds.add(sourceId);
        queue.push({ id: sourceId, distance: current.distance + 1 });
      }
    }
  }

  const downstreamNames = new Set<string>();
  for (const node of nodes) {
    if (node.id === nodeId || upstreamIds.has(node.id)) {
      continue;
    }
    const name = getDeclaredOutputVariable(node.data);
    if (name) {
      downstreamNames.add(name);
    }
  }

  return { outputs, downstreamNames };
}
