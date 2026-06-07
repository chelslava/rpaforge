/**
 * Diagram-specific domain types
 */

export interface DiagramNode {
  id: string;
  label?: string;
  type?: string;
  position?: { x: number; y: number };
}

export interface DiagramEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
}

export interface Diagram {
  nodes: DiagramNode[];
  edges: DiagramEdge[];
}
