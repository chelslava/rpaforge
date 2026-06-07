/**
 * Re-export domain model types for studio
 * Bridge to @rpaforge/domain-model package during build
 */

export type RpaNode<D = unknown> = {
  id: string;
  data: D;
  position?: { x: number; y: number };
  width?: number;
  height?: number;
};

export type RpaEdge = {
  id: string;
  source: string;
  target: string;
  handle?: string | null;
};
