import type { Node, Edge } from '@reactflow/core';
import type { BlockData, IfBlockData, WhileBlockData, ForEachBlockData, SwitchBlockData } from '../types/blocks';

interface MermaidNode {
  id: string;
  label: string;
  shape: 'round' | 'stadium' | 'hexagon' | 'diamond' | 'circle' | 'subroutine' | 'cylinder';
  style?: string;
}

function sanitizeId(id: string): string {
  return id.replace(/[^a-zA-Z0-9]/g, '_').replace(/^(\d)/, '_$1');
}

function sanitizeLabel(label: string): string {
  return label.replace(/"/g, "'").replace(/\n/g, ' ').replace(/[()]/g, '');
}

function getNodeLabel(node: Node): string {
  const blockData = node.data?.blockData as BlockData;
  if (!blockData) {
    return node.data?.label || node.id || 'Node';
  }

  switch (blockData.type) {
    case 'start':
      return node.data?.label || 'Start';
    case 'end':
      return node.data?.label || 'End';
    case 'if': {
      const ifData = blockData as IfBlockData;
      return `IF ${ifData.condition || ''}`;
    }
    case 'while': {
      const whileData = blockData as WhileBlockData;
      return `WHILE ${whileData.condition || ''}`;
    }
    case 'for-each': {
      const forEachData = blockData as ForEachBlockData;
      return `FOR EACH ${forEachData.itemVariable || 'item'} IN ${forEachData.collection || ''}`;
    }
    case 'try-catch': {
      return 'TRY / CATCH';
    }
    case 'switch': {
      const switchData = blockData as SwitchBlockData;
      return `SWITCH ${switchData.expression || ''}`;
    }
    case 'throw':
      return 'THROW';
    case 'assign': {
      const assignData = blockData as BlockData & { variableName?: string; expression?: string };
      return `SET ${assignData.variableName || ''} = ${assignData.expression || ''}`;
    }
    case 'activity': {
      const activityData = blockData as BlockData & { activityId?: string };
      return activityData.activityId || blockData.type;
    }
    case 'sub-diagram-call': {
      const subData = blockData as BlockData & { diagramName?: string };
      return `CALL ${subData.diagramName || 'Sub-diagram'}`;
    }
    default:
      return blockData.type.toUpperCase();
  }
}

function getNodeShape(blockData: BlockData): MermaidNode['shape'] {
  switch (blockData?.type) {
    case 'start':
      return 'stadium';
    case 'end':
      return 'stadium';
    case 'if':
      return 'diamond';
    case 'while':
      return 'hexagon';
    case 'for-each':
      return 'hexagon';
    case 'try-catch':
      return 'subroutine';
    case 'switch':
      return 'diamond';
    case 'throw':
      return 'circle';
    default:
      return 'round';
  }
}

function getNodeColor(blockData: BlockData): string {
  const type = blockData?.type;

  if (type === 'start') return '#22c55e';
  if (type === 'end') return '#ef4444';
  if (type === 'if' || type === 'switch') return '#f59e0b';
  if (type === 'while' || type === 'for-each') return '#8b5cf6';
  if (type === 'try-catch') return '#06b6d4';
  if (type === 'activity') {
    const library = (blockData as BlockData & { library?: string })?.library;
    if (library === 'Flow') return '#3b82f6';
    if (library === 'DesktopUI') return '#8b5cf6';
    if (library === 'WebUI') return '#22c55e';
  }

  return '#64748b';
}

function buildGraph(edges: Edge[]): Map<string, Edge[]> {
  const graph = new Map<string, Edge[]>();

  for (const edge of edges) {
    const existing = graph.get(edge.source) || [];
    existing.push(edge);
    graph.set(edge.source, existing);
  }

  return graph;
}

export function diagramToMermaid(nodes: Node[], edges: Edge[]): string {
  if (nodes.length === 0) {
    return 'flowchart TD\n    empty(No nodes in diagram)';
  }

  buildGraph(edges);
  const lines: string[] = ['flowchart TD'];

  lines.push('    %% Nodes');

  for (const node of nodes) {
    const id = sanitizeId(node.id);
    const label = sanitizeLabel(getNodeLabel(node));
    const blockData = node.data?.blockData as BlockData;
    const shape = getNodeShape(blockData);
    const color = getNodeColor(blockData);

    const safeLabel = label || 'Node';
    
    switch (shape) {
      case 'stadium':
        lines.push(`    ${id}([${safeLabel}])`);
        break;
      case 'hexagon':
        lines.push(`    ${id}{{${safeLabel}}}`);
        break;
      case 'diamond':
        lines.push(`    ${id}{${safeLabel}}`);
        break;
      case 'circle':
        lines.push(`    ${id}((${safeLabel}))`);
        break;
      case 'subroutine':
        lines.push(`    ${id}[[${safeLabel}]]`);
        break;
      case 'cylinder':
        lines.push(`    ${id}([${safeLabel}])`);
        break;
      default:
        lines.push(`    ${id}[${safeLabel}]`);
    }

    if (color) {
      lines.push(`    style ${id} fill:${color},stroke:${color},color:#fff`);
    }
  }

  lines.push('');
  lines.push('    %% Edges');

  for (const edge of edges) {
    const sourceId = sanitizeId(edge.source);
    const targetId = sanitizeId(edge.target);
    const handle = (edge as Edge & { handleId?: string }).handleId || edge.sourceHandle || '';
    const label = edge.label || '';

    let edgeSyntax = `    ${sourceId}`;
    
    if (label) {
      edgeSyntax += ` -->|"${sanitizeLabel(String(label))}"| ${targetId}`;
    } else if (handle === 'true' || handle === 'false') {
      edgeSyntax += ` -->|"${handle}"| ${targetId}`;
    } else if (handle === 'body' || handle === 'output') {
      edgeSyntax += ` -->|"body"| ${targetId}`;
    } else if (handle === 'next') {
      edgeSyntax += ` -->|"next"| ${targetId}`;
    } else if (handle === 'error') {
      edgeSyntax += ` -.->|"error"| ${targetId}`;
    } else if (handle === 'finally') {
      edgeSyntax += ` -.->|"finally"| ${targetId}`;
    } else if (handle.startsWith('case-')) {
      edgeSyntax += ` -->|"${handle.replace('case-', '')}"| ${targetId}`;
    } else {
      edgeSyntax += ` --> ${targetId}`;
    }

    lines.push(edgeSyntax);
  }

  return lines.join('\n');
}

export function getMermaidTheme(): string {
  return `
.mermaid {
  background-color: transparent !important;
}
.mermaid .node rect,
.mermaid .node circle,
.mermaid .node ellipse,
.mermaid .node polygon,
.mermaid .node {
  fill: #374151 !important;
  stroke: #6b7280 !important;
}
.mermaid .nodeLabel {
  color: #f9fafb !important;
}
.mermaid .edgePath .path {
  stroke: #9ca3af !important;
}
.mermaid .edgeLabel {
  background-color: #1f2937 !important;
  color: #e5e7eb !important;
}
`;
}

export function downloadMermaidFile(code: string, filename: string = 'diagram.mmd'): void {
  const blob = new Blob([code], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function copyToClipboard(text: string): Promise<void> {
  return navigator.clipboard.writeText(text);
}
