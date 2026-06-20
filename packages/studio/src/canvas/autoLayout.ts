/**
 * Auto-layout: arranges canvas nodes along the edge graph using elkjs.
 * Runs on the main thread (bundled elk) — RPA diagrams are small enough
 * (tens of nodes) that a dedicated Web Worker is not warranted.
 *
 * Port-aware: each node's input/output handles are declared to ELK as
 * ports, in the same left-to-right order they're rendered in (see
 * `getOutputHandleLeft`/`getInputHandleLeft` in BaseBlock.tsx), with
 * `elk.portConstraints: FIXED_ORDER`. Without this, ELK's crossing
 * minimization is free to swap branch order (e.g. place the "false"
 * subtree left of "true") purely to reduce crossings elsewhere — but the
 * `true`/`false` handle dots are physically fixed left/right on the node,
 * so a swapped subtree order makes the wires visibly cross at the source.
 */

import ELK from 'elkjs/lib/elk.bundled.js';
import type { Node, Edge } from '@xyflow/react';
import type { ProcessNodeData } from '../stores/blockStore';
import {
  BLOCK_PORT_CONFIGS,
  getParallelPortConfig,
  getSwitchPortConfig,
  getTryCatchPortConfig,
  type BlockPortConfig,
  type Port,
} from '../types/blocks';

const elk = new ELK();

// Fallback size for nodes without a `measured` size yet (mirrors BaseBlock.tsx:
// HEADER_HEIGHT 34 + MIN_CONTENT_HEIGHT 50 + PORT_LABELS_AREA 20, BASE_MIN_WIDTH 200).
const DEFAULT_NODE_WIDTH = 200;
const DEFAULT_NODE_HEIGHT = 104;

const PORT_SIDE: Record<Port['position'], string> = {
  top: 'NORTH',
  bottom: 'SOUTH',
  left: 'WEST',
  right: 'EAST',
};

export interface LayoutedPosition {
  id: string;
  position: { x: number; y: number };
}

// Mirrors the per-blockType port resolution used by SwitchBlock/TryCatchBlock/
// ParallelBlock (dynamic ports for cases/branches/except-blocks) and falls back
// to the static BLOCK_PORT_CONFIGS for every other block type. Reusing these
// rather than re-deriving port order keeps a single source of truth.
function resolvePortConfig(node: Node<ProcessNodeData>): BlockPortConfig | undefined {
  const blockData = node.data?.blockData;
  if (!blockData) return undefined;

  switch (blockData.type) {
    case 'switch':
      return getSwitchPortConfig(blockData);
    case 'parallel':
      return getParallelPortConfig(blockData);
    case 'try-catch':
      return getTryCatchPortConfig(blockData);
    default:
      return BLOCK_PORT_CONFIGS[blockData.type];
  }
}

function elkPortId(nodeId: string, portId: string): string {
  return `${nodeId}::${portId}`;
}

// Resolves an edge endpoint to an ELK port id when the node has a recognized
// port with that handle id, otherwise falls back to the plain node id (nodes
// without `blockData`, e.g. non-RPA test fixtures, lay out exactly as before).
function resolveEndpoint(
  nodeId: string,
  handleId: string,
  portConfig: BlockPortConfig | undefined
): string {
  if (!portConfig) return nodeId;
  const hasPort =
    portConfig.inputs.some((port) => port.id === handleId) ||
    portConfig.outputs.some((port) => port.id === handleId);
  return hasPort ? elkPortId(nodeId, handleId) : nodeId;
}

const LOOP_BLOCK_TYPES = new Set(['while', 'for-each']);

// Identifies while/for-each loop-back edges (body's last node connects back to
// the loop node, e.g. `for-each --body--> move --> for-each`, see
// templates/index.ts). Anchored on the loop node itself (not a generic DFS
// root) so the result doesn't depend on `nodes` array order: a plain
// graph-wide cycle DFS would pick whichever of the two cycle edges its
// traversal happens to reach first as "the" back-edge, which flips
// arbitrarily with node order — ELK's own GREEDY cycle-breaking has exactly
// this same non-determinism, observed in testing as the loop body sometimes
// laying out *above* the loop node it belongs to.
function findLoopBackEdgeIndices(nodes: Node<ProcessNodeData>[], edges: Edge[]): Set<number> {
  const outgoingByNode = new Map<string, number[]>();
  edges.forEach((edge, index) => {
    const list = outgoingByNode.get(edge.source);
    if (list) list.push(index);
    else outgoingByNode.set(edge.source, [index]);
  });

  const backEdgeIndices = new Set<number>();

  for (const node of nodes) {
    const blockData = node.data?.blockData;
    if (!blockData || !LOOP_BLOCK_TYPES.has(blockData.type)) continue;

    const bodyEdgeIndices = (outgoingByNode.get(node.id) ?? []).filter(
      (index) => (edges[index].sourceHandle || 'output') === 'body'
    );
    if (bodyEdgeIndices.length === 0) continue;

    const visited = new Set<string>([node.id]);
    const stack = bodyEdgeIndices.map((index) => edges[index].target);

    while (stack.length > 0) {
      const currentId = stack.pop()!;
      for (const edgeIndex of outgoingByNode.get(currentId) ?? []) {
        const targetId = edges[edgeIndex].target;
        if (targetId === node.id) {
          backEdgeIndices.add(edgeIndex);
        } else if (!visited.has(targetId)) {
          visited.add(targetId);
          stack.push(targetId);
        }
      }
    }
  }

  return backEdgeIndices;
}

export async function computeAutoLayout(
  nodes: Node<ProcessNodeData>[],
  edges: Edge[]
): Promise<LayoutedPosition[]> {
  if (nodes.length === 0) {
    return [];
  }

  const portConfigs = new Map(nodes.map((node) => [node.id, resolvePortConfig(node)] as const));
  const backEdgeIndices = findLoopBackEdgeIndices(nodes, edges);

  const elkGraph = {
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': 'DOWN',
      'elk.layered.spacing.nodeNodeBetweenLayers': '80',
      'elk.spacing.nodeNode': '60',
      // Extra thoroughness for nicer placement around loop back-edges —
      // RPA diagrams are small enough (tens of nodes) for the cost to be
      // negligible. The loop-back edges themselves are pre-resolved above
      // (findLoopBackEdgeIndices) rather than left for ELK's generic,
      // order-dependent cycle-breaking to guess at.
      'elk.layered.thoroughness': '10',
    },
    children: nodes.map((node) => {
      const portConfig = portConfigs.get(node.id);
      const width = node.measured?.width ?? DEFAULT_NODE_WIDTH;
      const height = node.measured?.height ?? DEFAULT_NODE_HEIGHT;

      if (!portConfig) {
        return { id: node.id, width, height };
      }

      const ports = [...portConfig.inputs, ...portConfig.outputs].map((port) => ({
        id: elkPortId(node.id, port.id),
        properties: { 'org.eclipse.elk.port.side': PORT_SIDE[port.position] },
      }));

      return {
        id: node.id,
        width,
        height,
        ports,
        layoutOptions: { 'elk.portConstraints': 'FIXED_ORDER' },
      };
    }),
    edges: edges.map((edge, index) => {
      // Loop-back edges are fed to ELK reversed (target as the layering
      // "source"), purely as a layering hint so the loop node stays above
      // its body — not routed through specific ports. The real edge keeps
      // its original direction/handle when rendered by the canvas; this
      // only affects the internal ELK graph used to compute positions.
      if (backEdgeIndices.has(index)) {
        return { id: edge.id, sources: [edge.target], targets: [edge.source] };
      }

      const sourceHandle = edge.sourceHandle || 'output';
      const targetHandle = edge.targetHandle || 'input';

      return {
        id: edge.id,
        sources: [resolveEndpoint(edge.source, sourceHandle, portConfigs.get(edge.source))],
        targets: [resolveEndpoint(edge.target, targetHandle, portConfigs.get(edge.target))],
      };
    }),
  };

  const result = await elk.layout(elkGraph);

  return (result.children ?? []).map((child) => ({
    id: child.id,
    position: { x: child.x ?? 0, y: child.y ?? 0 },
  }));
}
