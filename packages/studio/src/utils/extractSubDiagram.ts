/*
 * Extract a canvas selection into a callable sub-diagram (issue #851).
 *
 * The extraction is a pure transform: selected nodes (+ internal edges)
 * become a standalone sub-diagram document, the selection site collapses
 * into one `sub-diagram-call` node, and boundary edges are rewired to it.
 * The variable contract mirrors the core packager heuristics: outputs are
 * the selection's activity output_variables; inputs are identifiers used in
 * expressions/conditions that the selection never assigns.
 */

export interface CanvasNodeLike {
  id: string;
  type?: string;
  position?: { x: number; y: number } | null;
  data?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface CanvasEdgeLike {
  id: string;
  source: string;
  target: string;
  [key: string]: unknown;
}

export interface ExtractContract {
  inputs: string[];
  outputs: string[];
}

export interface ExtractedSubDiagram {
  /** Document ready to be written as a `.process` file. */
  document: {
    version: string;
    templateType: string;
    metadata: { id: string; name: string };
    diagram: { nodes: CanvasNodeLike[]; edges: CanvasEdgeLike[] };
  };
  /** The `sub-diagram-call` node replacing the selection in the parent. */
  callNode: CanvasNodeLike;
  /** Parent edges rewired to source/target the call node. */
  rewiredEdges: CanvasEdgeLike[];
  /** Ids removed from the parent diagram. */
  removedNodeIds: string[];
  /** Internal edges removed together with the selection. */
  removedEdgeIds: string[];
  contract: ExtractContract;
}

export type ExtractError =
  | 'empty-selection'
  | 'no-start'
  | 'end-in-selection'
  | 'multiple-entries';

const TOKEN_RE = /\b[A-Za-z_][A-Za-z0-9_]*\b/g;
const KEYWORDS = new Set([
  'True', 'False', 'None', 'and', 'or', 'not', 'in', 'is', 'if', 'else',
  'while', 'for', 'return', 'def', 'str', 'int', 'float', 'bool', 'len',
]);

export function deriveSelectionContract(nodes: CanvasNodeLike[]): ExtractContract {
  const outputs: string[] = [];
  const assigned = new Set<string>();
  const tokens: string[] = [];
  const seenTokens = new Set<string>();

  for (const node of nodes) {
    const block = ((node.data ?? {}) as Record<string, unknown>).blockData ?? {};
    const blockData = block as Record<string, unknown>;
    const variableName = blockData.variableName;
    if (typeof variableName === 'string' && variableName) assigned.add(variableName);
    const outputVariable = blockData.output_variable;
    if (typeof outputVariable === 'string' && outputVariable && !outputs.includes(outputVariable)) {
      outputs.push(outputVariable);
    }
    for (const field of ['expression', 'condition'] as const) {
      const value = blockData[field];
      if (typeof value !== 'string') continue;
      for (const match of value.matchAll(TOKEN_RE)) {
        const token = match[0];
        if (!seenTokens.has(token)) {
          seenTokens.add(token);
          tokens.push(token);
        }
      }
    }
  }

  const inputs = tokens.filter(
    (token) =>
      !assigned.has(token) && !outputs.includes(token) && !KEYWORDS.has(token)
  );
  return { inputs, outputs };
}

/**
 * Extract `selectedIds` from the parent graph into a sub-diagram document
 * plus the replacement call node. Throws Error with a stable message key on
 * invalid selections (single entry point required; no Start except the
 * selected entry; no End inside the selection).
 */
export function extractSubDiagram(
  nodes: CanvasNodeLike[],
  edges: CanvasEdgeLike[],
  selectedIds: string[],
  subName: string,
  diagramId: string
): ExtractedSubDiagram {
  const selected = new Set(selectedIds);
  if (selected.size === 0) throw new Error('empty-selection');

  const selectedNodes = nodes.filter((n) => selected.has(n.id));
  const blockDataOf = (node: CanvasNodeLike): Record<string, unknown> =>
    (((node.data ?? {}) as Record<string, unknown>).blockData ?? {}) as Record<string, unknown>;
  const startNodes = selectedNodes.filter(
    (n) => n.type === 'start' || blockDataOf(n).type === 'start'
  );
  if (startNodes.length > 1) throw new Error('multiple-entries');
  const endNodes = selectedNodes.filter((n) => blockDataOf(n).type === 'end');
  if (endNodes.length > 0) throw new Error('end-in-selection');

  const boundaryIncoming = edges.filter(
    (e) => !selected.has(e.source) && selected.has(e.target)
  );
  // Entry = boundary incoming edges; a selected Start with no incoming edge
  // of its own also counts as the single entry (prefix extraction).
  const entryTargets = new Set(boundaryIncoming.map((e) => e.target));
  if (startNodes.length === 1) {
    const startHasIncoming = boundaryIncoming.some((e) => e.target === startNodes[0].id);
    if (!startHasIncoming && entryTargets.size === 0) {
      // Start-driven extraction: the entry is the selected start itself.
    } else {
      // Additional boundary entries alongside the start are ambiguous.
      if (entryTargets.size > 0) throw new Error('multiple-entries');
    }
  } else if (entryTargets.size === 0) {
    throw new Error('no-start');
  } else if (entryTargets.size > 1) {
    throw new Error('multiple-entries');
  }

  const internalEdges = edges.filter(
    (e) => selected.has(e.source) && selected.has(e.target)
  );
  const boundaryOutgoing = edges.filter(
    (e) => selected.has(e.source) && !selected.has(e.target)
  );

  const entryTarget = entryTargets.values().next().value as string | undefined;
  const selectedStartId = startNodes[0]?.id;
  const nonStartSelected = selectedNodes.filter((n) => !startNodes.includes(n));
  const startId = `sub-start-${diagramId}`;
  const subNodes: CanvasNodeLike[] = [
    {
      id: startId,
      type: 'start',
      position: { x: 80, y: 100 },
      data: {
        blockData: { id: startId, type: 'start', name: 'Start', label: 'Start' },
      },
    },
    ...nonStartSelected,
  ];
  const subEdges: CanvasEdgeLike[] = [];
  if (entryTarget) {
    subEdges.push({ id: `sub-start-edge-${diagramId}`, source: startId, target: entryTarget });
  }
  for (const edge of internalEdges) {
    // A selected Start's internal out-edges re-source from the fresh start.
    if (selectedStartId && edge.source === selectedStartId) {
      subEdges.push({ ...edge, source: startId });
    } else {
      subEdges.push(edge);
    }
  }

  const contract = deriveSelectionContract(nonStartSelected);

  const callId = `call-${diagramId}`;
  const firstNode = nonStartSelected[0];
  const callNode: CanvasNodeLike = {
    id: callId,
    type: 'sub-diagram-call',
    position: firstNode?.position ?? { x: 100, y: 100 },
    data: {
      blockData: {
        id: callId,
        type: 'sub-diagram-call',
        name: subName,
        label: subName,
        category: 'sub-diagram',
        diagramId,
        diagramName: subName,
        parameters: Object.fromEntries(contract.inputs.map((input) => [input, input])),
        returns: Object.fromEntries(contract.outputs.map((output) => [output, output])),
      },
    },
  };

  const rewiredEdges: CanvasEdgeLike[] = boundaryIncoming
    .filter((e) => e.target === entryTarget)
    .map((e) => ({ ...e, target: callId }));
  for (const edge of boundaryOutgoing) {
    rewiredEdges.push({ ...edge, source: callId });
  }

  return {
    document: {
      version: '1.0.0',
      templateType: 'process',
      metadata: { id: diagramId, name: subName },
      diagram: { nodes: subNodes, edges: subEdges },
    },
    callNode,
    rewiredEdges,
    removedNodeIds: [...selected],
    removedEdgeIds: [
      ...internalEdges.map((e) => e.id),
      ...boundaryIncoming.map((e) => e.id),
      ...boundaryOutgoing.map((e) => e.id),
    ],
    contract,
  };
}
