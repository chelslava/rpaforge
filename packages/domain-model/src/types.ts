/**
 * Core domain types for RPA diagrams - framework agnostic
 * Compatible with React Flow Node<D> and Edge types but decoupled from React Flow
 */

export interface RpaNode<D = unknown> {
  id: string;
  data: D;
  position?: { x: number; y: number };
  width?: number;
  height?: number;
}

export interface RpaEdge {
  id: string;
  source: string;
  target: string;
  handle?: string | null;
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
