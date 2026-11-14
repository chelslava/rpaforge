import React from 'react';
import type { DiagramDocLike } from '../../utils/diagramDiff';
import { toDisplayString } from '../../utils/toDisplayString';

export type MiniNodeStatus = 'added' | 'removed' | 'modified' | 'moved' | 'ghost';

const STATUS_COLORS: Record<MiniNodeStatus, string> = {
  added: '#16a34a',
  removed: '#dc2626',
  modified: '#d97706',
  moved: '#2563eb',
  ghost: '#9ca3af',
};

const NODE_W = 150;
const NODE_H = 44;
const COL_GAP = 60;
const ROW_GAP = 40;
const PADDING = 24;
const PER_ROW = 5;

export interface DiagramMiniCanvasProps {
  doc: DiagramDocLike | null;
  /** Per-node outline colorization driven by the diff (parent decides per pane). */
  nodeStatus: Map<string, MiniNodeStatus>;
  /** Edge colorization keyed `source->target`. */
  edgeStatus: Map<string, 'added' | 'removed'>;
  /** Render all nodes as gray ghosts plus the colored overlay layer. */
  overlayBase?: DiagramDocLike | null;
}

function nodeLabel(node: DiagramDocLike['nodes'][number]): string {
  const data = (node.data ?? {}) as Record<string, unknown>;
  const label = data.label ?? data.name ?? node.id;
  return toDisplayString(label).slice(0, 22);
}

function syntheticPosition(index: number): { x: number; y: number } {
  const col = index % PER_ROW;
  const row = Math.floor(index / PER_ROW);
  return { x: col * (NODE_W + COL_GAP), y: row * (NODE_H + ROW_GAP) };
}

function layout(doc: DiagramDocLike): {
  positions: Map<string, { x: number; y: number }>;
  width: number;
  height: number;
} {
  const positions = new Map<string, { x: number; y: number }>();
  let maxX = 0;
  let maxY = 0;
  let syntheticIndex = 0;
  doc.nodes.forEach((node) => {
    const raw = node.position;
    const pos =
      raw && typeof raw.x === 'number' && typeof raw.y === 'number'
        ? { x: raw.x, y: raw.y }
        : syntheticPosition(syntheticIndex);
    if (!raw || typeof raw.x !== 'number') syntheticIndex += 1;
    positions.set(node.id, pos);
    maxX = Math.max(maxX, pos.x + NODE_W);
    maxY = Math.max(maxY, pos.y + NODE_H);
  });
  return {
    positions,
    width: Math.max(maxX + PADDING, 320),
    height: Math.max(maxY + PADDING, 120),
  };
}

/**
 * Read-only SVG diagram render for the diff/merge views (issue #850).
 *
 * Deliberately not a React Flow canvas: one rect + one text element per node
 * keeps 500+ node diagrams well inside a single paint (virtualization notes:
 * nodes are flat SVG children, no per-node React state, no effects — the
 * entire render is a single pure transform of the document + status maps).
 */
export const DiagramMiniCanvas: React.FC<DiagramMiniCanvasProps> = ({
  doc,
  nodeStatus,
  edgeStatus,
  overlayBase,
}) => {
  if (!doc) {
    return (
      <div className="flex items-center justify-center h-full text-xs text-ui-text-muted">
        —
      </div>
    );
  }
  const { positions, width, height } = layout(doc);

  const renderNode = (
    node: DiagramDocLike['nodes'][number],
    status: MiniNodeStatus,
    dashed: boolean
  ) => {
    const pos = positions.get(node.id);
    if (!pos) return null;
    const color = STATUS_COLORS[status];
    return (
      <g key={`${status}:${node.id}`}>
        <rect
          x={pos.x}
          y={pos.y}
          width={NODE_W}
          height={NODE_H}
          rx={8}
          fill={status === 'ghost' ? 'none' : 'transparent'}
          stroke={color}
          strokeWidth={status === 'ghost' ? 1 : 2}
          strokeDasharray={dashed || status === 'ghost' ? '4 3' : undefined}
        />
        <text
          x={pos.x + NODE_W / 2}
          y={pos.y + NODE_H / 2 + 4}
          textAnchor="middle"
          fontSize={12}
          fill={status === 'ghost' ? '#9ca3af' : undefined}
        >
          {nodeLabel(node)}
        </text>
      </g>
    );
  };

  const edgeColor = (key: string): string => {
    const status = edgeStatus.get(key);
    if (status === 'added') return STATUS_COLORS.added;
    if (status === 'removed') return STATUS_COLORS.removed;
    return '#94a3b8';
  };

  return (
    <div className="overflow-auto flex-1 min-h-0 bg-ui-surface-raised">
      <svg
        role="img"
        aria-label="diagram-diff-canvas"
        width={width}
        height={height}
        style={{ display: 'block' }}
      >
        {overlayBase
          ? (() => {
              const baseLayout = layout(overlayBase);
              const baseStatus = new Map<string, MiniNodeStatus>();
              overlayBase.nodes.forEach((n) => baseStatus.set(n.id, 'ghost'));
              // Ghost layer drawn from the base document's own positions.
              return overlayBase.nodes.map((node) => {
                const pos = baseLayout.positions.get(node.id);
                if (!pos) return null;
                return (
                  <g key={`ghost:${node.id}`}>
                    <rect
                      x={pos.x}
                      y={pos.y}
                      width={NODE_W}
                      height={NODE_H}
                      rx={8}
                      fill="none"
                      stroke={STATUS_COLORS.ghost}
                      strokeWidth={1}
                      strokeDasharray="4 3"
                    />
                    <text
                      x={pos.x + NODE_W / 2}
                      y={pos.y + NODE_H / 2 + 4}
                      textAnchor="middle"
                      fontSize={12}
                      fill={STATUS_COLORS.ghost}
                    >
                      {nodeLabel(node)}
                    </text>
                  </g>
                );
              });
            })()
          : doc.edges.map((edge) => {
              const from = positions.get(edge.source);
              const to = positions.get(edge.target);
              if (!from || !to) return null;
              const key = `${edge.source}->${edge.target}`;
              const x1 = from.x + NODE_W / 2;
              const y1 = from.y + NODE_H / 2;
              const x2 = to.x + NODE_W / 2;
              const y2 = to.y + NODE_H / 2;
              return (
                <line
                  key={key}
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  stroke={edgeColor(key)}
                  strokeWidth={edgeStatus.get(key) ? 2.5 : 1.5}
                  strokeDasharray={edgeStatus.get(key) === 'removed' ? '5 4' : undefined}
                  markerEnd="url(#diagram-diff-arrow)"
                />
              );
            })}
        {doc.nodes.map((node) =>
          renderNode(node, nodeStatus.get(node.id) ?? 'ghost', false)
        )}
        <defs>
          <marker
            id="diagram-diff-arrow"
            markerWidth="8"
            markerHeight="8"
            refX="7"
            refY="4"
            orient="auto"
          >
            <path d="M0,0 L8,4 L0,8 z" fill="#94a3b8" />
          </marker>
        </defs>
      </svg>
    </div>
  );
};

export default DiagramMiniCanvas;
