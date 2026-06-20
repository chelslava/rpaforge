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
  type AiBlockType,
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
          required: ['id', 'blockType'],
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
            activityParams: {
              type: 'object',
              additionalProperties: { type: ['string', 'number', 'boolean'] },
            },
            outputVariable: { type: 'string' },
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
        .map((param) => `${param.name}:${param.type}${param.required && !param.hasDefault ? '*' : ''}`)
        .join(', ');
      const outputTag = activity.hasOutput ? ' `[has output]`' : '';
      return `- \`${activity.id}\` (${activity.category})${outputTag} — ${activity.description || activity.name}${
        params ? ` · params: ${params}` : ''
      }`;
    })
    .join('\n');

  return `# Task

Convert a natural-language process description into an RPA diagram for RPAForge: a directed graph of typed blocks (\`nodes\`) connected by \`edges\`. An existing code generator turns this graph into Python — you only produce the graph.

## Output format — strict

Respond with **only** a single JSON object. No markdown code fences, no commentary before or after — the response must start with \`{\` and end with \`}\`.

\`\`\`json
{
  "nodes": [
    {
      "id": "string",
      "blockType": "string",
      "label": "string, optional",
      "activityId": "string, only for blockType=activity",
      "activityParams": { "paramName": "value" },
      "outputVariable": "string",
      "condition": "string",
      "expression": "string",
      "message": "string",
      "variableName": "string",
      "variableExpression": "string",
      "itemVariable": "string",
      "collection": "string",
      "cases": [{ "value": "string", "label": "string" }]
    }
  ],
  "edges": [{ "from": "string", "to": "string", "handle": "string, optional" }]
}
\`\`\`

**Keep it small.** Fewer nodes, short ids (\`"n1"\`), skip \`label\` when the blockType/other fields already make the purpose obvious. The response has a hard length limit — an overly detailed diagram gets cut off mid-JSON and rejected entirely.

## Block types

Allowed \`blockType\` values: ${AI_BLOCK_TYPES.join(', ')}.

**Never** use \`parallel\` or \`sub-diagram-call\` — not supported by this generator.

## Structural rules

- Exactly one node with \`blockType: "start"\`, and at least one \`"end"\` reachable from it.
- Every node must be reachable from \`start\` by following edges.
- Branching (if/else, try/catch) is expressed as **edges with different handles out of one node** — never as separate "else" or "catch" nodes. There is no \`else\`/\`catch\` blockType.

## Edge handles — exact values only

\`edges[].handle\` must be one of the values below for the edge's **source** node's blockType — nothing else:

| Source blockType | Valid \`handle\` values |
|---|---|
| \`if\` | \`true\`, \`false\` (both required) |
| \`while\` | \`body\` (loop iteration), \`next\` (loop exit) |
| \`for-each\` | \`body\` (per item), \`next\` (after the loop) |
| \`switch\` | \`case-1\`, \`case-2\`, ... (1-based, matching \`cases\` order), or \`default\` |
| \`try-catch\` | \`error\` for the exception path; omit for the success path |
| \`start\`, \`assign\`, \`activity\`, \`retry-scope\` | omit entirely (single output port) |
| \`end\`, \`throw\` | **no output port** — never use as an edge's \`from\` |

## Field usage by blockType

- \`if\` / \`while\` → \`condition\`
- \`switch\` → \`expression\` + \`cases\`
- \`throw\` → \`message\`
- \`assign\` → \`variableName\` + \`variableExpression\`
- \`for-each\` → \`itemVariable\` + \`collection\`

## Activities

- \`blockType: "activity"\` MUST set \`activityId\` to **exactly** one id from the list below, copied verbatim. Never invent one, never guess a plausible-looking name even if it seems obvious — if nothing listed fits, use a structural block instead.
- \`activityParams\` configures that activity's own parameters: an object mapping the exact param name to a value. Param types are shown as \`name:type\` below; match the value's JS type (\`boolean\` params → \`true\`/\`false\`, \`integer\`/\`float\` params → a number, everything else → a string). Params marked \`*\` are required with no default — you must set them. Omit params you don't need.
- \`outputVariable\` captures an activity's return value into a variable, but **only** for activities tagged \`[has output]\` below. Once set, reuse that name as a plain identifier in a later node's \`condition\`/\`expression\`/\`collection\`/\`activityParams\` (e.g. \`outputVariable: "orders"\` lets a later \`for-each\` use \`"collection": "orders"\`). Never set \`outputVariable\` on an activity that isn't tagged \`[has output]\`.

Available activities (use exactly these ids):
${activityList || '(none connected — use only structural block types; do not emit "activity" nodes)'}

## Example

A minimal try/catch wrapping a branch, showing the handle conventions above:

\`\`\`json
{
  "nodes": [
    {"id": "n1", "blockType": "start"},
    {"id": "n2", "blockType": "try-catch"},
    {"id": "n3", "blockType": "if", "condition": "x > 0"},
    {"id": "n4", "blockType": "assign", "variableName": "status", "variableExpression": "'ok'"},
    {"id": "n5", "blockType": "end"}
  ],
  "edges": [
    {"from": "n1", "to": "n2"},
    {"from": "n2", "to": "n3"},
    {"from": "n2", "to": "n5", "handle": "error"},
    {"from": "n3", "to": "n4", "handle": "true"},
    {"from": "n3", "to": "n5", "handle": "false"},
    {"from": "n4", "to": "n5"}
  ]
}
\`\`\``;
}

// Mirrors the real port ids each block type renders (BLOCK_PORT_CONFIGS /
// getTryCatchPortConfig in src/types/blocks.ts). An edge whose handle isn't
// in this set fails to attach in the renderer (React Flow error #008)
// instead of erroring loudly, so it must be caught here, before the
// renderer ever sees it. 'switch' is handled separately (its handles are
// dynamic, derived from the node's own "cases" array). 'end'/'throw' have
// no output port at all — they may never be an edge's source.
const FIXED_HANDLES_BY_BLOCK_TYPE: Partial<Record<AiBlockType, string[]>> = {
  if: ['true', 'false'],
  while: ['body', 'next'],
  'for-each': ['body', 'next'],
  'try-catch': ['error', 'output'],
  start: ['output'],
  assign: ['output'],
  activity: ['output'],
  'retry-scope': ['output'],
};
const NO_OUTPUT_BLOCK_TYPES = new Set<AiBlockType>(['end', 'throw']);

function activityParamErrors(node: AiDiagramJson['nodes'][number], activity: AiActivitySnapshot): string[] {
  const errors: string[] = [];
  const paramsByName = new Map(activity.params.map((param) => [param.name, param]));
  const supplied = node.activityParams ?? {};

  for (const [paramName, value] of Object.entries(supplied)) {
    const param = paramsByName.get(paramName);
    if (!param) {
      errors.push(
        `Node "${node.id}" sets activityParams["${paramName}"], but activity "${activity.id}" has no such param. Valid params: ${[...paramsByName.keys()].join(', ') || '(none)'}.`
      );
      continue;
    }
    if (param.type === 'boolean' && typeof value !== 'boolean') {
      errors.push(`Node "${node.id}" activityParams["${paramName}"] must be a boolean (param type is "boolean").`);
    } else if ((param.type === 'integer' || param.type === 'float') && typeof value !== 'number') {
      errors.push(`Node "${node.id}" activityParams["${paramName}"] must be a number (param type is "${param.type}").`);
    }
  }

  for (const param of activity.params) {
    if (param.required && !param.hasDefault && !(param.name in supplied)) {
      errors.push(
        `Node "${node.id}" is missing required activityParams["${param.name}"] for activity "${activity.id}" (no default value exists).`
      );
    }
  }

  if (node.outputVariable && !activity.hasOutput) {
    errors.push(
      `Node "${node.id}" sets outputVariable, but activity "${activity.id}" has no output to capture.`
    );
  }

  return errors;
}

function semanticErrors(diagram: AiDiagramJson, activities: AiActivitySnapshot[]): string[] {
  const errors: string[] = [];
  const activitiesById = new Map(activities.map((activity) => [activity.id, activity]));
  const nodesById = new Map(diagram.nodes.map((node) => [node.id, node]));

  for (const node of diagram.nodes) {
    if (FORBIDDEN_BLOCK_TYPES.has(node.blockType)) {
      errors.push(`Node "${node.id}" uses unsupported blockType "${node.blockType}".`);
    }
    if (node.blockType === 'activity') {
      if (!node.activityId) {
        errors.push(`Node "${node.id}" has blockType "activity" but no activityId.`);
      } else {
        const activity = activitiesById.get(node.activityId);
        if (!activity) {
          errors.push(`Node "${node.id}" references unknown activityId "${node.activityId}".`);
        } else {
          errors.push(...activityParamErrors(node, activity));
        }
      }
    }
  }

  for (const edge of diagram.edges) {
    const sourceNode = nodesById.get(edge.from);
    if (!sourceNode) {
      errors.push(`Edge references unknown source node "${edge.from}".`);
    }
    if (!nodesById.has(edge.to)) {
      errors.push(`Edge references unknown target node "${edge.to}".`);
    }
    if (!sourceNode) continue;

    if (NO_OUTPUT_BLOCK_TYPES.has(sourceNode.blockType)) {
      errors.push(
        `Edge from "${edge.from}" is invalid — blockType "${sourceNode.blockType}" has no output port.`
      );
      continue;
    }

    // Matches the same fallback applied downstream when building the actual
    // canvas edge (aiDiagramBuilder.ts / createConnection): an omitted
    // handle becomes "output". For branching block types "output" is not a
    // real port either, so this also correctly flags a missing handle on
    // an if/while/for-each/switch edge, not just a wrong one.
    const handle = edge.handle ?? 'output';

    const validHandles =
      sourceNode.blockType === 'switch'
        ? [...(sourceNode.cases ?? []).map((_, index) => `case-${index + 1}`), 'default']
        : FIXED_HANDLES_BY_BLOCK_TYPE[sourceNode.blockType];

    if (validHandles && !validHandles.includes(handle)) {
      errors.push(
        `Edge from "${edge.from}" uses handle "${edge.handle ?? '(omitted)'}", but blockType "${sourceNode.blockType}" only supports: ${validHandles.join(', ')}.`
      );
    }
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
    let truncated: boolean;
    try {
      const result = await provider.generate(credentials, { systemPrompt, userPrompt, jsonSchema, signal });
      rawText = result.text;
      truncated = result.truncated;
    } catch (error) {
      return {
        success: false,
        errors: [error instanceof Error ? error.message : String(error)],
        attempts: attempt,
      };
    }
    lastRawText = rawText;

    if (truncated) {
      // The JSON is necessarily incomplete — don't even try to parse it,
      // just ask for a smaller diagram (a generic "invalid JSON" retry
      // message wouldn't tell the model WHY, and it would likely produce
      // an equally long response again).
      lastErrors = ['Response was truncated before completing (too long for the model\'s output limit).'];
      userPrompt = `${request.prompt}\n\nYour previous response was cut off because it was too long. Produce a SIGNIFICANTLY SHORTER diagram: fewer nodes, short ids, and omit "label" fields. Respond with ONLY the JSON object.`;
      continue;
    }

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
