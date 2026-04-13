import type { Edge, Node } from '@reactflow/core';
import type { BlockData } from '../../types/blocks';

export interface CodegenContext {
  nodes: Node[];
  edges: Edge[];
  graph: Map<string, Array<{ target: string; handle?: string | null }>>;
  libraries: Set<string>;
  indent: number;
  stopNode?: string;
}

export interface CodegenResult {
  code: string;
  libraries: string[];
}

export type BlockDataExtractor<T extends Node = Node> = (
  node: T
) => BlockData | undefined;

export function getBlockData(node: Node): BlockData | undefined {
  return node.data?.blockData;
}

export function getActivityKeyword(blockData: Record<string, unknown>): string {
  const activityId = (blockData.activityId as string | undefined) || (blockData.name as string | undefined) || 'Log';
  return activityId.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

export function formatSwitchCondition(expression: string, value: string): string {
  const normalizedValue = value.trim();
  if (!normalizedValue) {
    return expression;
  }

  if (
    normalizedValue.startsWith('${') ||
    normalizedValue.startsWith('@{') ||
    normalizedValue.startsWith('&{') ||
    normalizedValue.startsWith('%{') ||
    normalizedValue.startsWith("'") ||
    normalizedValue.startsWith('"') ||
    normalizedValue.replace('.', '').match(/^\d+$/)
  ) {
    return `${expression} == ${normalizedValue}`;
  }

  return `${expression} == '${normalizedValue}'}`;
}
