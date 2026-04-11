import type { DiagramMetadata } from '../../stores/diagramStore';

interface DiagramNode {
  id: string;
  type: string;
  data: {
    activityId?: string;
    diagramId?: string;
  };
}

interface CallChain {
  diagramId: string;
  diagramName: string;
  nodeId: string;
}

export class CircularReferenceError extends Error {
  constructor(public chain: CallChain[]) {
    const chainStr = chain.map((c) => c.diagramName).join(' → ');
    super(`Circular reference detected: ${chainStr}`);
    this.name = 'CircularReferenceError';
  }
}

export function detectCircularReference(
  diagramId: string,
  getDiagram: (id: string) => DiagramMetadata | undefined,
  getDiagramNodes: (id: string) => DiagramNode[],
  visited: string[] = [],
  path: CallChain[] = []
): CallChain[] | null {
  if (visited.includes(diagramId)) {
    return path;
  }

  const diagram = getDiagram(diagramId);
  if (!diagram) {
    return null;
  }

  const nodes = getDiagramNodes(diagramId);

  for (const node of nodes) {
    if (node.type === 'sub_diagram' || node.data?.activityId === 'builtin.sub_diagram') {
      const subDiagramId = node.data.diagramId;
      if (!subDiagramId) continue;

      const subDiagram = getDiagram(subDiagramId);
      if (!subDiagram) continue;

      const currentCall: CallChain = {
        diagramId: diagramId,
        diagramName: diagram.name,
        nodeId: node.id,
      };

      if (visited.includes(subDiagramId)) {
        return [...path, currentCall];
      }

      const result = detectCircularReference(
        subDiagramId,
        getDiagram,
        getDiagramNodes,
        [...visited, diagramId],
        [...path, currentCall]
      );

      if (result) {
        return result;
      }
    }
  }

  return null;
}

export function validateSubDiagramCall(
  sourceDiagramId: string,
  targetDiagramId: string,
  getDiagram: (id: string) => DiagramMetadata | undefined,
  getDiagramNodes: (id: string) => DiagramNode[]
): { valid: boolean; error?: string; chain?: CallChain[] } {
  if (sourceDiagramId === targetDiagramId) {
    return {
      valid: false,
      error: 'Cannot call itself',
      chain: [
        {
          diagramId: sourceDiagramId,
          diagramName: getDiagram(sourceDiagramId)?.name || 'Unknown',
          nodeId: '',
        },
      ],
    };
  }

  const targetDiagram = getDiagram(targetDiagramId);
  if (!targetDiagram) {
    return { valid: false, error: 'Target diagram not found' };
  }

  if (targetDiagram.type === 'main') {
    return { valid: false, error: 'Cannot call a main diagram' };
  }

  const chain = detectCircularReference(
    targetDiagramId,
    getDiagram,
    getDiagramNodes,
    [sourceDiagramId]
  );

  if (chain) {
    return {
      valid: false,
      error: new CircularReferenceError(chain).message,
      chain,
    };
  }

  return { valid: true };
}

export function getDiagramCallDepth(
  diagramId: string,
  getDiagram: (id: string) => DiagramMetadata | undefined,
  getDiagramNodes: (id: string) => DiagramNode[],
  visited: Set<string> = new Set()
): number {
  if (visited.has(diagramId)) {
    return 0;
  }

  visited.add(diagramId);

  const diagram = getDiagram(diagramId);
  if (!diagram) {
    return 0;
  }

  const nodes = getDiagramNodes(diagramId);
  let maxDepth = 0;

  for (const node of nodes) {
    if (node.type === 'sub_diagram' || node.data?.activityId === 'builtin.sub_diagram') {
      const subDiagramId = node.data.diagramId;
      if (!subDiagramId) continue;

      const depth = getDiagramCallDepth(subDiagramId, getDiagram, getDiagramNodes, visited);
      maxDepth = Math.max(maxDepth, depth + 1);
    }
  }

  return maxDepth;
}

const MAX_NESTING_DEPTH = 10;

export function validateNestingDepth(
  diagramId: string,
  getDiagram: (id: string) => DiagramMetadata | undefined,
  getDiagramNodes: (id: string) => DiagramNode[]
): { valid: boolean; depth: number; error?: string } {
  const depth = getDiagramCallDepth(diagramId, getDiagram, getDiagramNodes);

  if (depth > MAX_NESTING_DEPTH) {
    return {
      valid: false,
      depth,
      error: `Maximum nesting depth (${MAX_NESTING_DEPTH}) exceeded. Current depth: ${depth}`,
    };
  }

  return { valid: true, depth };
}
