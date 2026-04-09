import type { Node } from '@reactflow/core';

import type { ProcessNodeData } from '../stores/processStore';
import type { DiagramMetadata } from '../stores/diagramStore';
import { isSubDiagramCallBlock } from '../types/blocks';

export interface ValidationError {
  type: 'circular_reference' | 'missing_diagram' | 'invalid_parameter' | 'max_depth';
  message: string;
  diagramId?: string;
  nodeId?: string;
  path?: string[];
}

const MAX_NESTING_DEPTH = 10;

export function detectCircularReferences(
  diagramId: string,
  diagrams: Map<string, DiagramMetadata>,
  nodesMap: Map<string, Node<ProcessNodeData>[]>,
  visited: Set<string> = new Set(),
  path: string[] = []
): ValidationError | null {
  if (visited.has(diagramId)) {
    return {
      type: 'circular_reference',
      message: `Circular reference detected: ${[...path, diagramId].join(' → ')}`,
      diagramId,
      path: [...path, diagramId],
    };
  }

  if (path.length >= MAX_NESTING_DEPTH) {
    return {
      type: 'max_depth',
      message: `Maximum nesting depth (${MAX_NESTING_DEPTH}) exceeded`,
      diagramId,
      path,
    };
  }

  const nodes = nodesMap.get(diagramId);
  if (!nodes) return null;

  visited.add(diagramId);
  const newPath = [...path, diagramId];

  for (const node of nodes) {
    const blockData = node.data.blockData;
    if (blockData && isSubDiagramCallBlock(blockData)) {
      const subDiagramId = blockData.diagramId;
      if (subDiagramId) {
        const error = detectCircularReferences(
          subDiagramId,
          diagrams,
          nodesMap,
          new Set(visited),
          newPath
        );
        if (error) return error;
      }
    }
  }

  return null;
}

export function validateSubDiagramCall(
  node: Node<ProcessNodeData>,
  diagrams: DiagramMetadata[]
): ValidationError | null {
  const blockData = node.data.blockData;
  if (!blockData || !isSubDiagramCallBlock(blockData)) return null;

  const diagramId = blockData.diagramId;
  if (!diagramId) {
    return {
      type: 'missing_diagram',
      message: 'No sub-diagram selected',
      nodeId: node.id,
    };
  }

  const diagram = diagrams.find((d) => d.id === diagramId);
  if (!diagram) {
    return {
      type: 'missing_diagram',
      message: `Sub-diagram "${diagramId}" not found`,
      nodeId: node.id,
      diagramId,
    };
  }

  return null;
}

export function validateParameterMapping(
  node: Node<ProcessNodeData>,
  diagram: DiagramMetadata | undefined
): ValidationError | null {
  if (!diagram) return null;

  const blockData = node.data.blockData;
  if (!blockData || !isSubDiagramCallBlock(blockData)) return null;

  const parameters = blockData.parameters || {};
  const inputs = diagram.inputs || [];

  for (const input of inputs) {
    if (!parameters[input] || parameters[input].trim() === '') {
      return {
        type: 'invalid_parameter',
        message: `Missing required parameter: ${input}`,
        nodeId: node.id,
      };
    }
  }

  return null;
}

export function validateDiagram(
  diagramId: string,
  nodes: Node<ProcessNodeData>[],
  diagrams: DiagramMetadata[],
  nodesMap: Map<string, Node<ProcessNodeData>[]>
): ValidationError[] {
  const errors: ValidationError[] = [];

  const diagram = diagrams.find((d) => d.id === diagramId);

  for (const node of nodes) {
    const subDiagramError = validateSubDiagramCall(node, diagrams);
    if (subDiagramError) {
      errors.push(subDiagramError);
      continue;
    }

    if (node.data.blockData?.type === 'sub-diagram-call' && diagram) {
      const paramError = validateParameterMapping(node, diagram);
      if (paramError) {
        errors.push(paramError);
      }
    }
  }

  const diagramsMap = new Map(diagrams.map((d) => [d.id, d]));
  const circularError = detectCircularReferences(diagramId, diagramsMap, nodesMap);
  if (circularError) {
    errors.push(circularError);
  }

  return errors;
}

export function getCallHierarchy(
  diagramId: string,
  diagrams: DiagramMetadata[],
  nodesMap: Map<string, Node<ProcessNodeData>[]>,
  depth: number = 0
): { id: string; name: string; depth: number }[] {
  if (depth >= MAX_NESTING_DEPTH) return [];

  const diagram = diagrams.find((d) => d.id === diagramId);
  if (!diagram) return [];

  const result: { id: string; name: string; depth: number }[] = [
    { id: diagramId, name: diagram.name, depth },
  ];

  const nodes = nodesMap.get(diagramId);
  if (!nodes) return result;

  for (const node of nodes) {
    const blockData = node.data.blockData;
    if (blockData && isSubDiagramCallBlock(blockData)) {
      const subDiagramId = blockData.diagramId;
      if (subDiagramId) {
        const children = getCallHierarchy(subDiagramId, diagrams, nodesMap, depth + 1);
        result.push(...children);
      }
    }
  }

  return result;
}
