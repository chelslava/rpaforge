/**
 * Mermaid flowchart import: parses `flowchart`/`graph` text into RPA blocks.
 * Mirrors the shape dialect produced by `@rpaforge/codegen`'s diagramToMermaid
 * (stadium=start/end, diamond=if/switch, hexagon=while, subroutine=try-catch,
 * circle=throw, rect=generic activity placeholder) but also accepts the
 * inline node-declaration style typical of hand-written Mermaid
 * (`A[Label] --> B{Cond}`). Structural import only — it does not attempt to
 * understand activity semantics; unrecognized/generic nodes become Activity
 * placeholders the user configures afterward (same as a node whose bound
 * Activity can't be resolved, see ActivityBlock.tsx's existing fallback).
 *
 * Out of scope: subgraphs, classDef/click/linkStyle directives, non-flowchart
 * diagram types, multi-arrow chained edges (`A --> B --> C` on one line).
 */

import type { Edge } from '@xyflow/react';
import { createDefaultBlockData, type BlockData, type BlockType } from '../types/blocks';
import { createConnection } from '../types/connections';
import type { ProcessNode } from '../stores/blockStore';

export interface MermaidImportResult {
  nodes: ProcessNode[];
  edges: Edge[];
  warnings: string[];
}

type Shape = 'hexagon' | 'subroutine' | 'circle' | 'stadium' | 'diamond' | 'rect' | 'bare';

interface NodeToken {
  id: string;
  shape: Shape;
  label: string;
}

interface RawEdge {
  source: string;
  target: string;
  label?: string;
}

const HEADER_REGEX = /^(flowchart|graph)\s+(TD|TB|BT|RL|LR)?/i;
const OTHER_DIAGRAM_REGEX = /^(sequenceDiagram|classDiagram|stateDiagram|erDiagram|gantt|pie|journey|mindmap)\b/i;
const IGNORED_LINE_REGEX = /^(subgraph\b|end$|style\s|classDef\s|class\s|click\s|linkStyle\s)/i;
const EDGE_REGEX = /^(.+?)\s*(-->|-\.->|==>|--x|--o|---)\s*(?:\|"?([^"|]*)"?\|\s*)?(.+)$/;

const SHAPE_PATTERNS: Array<{ regex: RegExp; shape: Shape }> = [
  { regex: /^([A-Za-z0-9_-]+)\{\{(.*)\}\}$/, shape: 'hexagon' },
  { regex: /^([A-Za-z0-9_-]+)\[\[(.*)\]\]$/, shape: 'subroutine' },
  { regex: /^([A-Za-z0-9_-]+)\(\((.*)\)\)$/, shape: 'circle' },
  { regex: /^([A-Za-z0-9_-]+)\(\[(.*)\]\)$/, shape: 'stadium' },
  { regex: /^([A-Za-z0-9_-]+)\{(.*)\}$/, shape: 'diamond' },
  { regex: /^([A-Za-z0-9_-]+)\[(.*)\]$/, shape: 'rect' },
];

function unquote(label: string): string {
  const match = label.match(/^"(.*)"$/);
  return match ? match[1] : label;
}

function detectShape(token: string): NodeToken | null {
  const trimmed = token.trim();
  for (const { regex, shape } of SHAPE_PATTERNS) {
    const match = trimmed.match(regex);
    if (match) {
      return { id: match[1], shape, label: unquote(match[2].trim()) || match[1] };
    }
  }
  if (/^[A-Za-z0-9_-]+$/.test(trimmed)) {
    return { id: trimmed, shape: 'bare', label: trimmed };
  }
  return null;
}

function registerNode(map: Map<string, NodeToken>, token: NodeToken): void {
  const existing = map.get(token.id);
  if (!existing || (existing.shape === 'bare' && token.shape !== 'bare')) {
    map.set(token.id, token);
  }
}

function classifyShape(shape: Shape, outCount: number, inCount: number): BlockType {
  switch (shape) {
    case 'stadium':
      if (inCount === 0) return 'start';
      if (outCount === 0) return 'end';
      return 'activity';
    case 'hexagon':
      return 'while';
    case 'subroutine':
      return 'try-catch';
    case 'circle':
      return outCount === 0 ? 'throw' : 'activity';
    case 'diamond':
      return outCount > 2 ? 'switch' : 'if';
    default:
      return 'activity';
  }
}

function applyLabel(blockData: BlockData, label: string): void {
  blockData.name = label;
  blockData.label = label;
  switch (blockData.type) {
    case 'if':
    case 'while':
      blockData.condition = label;
      break;
    case 'switch':
      blockData.expression = label;
      break;
    case 'throw':
      blockData.message = label;
      break;
    default:
      break;
  }
}

interface PortAssignment {
  handle: string;
  caseLabel?: string;
}

function resolvePort(
  type: BlockType,
  label: string | undefined,
  edgeIndex: number,
  total: number
): PortAssignment {
  const norm = label?.trim().toLowerCase();

  switch (type) {
    case 'if':
      if (norm && /^(true|yes)$/.test(norm)) return { handle: 'true' };
      if (norm && /^(false|no)$/.test(norm)) return { handle: 'false' };
      return { handle: edgeIndex === 0 ? 'true' : 'false' };
    case 'while':
      if (norm && /^(loop|body|yes|true)$/.test(norm)) return { handle: 'body' };
      if (norm && /^(no|false|exit)$/.test(norm)) return { handle: 'next' };
      if (total === 2) return { handle: edgeIndex === 0 ? 'body' : 'next' };
      return { handle: 'next' };
    case 'try-catch':
      if (norm && /^(error|catch|exception)$/.test(norm)) return { handle: 'error' };
      if (norm && /^finally$/.test(norm)) return { handle: 'finally' };
      if (!norm && edgeIndex === 0) return { handle: 'output' };
      return { handle: 'error' };
    case 'switch':
      if (!norm || norm === 'default') return { handle: 'default' };
      return { handle: `case-${edgeIndex + 1}`, caseLabel: label };
    default:
      return { handle: 'output' };
  }
}

function isAmbiguousBranch(type: BlockType, label: string | undefined, total: number): boolean {
  if (label?.trim()) return false;
  return (type === 'if' && total === 2) || (type === 'while' && total === 2);
}

export function parseMermaidToDiagram(code: string): MermaidImportResult {
  const warnings: string[] = [];
  const lines = code
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  const headerIdx = lines.findIndex((line) => HEADER_REGEX.test(line));
  if (headerIdx === -1) {
    const hasOtherDiagram = lines.some((line) => OTHER_DIAGRAM_REGEX.test(line));
    warnings.push(
      hasOtherDiagram
        ? 'Only flowchart/graph diagrams can be imported.'
        : 'No flowchart/graph header found.'
    );
    return { nodes: [], edges: [], warnings };
  }

  const nodeMap = new Map<string, NodeToken>();
  const rawEdges: RawEdge[] = [];

  for (let i = headerIdx + 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith('%%') || IGNORED_LINE_REGEX.test(line)) {
      continue;
    }

    const edgeMatch = line.match(EDGE_REGEX);
    if (edgeMatch) {
      const [, left, , label, right] = edgeMatch;
      const leftNode = detectShape(left);
      const rightNode = detectShape(right);
      if (!leftNode || !rightNode) {
        warnings.push(`Could not parse line: "${line}"`);
        continue;
      }
      registerNode(nodeMap, leftNode);
      registerNode(nodeMap, rightNode);
      rawEdges.push({ source: leftNode.id, target: rightNode.id, label: label?.trim() || undefined });
      continue;
    }

    const standalone = detectShape(line);
    if (standalone && standalone.shape !== 'bare') {
      registerNode(nodeMap, standalone);
      continue;
    }

    warnings.push(`Skipped unrecognized line: "${line}"`);
  }

  if (nodeMap.size === 0) {
    warnings.push('No nodes found in the diagram.');
    return { nodes: [], edges: [], warnings };
  }

  const outDegree = new Map<string, number>();
  const inDegree = new Map<string, number>();
  for (const edge of rawEdges) {
    outDegree.set(edge.source, (outDegree.get(edge.source) ?? 0) + 1);
    inDegree.set(edge.target, (inDegree.get(edge.target) ?? 0) + 1);
  }

  const classified = new Map<string, BlockType>();
  for (const [id, token] of nodeMap) {
    classified.set(id, classifyShape(token.shape, outDegree.get(id) ?? 0, inDegree.get(id) ?? 0));
  }

  const startIds = [...classified.entries()].filter(([, type]) => type === 'start').map(([id]) => id);
  if (startIds.length === 0) {
    warnings.push('No Start node found — add one manually before running this process.');
  } else if (startIds.length > 1) {
    for (const id of startIds.slice(1)) {
      classified.set(id, 'activity');
    }
    warnings.push(
      `Multiple Start-like nodes found; only "${startIds[0]}" was kept as Start, the rest were imported as Activity placeholders.`
    );
  }

  const edgesBySource = new Map<string, RawEdge[]>();
  for (const edge of rawEdges) {
    const list = edgesBySource.get(edge.source) ?? [];
    list.push(edge);
    edgesBySource.set(edge.source, list);
  }

  const switchCases = new Map<string, Array<{ id: string; value: string; label: string }>>();
  const finallyNodes = new Set<string>();
  const ambiguousWarned = new Set<string>();
  const resolvedHandles = new Map<RawEdge, string>();

  for (const [sourceId, sourceEdges] of edgesBySource) {
    const type = classified.get(sourceId) ?? 'activity';
    sourceEdges.forEach((edge, index) => {
      const { handle, caseLabel } = resolvePort(type, edge.label, index, sourceEdges.length);
      resolvedHandles.set(edge, handle);

      if (type === 'switch' && handle.startsWith('case-')) {
        const cases = switchCases.get(sourceId) ?? [];
        cases.push({ id: handle, value: caseLabel ?? handle, label: caseLabel ?? `Case ${index + 1}` });
        switchCases.set(sourceId, cases);
      }
      if (type === 'try-catch' && handle === 'finally') {
        finallyNodes.add(sourceId);
      }
      if (isAmbiguousBranch(type, edge.label, sourceEdges.length) && !ambiguousWarned.has(sourceId)) {
        ambiguousWarned.add(sourceId);
        warnings.push(`Assumed branch order for node "${sourceId}" — verify the outgoing connections.`);
      }
    });
  }

  const nodes: ProcessNode[] = [];
  for (const [id, token] of nodeMap) {
    const type = classified.get(id) ?? 'activity';
    const blockData = createDefaultBlockData(type, id);
    applyLabel(blockData, token.label);

    if (type === 'switch') {
      (blockData as BlockData & { type: 'switch' }).cases = switchCases.get(id) ?? [];
    }
    if (type === 'try-catch' && finallyNodes.has(id)) {
      (blockData as BlockData & { type: 'try-catch' }).finallyBlock = [];
    }

    nodes.push({
      id,
      type,
      position: { x: 0, y: 0 },
      data: { blockData, description: undefined, tags: [] },
    });
  }

  const edges: Edge[] = rawEdges.map((edge) =>
    createConnection(edge.source, edge.target, resolvedHandles.get(edge) ?? 'output', 'input')
  );

  return { nodes, edges, warnings };
}
