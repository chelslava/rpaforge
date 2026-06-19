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
}

function applyFields(blockData: BlockData, node: AiDiagramNode): void {
  blockData.name = node.label;
  blockData.label = node.label;

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
    blockData.name = node.label;
    blockData.label = node.label;
    return {
      id: node.id,
      type: 'activity',
      position: { x: 0, y: 0 },
      data: { blockData, description: undefined, tags: [] },
    };
  }

  const blockData = createActivityBlockData(activity, node.id);
  blockData.label = node.label || blockData.label;
  return {
    id: node.id,
    type: 'activity',
    position: { x: 0, y: 0 },
    data: { blockData, description: undefined, tags: [] },
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

  return { nodes, edges, warnings };
}
