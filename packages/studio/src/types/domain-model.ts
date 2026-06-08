/**
 * Re-export domain model types from @rpaforge/domain-model package
 * with React Flow type compatibility overrides.
 */

// Re-export RpaEdge as-is (fully compatible)
export type { RpaEdge } from '@rpaforge/domain-model';

// RpaNode needs width/height as number | null for React Flow compatibility
// The package defines them as number | undefined, but React Flow allows null
// Also include optional type field for backward compatibility with test code
import type { RpaNode as PackageRpaNode } from '@rpaforge/domain-model';
export type RpaNode<D = unknown> = Omit<PackageRpaNode<D>, 'width' | 'height'> & {
  type?: string;
  width?: number | null;
  height?: number | null;
};
