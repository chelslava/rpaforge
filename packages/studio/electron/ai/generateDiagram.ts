/**
 * Prompt assembly + self-correcting validation loop for AI diagram
 * generation (E1 Phase 5.3). Runs entirely in the Electron main process:
 *
 *   1. AJV validates the response shape against a schema built dynamically
 *      from the activities snapshot (activityId/blockType are constrained to
 *      an enum, so an out-of-registry id fails here even before semantics).
 *   2. Semantic validation re-checks activityId/blockType against the
 *      registry defensively (never trust shape validation alone — a
 *      provider that ignores the schema could still slip something through).
 *   3. `validateDiagram` from `@rpaforge/diagram-core` (framework-agnostic,
 *      already a studio dependency) checks graph structure: exactly one
 *      Start, no orphaned nodes.
 *
 * Any failing layer feeds its error text back to the model as a correction
 * request, up to MAX_RETRIES times. The renderer only ever receives an
 * already-validated diagram (or a final failure) — see ADR-003.3.
 */

import Ajv from 'ajv';
import { validateDiagram } from '@rpaforge/diagram-core';
import type { RpaNode, RpaEdge } from '@rpaforge/domain-model';
import {
  AI_BLOCK_TYPES,
  type AiActivitySnapshot,
  type AiDiagramJson,
  type AiGenerateDiagramResult,
} from '../../src/types/ai';
import type { AiProvider, AiProviderCredentials } from './providers';

const MAX_RETRIES = 2;
const FORBIDDEN_BLOCK_TYPES = new Set(['parallel', 'sub-diagram-call']);

const ajv = new Ajv({ allErrors: true, strict: false });

function buildJsonSchema(activities: AiActivitySnapshot[]): Record<string, unknown> {
  const activityIds = activities.map((activity) => activity.id);

  return {
    type: 'object',
    additionalProperties: false,
    required: ['nodes', 'edges'],
    properties: {
      nodes: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['id', 'blockType', 'label'],
          properties: {
            id: { type: 'string', minLength: 1 },
            blockType: { type: 'string', enum: [...AI_BLOCK_TYPES] },
            label: { type: 'string' },
            activityId: activityIds.length > 0 ? { type: 'string', enum: activityIds } : { type: 'string' },
            condition: { type: 'string' },
            expression: { type: 'string' },
            message: { type: 'string' },
            variableName: { type: 'string' },
            variableExpression: { type: 'string' },
            itemVariable: { type: 'string' },
            collection: { type: 'string' },
            cases: {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: false,
                required: ['value', 'label'],
                properties: {
                  value: { type: 'string' },
                  label: { type: 'string' },
                },
              },
            },
          },
        },
      },
      edges: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['from', 'to'],
          properties: {
            from: { type: 'string' },
            to: { type: 'string' },
            handle: { type: 'string' },
          },
        },
      },
    },
  };
}

function buildSystemPrompt(activities: AiActivitySnapshot[]): string {
  const activityList = activities
    .map((activity) => {
      const params = activity.params
        .map((param) => `${param.name}${param.required && !param.hasDefault ? '*' : ''}`)
        .join(', ');
      return `- id="${activity.id}" category="${activity.category}": ${activity.description || activity.name}${
        params ? ` (params: ${params})` : ''
      }`;
    })
    .join('\n');

  return [
    'You convert a natural-language process description into an RPA diagram for RPAForge.',
    'Respond with ONLY a single JSON object (no markdown code fences, no commentary before or after) shaped like:',
    '{"nodes":[{"id":string,"blockType":string,"label":string,"activityId"?:string,"condition"?:string,"expression"?:string,"message"?:string,"variableName"?:string,"variableExpression"?:string,"itemVariable"?:string,"collection"?:string,"cases"?:[{"value":string,"label":string}]}],"edges":[{"from":string,"to":string,"handle"?:string}]}',
    `Allowed "blockType" values: ${AI_BLOCK_TYPES.join(', ')}.`,
    'Rules:',
    '- Exactly one node with blockType "start", and at least one "end" reachable from it.',
    '- Every node must be reachable from the start node by following edges.',
    '- blockType "activity" MUST set "activityId" to one of the ids listed below — never invent one. If no suitable activity exists, prefer a structural block instead.',
    '- Use "condition" for if/while, "expression" + "cases" for switch (edges.handle = "case-<value>" matching a case\'s "value", or "default"), "message" for throw, "variableName"+"variableExpression" for assign, "itemVariable"+"collection" for for-each.',
    '- edges.handle: "true"/"false" for if-branches, "body"/"next" for while, "error"/"finally" for try-catch, otherwise omit.',
    '- Never use blockType "parallel" or "sub-diagram-call" — not supported by this generator.',
    'Available activities (use exactly these ids):',
    activityList || '(none connected — use only structural block types; do not emit "activity" nodes)',
  ].join('\n');
}

function semanticErrors(diagram: AiDiagramJson, activities: AiActivitySnapshot[]): string[] {
  const errors: string[] = [];
  const activityIds = new Set(activities.map((activity) => activity.id));
  const nodeIds = new Set(diagram.nodes.map((node) => node.id));

  for (const node of diagram.nodes) {
    if (FORBIDDEN_BLOCK_TYPES.has(node.blockType)) {
      errors.push(`Node "${node.id}" uses unsupported blockType "${node.blockType}".`);
    }
    if (node.blockType === 'activity') {
      if (!node.activityId) {
        errors.push(`Node "${node.id}" has blockType "activity" but no activityId.`);
      } else if (!activityIds.has(node.activityId)) {
        errors.push(`Node "${node.id}" references unknown activityId "${node.activityId}".`);
      }
    }
  }

  for (const edge of diagram.edges) {
    if (!nodeIds.has(edge.from)) errors.push(`Edge references unknown source node "${edge.from}".`);
    if (!nodeIds.has(edge.to)) errors.push(`Edge references unknown target node "${edge.to}".`);
  }

  return errors;
}

function toMinimalRpaGraph(diagram: AiDiagramJson): { nodes: RpaNode[]; edges: RpaEdge[] } {
  const nodes: RpaNode[] = diagram.nodes.map((node) => ({
    id: node.id,
    data: { blockData: { type: node.blockType } },
  }));
  const edges: RpaEdge[] = diagram.edges.map((edge, index) => ({
    id: `ai-edge-${index}`,
    source: edge.from,
    target: edge.to,
    handle: edge.handle ?? 'output',
  }));
  return { nodes, edges };
}

function structuralErrors(diagram: AiDiagramJson): string[] {
  const { nodes, edges } = toMinimalRpaGraph(diagram);
  return validateDiagram(nodes, edges).map((error) => error.message);
}

function extractJsonText(text: string): string {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return fenced ? fenced[1].trim() : trimmed;
}

export interface GenerateDiagramRequest {
  prompt: string;
  activities: AiActivitySnapshot[];
}

export async function generateDiagram(
  provider: AiProvider,
  credentials: AiProviderCredentials,
  request: GenerateDiagramRequest,
  signal?: AbortSignal
): Promise<AiGenerateDiagramResult> {
  const jsonSchema = buildJsonSchema(request.activities);
  const validateShape = ajv.compile(jsonSchema);
  const systemPrompt = buildSystemPrompt(request.activities);

  let userPrompt = request.prompt;
  let lastRawText = '';
  let lastErrors: string[] = [];

  for (let attempt = 1; attempt <= MAX_RETRIES + 1; attempt++) {
    let rawText: string;
    try {
      rawText = await provider.generate(credentials, { systemPrompt, userPrompt, jsonSchema, signal });
    } catch (error) {
      return {
        success: false,
        errors: [error instanceof Error ? error.message : String(error)],
        attempts: attempt,
      };
    }
    lastRawText = rawText;

    let parsed: AiDiagramJson | null = null;
    try {
      parsed = JSON.parse(extractJsonText(rawText)) as AiDiagramJson;
    } catch {
      lastErrors = ['Response was not valid JSON.'];
      userPrompt = `${request.prompt}\n\nYour previous response was not valid JSON. Respond with ONLY the JSON object — no markdown fences, no commentary.`;
      continue;
    }

    if (!validateShape(parsed)) {
      lastErrors = (validateShape.errors ?? []).map((error) => `${error.instancePath || '(root)'} ${error.message}`);
      userPrompt = `${request.prompt}\n\nYour previous JSON response was invalid: ${lastErrors.join('; ')}. Fix it and respond with ONLY the corrected JSON object.`;
      continue;
    }

    const semantic = semanticErrors(parsed, request.activities);
    const structural = semantic.length === 0 ? structuralErrors(parsed) : [];
    const allErrors = [...semantic, ...structural];

    if (allErrors.length === 0) {
      return { success: true, diagram: parsed, attempts: attempt };
    }

    lastErrors = allErrors;
    userPrompt = `${request.prompt}\n\nYour previous JSON response had these problems: ${allErrors.join('; ')}. Fix them and respond with ONLY the corrected JSON object.`;
  }

  return { success: false, errors: lastErrors, rawText: lastRawText, attempts: MAX_RETRIES + 1 };
}
