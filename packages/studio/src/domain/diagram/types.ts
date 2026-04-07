import type { Node } from '@reactflow/core';

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

export type StartNodePredicate = (node: Node) => boolean;
