import type { RpaNode } from '@rpaforge/domain-model';
import type { DiagramRef as DiagramRefBase } from '@rpaforge/diagram-core';

export type { RpaNode } from '@rpaforge/domain-model';

export type DiagramRef = DiagramRefBase & {
  inputs?: string[];
  outputs?: string[];
};

export interface MinimalBlockData {
  type: string;
  diagramId?: string;
  parameters?: Record<string, string>;
}

export function isSubDiagramCallBlock(data: MinimalBlockData): boolean {
  return data.type === 'sub-diagram-call' || data.type === 'sub_diagram';
}

export interface ProcessNodeValidationData {
  blockData?: MinimalBlockData;
}

export interface DiagramDocumentRef {
  nodes: RpaNode<ProcessNodeValidationData>[];
}
