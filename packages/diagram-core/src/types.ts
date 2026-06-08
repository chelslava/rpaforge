import type { RpaNode } from '@rpaforge/domain-model';

export interface DiagramRef {
  id: string;
  name: string;
  type: 'main' | 'sub-diagram' | 'library';
}

export type DiagramValidationErrorType =
  | 'no_start'
  | 'multiple_start'
  | 'orphaned_nodes'
  | 'cyclic'
  | 'invalid_load'
  | 'invalid_connection';

export interface DiagramValidationError {
  type: DiagramValidationErrorType;
  message: string;
  nodeIds?: string[];
}

export type StartNodePredicate<D = unknown> = (node: RpaNode<D>) => boolean;
