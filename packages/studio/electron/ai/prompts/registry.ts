/**
 * Versioned prompt-template registry — Studio side (issue #904).
 *
 * Single source of truth for every LLM prompt template in the Electron
 * main process. Templates live as JSON files under `templates/` (bundled
 * at build time via JSON imports; no runtime filesystem access), are
 * named `<feature>.<purpose>` and versioned. Rendering is fail-closed:
 * unknown ids, missing or extra variables throw `PromptError` before any
 * provider call is made. Placeholders use mustache-style `{{name}}` so
 * JSON braces inside the prompt prose never collide with substitution.
 *
 * Conventions (mirror rpaforge/prompts on the Python side):
 * - One JSON file per template, file name == id, v1 templates render
 *   byte-identically to the inline strings they replaced (pinned by the
 *   eval baseline + golden hashes).
 * - The system template of a call is the prompt identity attached to the
 *   result and recorded in the security-audit events (promptId/promptVersion).
 */

import { createHash } from 'node:crypto';

import assistantRetryInvalidJson from './templates/assistant.retry_invalid_json.json';
import assistantRetryProblems from './templates/assistant.retry_problems.json';
import assistantRetryTruncated from './templates/assistant.retry_truncated.json';
import assistantRetryValidation from './templates/assistant.retry_validation.json';
import assistantSystem from './templates/assistant.system.json';
import diagramRetryInvalidJson from './templates/diagram.retry_invalid_json.json';
import diagramRetryProblems from './templates/diagram.retry_problems.json';
import diagramRetryTruncated from './templates/diagram.retry_truncated.json';
import diagramRetryValidation from './templates/diagram.retry_validation.json';
import diagramSystem from './templates/diagram.system.json';
import diagnosisRetryInvalidJson from './templates/diagnosis.retry_invalid_json.json';
import diagnosisRetryProblems from './templates/diagnosis.retry_problems.json';
import diagnosisRetryTruncated from './templates/diagnosis.retry_truncated.json';
import diagnosisRetryValidation from './templates/diagnosis.retry_validation.json';
import diagnosisSystem from './templates/diagnosis.system.json';
import paramFillSystem from './templates/param_fill.system.json';
import paramFillUser from './templates/param_fill.user.json';
import suggestionsSystem from './templates/suggestions.system.json';
import suggestionsUser from './templates/suggestions.user.json';

export interface PromptTemplate {
  readonly id: string;
  readonly version: number;
  readonly description: string;
  readonly variables: readonly string[];
  readonly template: string;
}

export interface RenderedPrompt {
  /** Rendered prompt text, ready for the provider call. */
  readonly text: string;
  /** Registry id — travels into telemetry/security events. */
  readonly promptId: string;
  /** Registry version — travels into telemetry/security events. */
  readonly promptVersion: number;
}

export class PromptError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PromptError';
  }
}

const PLACEHOLDER_RE = /\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g;

const REGISTRY: Record<string, PromptTemplate> = {
  'assistant.retry_invalid_json': assistantRetryInvalidJson,
  'assistant.retry_problems': assistantRetryProblems,
  'assistant.retry_truncated': assistantRetryTruncated,
  'assistant.retry_validation': assistantRetryValidation,
  'assistant.system': assistantSystem,
  'diagram.retry_invalid_json': diagramRetryInvalidJson,
  'diagram.retry_problems': diagramRetryProblems,
  'diagram.retry_truncated': diagramRetryTruncated,
  'diagram.retry_validation': diagramRetryValidation,
  'diagram.system': diagramSystem,
  'diagnosis.retry_invalid_json': diagnosisRetryInvalidJson,
  'diagnosis.retry_problems': diagnosisRetryProblems,
  'diagnosis.retry_truncated': diagnosisRetryTruncated,
  'diagnosis.retry_validation': diagnosisRetryValidation,
  'diagnosis.system': diagnosisSystem,
  'param_fill.system': paramFillSystem,
  'param_fill.user': paramFillUser,
  'suggestions.system': suggestionsSystem,
  'suggestions.user': suggestionsUser,
};

function validateTemplate(template: PromptTemplate): void {
  if (template.id.length === 0 || !/^[a-z0-9_.]+$/.test(template.id)) {
    throw new PromptError(`Invalid prompt id ${String(template.id)}`);
  }
  if (!Number.isInteger(template.version) || template.version < 1) {
    throw new PromptError(`Prompt '${template.id}' needs a positive integer version`);
  }
  if (typeof template.template !== 'string' || template.template.length === 0) {
    throw new PromptError(`Prompt '${template.id}' needs a non-empty template string`);
  }
  if (!Array.isArray(template.variables)) {
    throw new PromptError(`Prompt '${template.id}' variables must be a list of names`);
  }
  const declared = new Set(template.variables);
  if (declared.size !== template.variables.length) {
    throw new PromptError(`Prompt '${template.id}' declares duplicate variables`);
  }
  const placeholders = new Set(
    [...template.template.matchAll(PLACEHOLDER_RE)].map((match) => match[1])
  );
  for (const name of declared) {
    if (!/^[A-Za-z0-9_]+$/.test(name)) {
      throw new PromptError(`Prompt '${template.id}' has invalid variable name ${name}`);
    }
  }
  const same =
    placeholders.size === declared.size &&
    [...placeholders].every((name) => declared.has(name));
  if (!same) {
    throw new PromptError(
      `Prompt '${template.id}' placeholders ${[...placeholders].sort()} do not ` +
        `match declared variables ${[...declared].sort()}`
    );
  }
}

// Fail closed at load: a malformed registry must never reach a provider call.
for (const template of Object.values(REGISTRY)) {
  validateTemplate(template);
}

export function getTemplate(promptId: string): PromptTemplate {
  const template = REGISTRY[promptId];
  if (!template) {
    throw new PromptError(`Unknown prompt id '${promptId}'`);
  }
  return template;
}

export function templateIds(): string[] {
  return Object.keys(REGISTRY).sort();
}

export function renderPrompt(
  promptId: string,
  variables: Readonly<Record<string, string>> = {}
): RenderedPrompt {
  const template = getTemplate(promptId);
  const declared = new Set(template.variables);
  const provided = new Set(Object.keys(variables));
  const missing = [...declared].filter((name) => !provided.has(name));
  const extra = [...provided].filter((name) => !declared.has(name));
  if (missing.length > 0 || extra.length > 0) {
    const details: string[] = [];
    if (missing.length > 0) details.push(`missing ${missing.sort()}`);
    if (extra.length > 0) details.push(`unexpected ${extra.sort()}`);
    throw new PromptError(`Prompt '${promptId}' render: ${details.join('; ')}`);
  }
  const text = template.template.replace(PLACEHOLDER_RE, (_match, name: string) =>
    String(variables[name])
  );
  return { text, promptId: template.id, promptVersion: template.version };
}

/** sha256 of the raw template text — the prompt-CI baseline gate. */
export function templateDigest(promptId: string): string {
  return createHash('sha256').update(getTemplate(promptId).template, 'utf8').digest('hex');
}
