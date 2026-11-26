/**
 * AI Assistant chat (issue #903) — live Studio path, main process only.
 *
 * Mirrors diagnoseFailure.ts: consent is enforced by the IPC handler,
 * redactSensitive() runs over the whole request before anything leaves
 * the app, and the model answers with one JSON object {answer, edits}
 * validated fail-closed against the diagram node ids (one retry with the
 * validation errors fed back). Multi-turn history is flattened into the
 * user prompt — no provider accepts a messages array (Gemini already
 * merges system+user, so this is consistent across adapters).
 *
 * Prompts come from the versioned prompt registry (issue #904); the
 * rendered prompt identity is attached to the result for telemetry.
 */

import Ajv from 'ajv';
import type { AiProvider, AiProviderCredentials } from './providers';
import { renderPrompt } from './prompts/registry';
import { redactSensitive } from './privacy';
import type {
  AiAssistantChatRequest,
  AiAssistantChatResult,
  AssistantMessage,
  FixProposal,
} from '../../src/types/ai';

const ajv = new Ajv({ allErrors: true });

const MAX_RETRIES = 2;

/**
 * Key=value shaped secret scrub for free text (mirrors the core kv
 * pattern from rpaforge/core/secrets.py): "api_key: ..." inside prose
 * is masked even though field-name/value-pattern redaction above does
 * not cover it.
 */
const KV_SECRET_PATTERN =
  /(?:(?:password|passwd|pwd|secret|api[_-]?key|apikey|access[_-]?key|private[_-]?key|auth[_-]?token|access[_-]?token|authorization|credentials?)\s*[:=]\s*)(?:"[^"]{2,}"|'[^']{2,}'|[^\s,;&{}"'()<>]{2,})/gi;

function scrubSecretShapedText(text: string): string {
  return text.replace(KV_SECRET_PATTERN, (match, group1) => `${group1}[REDACTED]`);
}

function scrubMessages(messages: AssistantMessage[]): AssistantMessage[] {
  return messages.map((message) => ({
    ...message,
    content: scrubSecretShapedText(message.content),
  }));
}

const DIAGRAM_EDITS_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['answer', 'edits'],
  properties: {
    answer: { type: 'string', minLength: 1 },
    edits: {
      type: 'array',
      items: {
        type: 'object',
        required: ['type'],
        properties: {
          type: {
            enum: ['param_change', 'selector_update', 'wrap_retry', 'wrap_trycatch', 'insert_precondition'],
          },
          node_id: { type: 'string' },
          param: { type: 'string' },
          new_value: {},
          new_selector: { type: 'string' },
          retry_count: { type: 'number' },
          retry_interval_s: { type: 'number' },
          exception_type: { type: 'string' },
          after_node_id: { type: 'string' },
          library: { type: 'string' },
          activity: { type: 'string' },
          args: { type: 'object' },
          label: { type: 'string' },
        },
      },
    },
  },
} as const;

const EDIT_REQUIRED_FIELDS: Record<string, string[]> = {
  param_change: ['node_id', 'param'],
  selector_update: ['node_id', 'new_selector'],
  wrap_retry: ['node_id'],
  wrap_trycatch: ['node_id'],
  insert_precondition: ['after_node_id', 'library', 'activity'],
};

/**
 * Compact per-node summary line: id + label + type + param KEY names.
 * Param values are deliberately excluded (privacy + token budget).
 */
function summarizeNode(node: {
  id: string;
  label: string;
  type: string;
  paramKeys?: string[];
}): string {
  const params = node.paramKeys?.length
    ? ` params: ${node.paramKeys.join(', ')}`
    : '';
  return `- id=${node.id} type=${node.type} label="${node.label}"${params}`;
}

/** Flatten the conversation into one user prompt with explicit turns. */
export function flattenHistory(
  history: AssistantMessage[],
  userMessage: string
): string {
  const turns = history.map(
    (message) => `${message.role === 'user' ? 'User' : 'Assistant'}: ${message.content}`
  );
  const lines = [...turns, `User: ${userMessage}`].join('\n');
  return turns.length > 0 ? `Conversation so far:\n${lines}` : lines;
}

function extractJsonText(text: string): string {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return fenced ? fenced[1].trim() : trimmed;
}

/** Fail-closed validation of one model answer against the diagram node ids. */
export function validateAssistantAnswer(
  parsed: unknown,
  diagramNodeIds: Set<string>
): { ok: true; answer: string; edits: FixProposal[] } | { ok: false; errors: string[] } {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ok: false, errors: ['Response must be a JSON object.'] };
  }
  const raw = parsed as Record<string, unknown>;
  const errors: string[] = [];
  const answer = raw.answer;
  if (typeof answer !== 'string' || !answer.trim()) {
    errors.push('answer must be a non-empty string.');
  }
  const editsRaw = raw.edits;
  if (!Array.isArray(editsRaw)) {
    errors.push('edits must be an array.');
    return { ok: false, errors };
  }
  const edits: FixProposal[] = [];
  editsRaw.forEach((candidate, index) => {
    if (!candidate || typeof candidate !== 'object') {
      errors.push(`edits[${index}] must be an object.`);
      return;
    }
    const entry = candidate as Record<string, unknown>;
    const type = entry.type;
    if (typeof type !== 'string' || !(type in EDIT_REQUIRED_FIELDS)) {
      errors.push(`edits[${index}].type "${String(type)}" is not a known edit type.`);
      return;
    }
    for (const field of EDIT_REQUIRED_FIELDS[type]) {
      const value = entry[field];
      if (value === undefined || value === null || value === '') {
        errors.push(`edits[${index}] (${type}) is missing "${field}".`);
        return;
      }
    }
    const idField = type === 'insert_precondition' ? 'after_node_id' : 'node_id';
    const nodeId = entry[idField];
    if (typeof nodeId !== 'string' || !diagramNodeIds.has(nodeId)) {
      errors.push(
        `edits[${index}] (${type}) references unknown node id "${String(nodeId)}".`
      );
      return;
    }
    edits.push(entry as unknown as FixProposal);
  });
  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, answer: String(answer).trim(), edits };
}

export async function assistantChat(
  provider: AiProvider,
  credentials: AiProviderCredentials,
  request: AiAssistantChatRequest,
  signal?: AbortSignal,
  onDelta?: (delta: string) => void
): Promise<AiAssistantChatResult> {
  // Defense in depth: the panel already sends compact, value-free context,
  // and this sweep masks anything secret-shaped that slipped into the
  // history or the last error.
  const { value: safeRequest } = redactSensitive(request);
  safeRequest.history = scrubMessages(safeRequest.history);
  safeRequest.userMessage = scrubSecretShapedText(safeRequest.userMessage);
  if (safeRequest.context.lastError) {
    safeRequest.context.lastError = scrubSecretShapedText(safeRequest.context.lastError);
  }
  const contextLines = safeRequest.context.diagramNodes.map(summarizeNode);
  const selectedLine = safeRequest.context.selectedNodeId
    ? `Selected node: ${safeRequest.context.selectedNodeId}`
    : 'No node selected.';
  const errorLine = safeRequest.context.lastError
    ? `Last run error: ${safeRequest.context.lastError}`
    : '';
  const userPrompt = [
    'Diagram:',
    ...(contextLines.length > 0 ? contextLines : ['(empty diagram)']),
    selectedLine,
    ...(errorLine ? [errorLine] : []),
    '',
    flattenHistory(safeRequest.history, safeRequest.userMessage),
  ].join('\n');

  const diagramNodeIds = new Set(
    (safeRequest.context.diagramNodes ?? []).map((node) => node.id)
  );
  const systemPrompt = renderPrompt('assistant.system');
  const validate = ajv.compile(DIAGRAM_EDITS_JSON_SCHEMA);

  let userMessage = userPrompt;
  let lastErrors: string[] = [];
  let lastTokenUsage: AiAssistantChatResult['tokenUsage'];

  for (let attempt = 1; attempt <= MAX_RETRIES + 1; attempt++) {
    let rawText: string;
    let truncated: boolean;
    try {
      const result = await provider.generate(credentials, {
        systemPrompt: systemPrompt.text,
        userPrompt: userMessage,
        jsonSchema: DIAGRAM_EDITS_JSON_SCHEMA as unknown as Record<string, unknown>,
        signal,
        jsonMode: true,
        onDelta,
      });
      rawText = result.text;
      truncated = result.truncated;
      if (result.tokenUsage) lastTokenUsage = result.tokenUsage;
    } catch (error) {
      if (signal?.aborted) {
        return { success: false, errors: ['cancelled'], attempts: attempt };
      }
      return {
        success: false,
        errors: [error instanceof Error ? error.message : String(error)],
        attempts: attempt,
      };
    }

    if (truncated) {
      lastErrors = ['Response was truncated before completing.'];
      userMessage = renderPrompt('assistant.retry_truncated', { prompt: userPrompt }).text;
      continue;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(extractJsonText(rawText));
    } catch {
      lastErrors = ['Response was not valid JSON.'];
      userMessage = renderPrompt('assistant.retry_invalid_json', { prompt: userPrompt }).text;
      continue;
    }

    if (!validate(parsed)) {
      lastErrors = (validate.errors ?? []).map(
        (error) => `${error.instancePath || '(root)'} ${error.message}`
      );
      userMessage = renderPrompt('assistant.retry_validation', {
        prompt: userPrompt,
        errors: lastErrors.join('; '),
      }).text;
      continue;
    }

    const outcome = validateAssistantAnswer(parsed, diagramNodeIds);
    if (outcome.ok) {
      return {
        success: true,
        answer: outcome.answer,
        edits: outcome.edits,
        attempts: attempt,
        tokenUsage: lastTokenUsage,
        prompt: { id: systemPrompt.promptId, version: systemPrompt.promptVersion },
      };
    }
    lastErrors = outcome.errors;
    userMessage = renderPrompt('assistant.retry_problems', {
      prompt: userPrompt,
      errors: lastErrors.join('; '),
    }).text;
  }

  return { success: false, errors: lastErrors, attempts: MAX_RETRIES + 1 };
}
