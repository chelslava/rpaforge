import type { Edge, Node } from '@xyflow/react';
import type { ProcessNodeData } from '../stores/blockStore';
import type { LayoutedPosition } from './autoLayout';

export async function computeAutoLayout(
  nodes: Node<ProcessNodeData>[],
  edges: Edge[]
): Promise<LayoutedPosition[]> {
  const { computeAutoLayout: loadLayout } = await import('./autoLayout');
  return loadLayout(nodes, edges);
}
