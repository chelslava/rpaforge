import type { Node } from '@xyflow/react';

import type { ProcessNodeData } from '../stores/processStore';
import type { DiagramDocument, DiagramMetadata } from '../stores/diagramStore';

import {
  detectCircularReferences as rpaDetectCircular,
  validateSubDiagramCall as rpaValidateSubCall,
  validateParameterMapping as rpaValidateParam,
  validateDiagram as rpaValidateDiagram,
  validateProjectDiagramState as rpaValidateProject,
  getCallHierarchy as rpaGetHierarchy,
  isSubDiagramCallBlock as rpaIsSubCall,
} from '@rpaforge/validation';

import type { DiagramRef } from '@rpaforge/diagram-core';

import type {
  ValidationError,
  DiagramDocumentRef,
  ProcessNodeValidationData,
} from '@rpaforge/validation';

import type { RpaNode } from '@rpaforge/domain-model';

export type {
  ValidationError,
  MinimalBlockData,
  ProcessNodeValidationData,
  DiagramDocumentRef,
} from '@rpaforge/validation';

export function isSubDiagramCallBlock(data: { type: string; diagramId?: string }): boolean {
  return rpaIsSubCall(data);
}

export function detectCircularReferences(
  diagramId: string,
  diagrams: Map<string, DiagramMetadata>,
  nodesMap: Map<string, Node<ProcessNodeData>[]>,
  visited: Set<string> = new Set(),
  path: string[] = []
): ValidationError | null {
  return rpaDetectCircular(
    diagramId,
    diagrams as unknown as Map<string, DiagramRef>,
    nodesMap as unknown as Map<string, RpaNode<ProcessNodeValidationData>[]>,
    visited,
    path
  );
}

export function validateSubDiagramCall(
  node: Node<ProcessNodeData>,
  diagrams: DiagramMetadata[]
): ValidationError | null {
  return rpaValidateSubCall(
    node as unknown as RpaNode<ProcessNodeValidationData>,
    diagrams as unknown as DiagramRef[]
  );
}

export function validateParameterMapping(
  node: Node<ProcessNodeData>,
  diagram: DiagramMetadata | undefined
): ValidationError | null {
  return rpaValidateParam(
    node as unknown as RpaNode<ProcessNodeValidationData>,
    diagram as unknown as DiagramRef | undefined
  );
}

export function validateDiagram(
  diagramId: string,
  nodes: Node<ProcessNodeData>[],
  diagrams: DiagramMetadata[],
  nodesMap: Map<string, Node<ProcessNodeData>[]>
): ValidationError[] {
  return rpaValidateDiagram(
    diagramId,
    nodes as unknown as RpaNode<ProcessNodeValidationData>[],
    diagrams as unknown as DiagramRef[],
    nodesMap as unknown as Map<string, RpaNode<ProcessNodeValidationData>[]>
  );
}

export function validateProjectDiagramState(
  diagramId: string,
  diagrams: DiagramMetadata[],
  diagramDocuments: Record<string, DiagramDocument>
): ValidationError[] {
  return rpaValidateProject(
    diagramId,
    diagrams as unknown as DiagramRef[],
    diagramDocuments as unknown as Record<string, DiagramDocumentRef>
  );
}

export function getCallHierarchy(
  diagramId: string,
  diagrams: DiagramMetadata[],
  nodesMap: Map<string, Node<ProcessNodeData>[]>,
  depth: number = 0
): { id: string; name: string; depth: number }[] {
  return rpaGetHierarchy(
    diagramId,
    diagrams as unknown as DiagramRef[],
    nodesMap as unknown as Map<string, RpaNode<ProcessNodeValidationData>[]>,
    depth
  );
}
