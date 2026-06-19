/**
 * Auto-layout: arranges canvas nodes along the edge graph using elkjs.
 * Runs on the main thread (bundled elk) — RPA diagrams are small enough
 * (tens of nodes) that a dedicated Web Worker is not warranted.
 */

import ELK from 'elkjs/lib/elk.bundled.js';
import type { Node, Edge } from '@xyflow/react';

const elk = new ELK();

// Fallback size for nodes without a `measured` size yet (mirrors BaseBlock.tsx:
// HEADER_HEIGHT 34 + MIN_CONTENT_HEIGHT 50 + PORT_LABELS_AREA 20, BASE_MIN_WIDTH 200).
const DEFAULT_NODE_WIDTH = 200;
const DEFAULT_NODE_HEIGHT = 104;

export interface LayoutedPosition {
  id: string;
  position: { x: number; y: number };
}

export async function computeAutoLayout(
  nodes: Node[],
  edges: Edge[]
): Promise<LayoutedPosition[]> {
  if (nodes.length === 0) {
    return [];
  }

  const elkGraph = {
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': 'DOWN',
      'elk.layered.spacing.nodeNodeBetweenLayers': '80',
      'elk.spacing.nodeNode': '60',
    },
    children: nodes.map((node) => ({
      id: node.id,
      width: node.measured?.width ?? DEFAULT_NODE_WIDTH,
      height: node.measured?.height ?? DEFAULT_NODE_HEIGHT,
    })),
    edges: edges.map((edge) => ({
      id: edge.id,
      sources: [edge.source],
      targets: [edge.target],
    })),
  };

  const result = await elk.layout(elkGraph);

  return (result.children ?? []).map((child) => ({
    id: child.id,
    position: { x: child.x ?? 0, y: child.y ?? 0 },
  }));
}
