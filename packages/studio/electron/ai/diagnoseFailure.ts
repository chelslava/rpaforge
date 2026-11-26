/**
 * AI failure diagnosis (issue #906) — live Studio path.
 *
 * Mirrors generateDiagram.ts: provider call happens in the main process
 * behind consent ('diagnose' feature) with redactSensitive() applied to
 * everything before it reaches the provider. The model answers with one
 * JSON object (root cause + typed fix proposals); parsing/validation is
 * fail-closed and a rejected answer is retried once with the validation
 * errors fed back.
 *
 * Prompts come from the versioned prompt registry (issue #904); the
 * rendered prompt identity is attached to the result for telemetry.
 */

import Ajv from 'ajv';
import type { AiProvider, AiProviderCredentials } from './providers';
import { renderPrompt } from './prompts/registry';
import { redactSensitive } from './privacy';
import type {
  AiDiagnoseFailureRequest,
  AiDiagnoseFailureResult,
  DiagnosisResult,
  FixProposal,
} from '../../src/types/ai';

const ajv = new Ajv({ allErrors: true });

const MAX_RETRIES = 2;

const DIAGNOSIS_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['root_cause', 'confidence', 'explanation', 'proposals'],
  properties: {
    root_cause: { type: 'string', minLength: 1 },
    confidence: { enum: ['high', 'medium', 'low'] },
    explanation: { type: 'string' },
    proposals: {
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

const PROPOSAL_REQUIRED_FIELDS: Record<string, string[]> = {
  param_change: ['node_id', 'param'],
  selector_update: ['node_id', 'new_selector'],
  wrap_retry: ['node_id'],
  wrap_trycatch: ['node_id'],
  insert_precondition: ['after_node_id', 'library', 'activity'],
};

/** Pure bundle preparation: trims the run record and builds the user prompt payload. */
export function buildDiagnosisBundle(
  request: AiDiagnoseFailureRequest,
  maxSteps = 15
): Record<string, unknown> {
  const steps = request.runRecord.steps ?? [];
  return {
    process_name: request.runRecord.process_name ?? null,
    run_id: request.runRecord.run_id ?? null,
    status: request.runRecord.status ?? 'failed',
    error: request.runRecord.error ?? null,
    steps: steps.slice(-maxSteps),
    diagram: request.diagram,
  };
}

function extractJsonText(text: string): string {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return fenced ? fenced[1].trim() : trimmed;
}

/** Fail-closed validation of one model answer against the diagram node ids. */
export function validateDiagnosis(
  parsed: unknown,
  diagramNodeIds: Set<string>
): { ok: true; diagnosis: DiagnosisResult } | { ok: false; errors: string[] } {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ok: false, errors: ['Response must be a JSON object.'] };
  }
  const raw = parsed as Record<string, unknown>;
  const errors: string[] = [];
  const rootCause = raw.root_cause;
  if (typeof rootCause !== 'string' || !rootCause.trim()) {
    errors.push('root_cause must be a non-empty string.');
  }
  const confidence = raw.confidence;
  if (confidence !== 'high' && confidence !== 'medium' && confidence !== 'low') {
    errors.push('confidence must be high|medium|low.');
  }
  if (typeof raw.explanation !== 'string') {
    errors.push('explanation must be a string.');
  }
  if (!Array.isArray(raw.proposals)) {
    errors.push('proposals must be an array.');
    return { ok: false, errors };
  }
  const proposals: FixProposal[] = [];
  raw.proposals.forEach((candidate, index) => {
    if (!candidate || typeof candidate !== 'object') {
      errors.push(`proposals[${index}] must be an object.`);
      return;
    }
    const entry = candidate as Record<string, unknown>;
    const type = entry.type;
    if (typeof type !== 'string' || !(type in PROPOSAL_REQUIRED_FIELDS)) {
      errors.push(`proposals[${index}].type "${String(type)}" is not a known proposal type.`);
      return;
    }
    for (const field of PROPOSAL_REQUIRED_FIELDS[type]) {
      const value = entry[field];
      if (value === undefined || value === null || value === '') {
        errors.push(`proposals[${index}] (${type}) is missing "${field}".`);
        return;
      }
    }
    const idField = type === 'insert_precondition' ? 'after_node_id' : 'node_id';
    const nodeId = entry[idField];
    if (typeof nodeId !== 'string' || !diagramNodeIds.has(nodeId)) {
      errors.push(
        `proposals[${index}] (${type}) references unknown node id "${String(nodeId)}".`
      );
      return;
    }
    proposals.push(entry as unknown as FixProposal);
  });
  if (errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    diagnosis: {
      root_cause: String(rootCause).trim(),
      confidence: confidence as DiagnosisResult['confidence'],
      explanation: String(raw.explanation),
      proposals,
    },
  };
}

export async function diagnoseFailure(
  provider: AiProvider,
  credentials: AiProviderCredentials,
  request: AiDiagnoseFailureRequest,
  signal?: AbortSignal
): Promise<AiDiagnoseFailureResult> {
  // Defense in depth: core already masks artifacts at write/emit time;
  // redactSensitive sweeps the whole request before anything leaves the app.
  const { value: safeRequest } = redactSensitive(request);
  const bundle = buildDiagnosisBundle(safeRequest);
  const diagramNodeIds = new Set(
    (safeRequest.diagram?.nodes ?? []).map((node) => node.id)
  );
  const userPrompt = JSON.stringify(bundle);
  const systemPrompt = renderPrompt('diagnosis.system');
  const validate = ajv.compile(DIAGNOSIS_JSON_SCHEMA);

  let userMessage = userPrompt;
  let lastErrors: string[] = [];
  let lastTokenUsage: AiDiagnoseFailureResult['tokenUsage'];

  for (let attempt = 1; attempt <= MAX_RETRIES + 1; attempt++) {
    let rawText: string;
    let truncated: boolean;
    try {
      const result = await provider.generate(credentials, {
        systemPrompt: systemPrompt.text,
        userPrompt: userMessage,
        jsonSchema: DIAGNOSIS_JSON_SCHEMA as unknown as Record<string, unknown>,
        signal,
        jsonMode: true,
      });      rawText = result.text;
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
      userMessage = renderPrompt('diagnosis.retry_truncated', { prompt: userPrompt }).text;
      continue;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(extractJsonText(rawText));
    } catch {
      lastErrors = ['Response was not valid JSON.'];
      userMessage = renderPrompt('diagnosis.retry_invalid_json', { prompt: userPrompt }).text;
      continue;
    }

    if (!validate(parsed)) {
      lastErrors = (validate.errors ?? []).map(
        (error) => `${error.instancePath || '(root)'} ${error.message}`
      );
      userMessage = renderPrompt('diagnosis.retry_validation', {
        prompt: userPrompt,
        errors: lastErrors.join('; '),
      }).text;
      continue;
    }

    const outcome = validateDiagnosis(parsed, diagramNodeIds);
    if (outcome.ok) {
      return {
        success: true,
        diagnosis: outcome.diagnosis,
        attempts: attempt,
        tokenUsage: lastTokenUsage,
        prompt: { id: systemPrompt.promptId, version: systemPrompt.promptVersion },
      };
    }
    lastErrors = outcome.errors;
    userMessage = renderPrompt('diagnosis.retry_problems', {
      prompt: userPrompt,
      errors: lastErrors.join('; '),
    }).text;
  }

  return { success: false, errors: lastErrors, attempts: MAX_RETRIES + 1 };
}
