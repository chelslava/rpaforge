/**
 * Converts an AI-generated diagram (already validated by the Electron main
 * process — see electron/ai/generateDiagram.ts and ADR-003.3) into canvas
 * nodes/edges. Mirrors the renderer-side half of mermaidImporter.ts: this
 * module does not re-run AJV/structural validation (that already happened
 * in main against the same activities snapshot passed to it); it only
 * resolves `activityId` against the *live* activity list and builds
 * ProcessNode/Edge objects via the same factories the rest of the designer
 * uses (createActivityBlockData/createDefaultBlockData).
 */

import type { Edge } from '@xyflow/react';
import { createActivityBlockData, createDefaultBlockData, type BlockData, type BlockType } from '../types/blocks';
import { createConnection } from '../types/connections';
import type { ProcessNode } from '../stores/blockStore';
import type { Activity } from '../domain/activity';
import type { AiDiagramJson, AiDiagramNode } from '../types/ai';

export interface AiDiagramBuildResult {
  nodes: ProcessNode[];
  edges: Edge[];
  warnings: string[];
  /** Distinct variable names introduced by the diagram (assign targets, for-each items, activity outputVariable) — not yet declared anywhere, for the caller to register in the Variables panel. */
  variableNames: string[];
}

// Mirrors createActivityParamValues' typing convention in src/types/engine.ts
// (boolean -> boolean, integer/float -> number, everything else -> string) so
// AI-supplied values land in blockData.params with the same JS types manual
// edits via the PropertyPanel would produce.
function coerceParamValue(value: string | number | boolean, paramType: string): unknown {
  if (paramType === 'boolean') {
    return typeof value === 'boolean' ? value : value === 'true' || value === 1;
  }
  if (paramType === 'integer') {
    return typeof value === 'number' ? Math.trunc(value) : parseInt(String(value), 10);
  }
  if (paramType === 'float') {
    return typeof value === 'number' ? value : parseFloat(String(value));
  }
  return String(value);
}

function collectVariableNames(diagram: AiDiagramJson): string[] {
  const names = new Set<string>();
  for (const node of diagram.nodes) {
    if (node.blockType === 'assign' && node.variableName) names.add(node.variableName);
    if (node.blockType === 'for-each' && node.itemVariable) names.add(node.itemVariable);
    if (node.blockType === 'activity' && node.outputVariable) names.add(node.outputVariable);
  }
  return [...names];
}

// Models occasionally omit "label" to save tokens (observed live with free
// OpenRouter models) even though the system prompt asks for one; fall back
// to something identifiable rather than failing the whole generation over a
// purely cosmetic field.
function resolveLabel(node: AiDiagramNode): string {
  return node.label || node.activityId || node.id;
}

function applyFields(blockData: BlockData, node: AiDiagramNode): void {
  const label = resolveLabel(node);
  blockData.name = label;
  blockData.label = label;

  switch (blockData.type) {
    case 'if':
    case 'while':
      if (node.condition) blockData.condition = node.condition;
      break;
    case 'switch':
      if (node.expression) blockData.expression = node.expression;
      if (node.cases?.length) {
        blockData.cases = node.cases.map((entry, index) => ({
          id: `case-${index + 1}`,
          value: entry.value,
          label: entry.label,
        }));
      }
      break;
    case 'throw':
      if (node.message) blockData.message = node.message;
      break;
    case 'assign':
      if (node.variableName) blockData.variableName = node.variableName;
      if (node.variableExpression) blockData.expression = node.variableExpression;
      break;
    case 'for-each':
      if (node.itemVariable) blockData.itemVariable = node.itemVariable;
      if (node.collection) blockData.collection = node.collection;
      break;
    default:
      break;
  }
}

function buildActivityNode(
  node: AiDiagramNode,
  activityById: Map<string, Activity>,
  warnings: string[]
): ProcessNode {
  const activity = node.activityId ? activityById.get(node.activityId) : undefined;

  if (!activity) {
    // The main process validated activityId against a snapshot taken moments
    // earlier; if the live registry changed in between (library disconnected
    // mid-generation), fall back to a placeholder instead of failing the
    // whole import — same defensive posture as mermaidImporter.ts's
    // unrecognized-node path.
    warnings.push(
      `Activity "${node.activityId ?? node.id}" is no longer available — imported as a placeholder.`
    );
    const blockData = createDefaultBlockData('activity', node.id);
    const label = resolveLabel(node);
    blockData.name = label;
    blockData.label = label;
    return {
      id: node.id,
      type: 'activity',
      position: { x: 0, y: 0 },
      data: { blockData, description: undefined, tags: [], outputVariable: node.outputVariable },
    };
  }

  const blockData = createActivityBlockData(activity, node.id);
  blockData.label = node.label || blockData.label;

  if (node.activityParams) {
    const paramTypeByName = new Map(activity.params.map((param) => [param.name, param.type]));
    for (const [paramName, rawValue] of Object.entries(node.activityParams)) {
      const paramType = paramTypeByName.get(paramName);
      if (!paramType) continue; // already rejected by main's semantic validation; defensive skip
      blockData.params[paramName] = coerceParamValue(rawValue, paramType);
    }
  }

  return {
    id: node.id,
    type: 'activity',
    position: { x: 0, y: 0 },
    data: { blockData, description: undefined, tags: [], outputVariable: node.outputVariable },
  };
}

export function buildDiagramFromAiResult(diagram: AiDiagramJson, activities: Activity[]): AiDiagramBuildResult {
  const warnings: string[] = [];
  const activityById = new Map(activities.map((activity) => [activity.id, activity]));

  const nodes: ProcessNode[] = diagram.nodes.map((node) => {
    if (node.blockType === 'activity') {
      return buildActivityNode(node, activityById, warnings);
    }

    const blockData = createDefaultBlockData(node.blockType as BlockType, node.id);
    applyFields(blockData, node);
    return {
      id: node.id,
      type: node.blockType,
      position: { x: 0, y: 0 },
      data: { blockData, description: undefined, tags: [] },
    };
  });

  const edges: Edge[] = diagram.edges.map((edge) =>
    createConnection(edge.from, edge.to, edge.handle ?? 'output', 'input')
  );

  return { nodes, edges, warnings, variableNames: collectVariableNames(diagram) };
}
