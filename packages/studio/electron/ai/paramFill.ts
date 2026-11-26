/**
 * AI param auto-fill module for RPAForge Studio.
 * Suggests parameter values for activities based on process context.
 */

import type { AiProviderCredentials } from './providers';
import type {
  AiAutoFillRequest,
  AiAutoFillResult,
} from '../../src/types/ai';
import { OpenAiCompatibleProvider } from './providers';
import { renderPrompt } from './prompts/registry';
import { redactSensitive } from './privacy';

/**
 * Build a prompt for AI param auto-fill suggestions.
 * Excludes sensitive data (passwords, API keys) from context.
 */
export function buildPrompt(request: AiAutoFillRequest): string {
  request = redactSensitive(request).value;
  const paramsList = request.activityParams
    .map(
      (param) =>
        `- ${param.name} (${param.type}, ${param.required ? 'required' : 'optional'}${
          param.defaultValue ? `, default: ${param.defaultValue}` : ''
        })`
    )
    .join('\n');

  const variablesList = request.variables
    .filter((v) => v.type !== 'secret')
    .map((v) => `- ${v.name} (${v.type})${v.value ? ` = ${v.value}` : ''}`)
    .join('\n');

  const previousActivitiesList = request.previousActivities
    .map(
      (act) =>
        `- ${act.name} (id: ${act.activityId})${act.outputs.length > 0 ? ` -> outputs: ${act.outputs.join(', ')}` : ''}`
    )
    .join('\n');

  return renderPrompt('param_fill.user', {
    activityName: request.activityName,
    activityCategory: request.activityCategory,
    paramsList,
    variablesList: variablesList || '(none)',
    previousActivitiesList: previousActivitiesList || '(none)',
  }).text;
}

/**
 * Validate AI response is a valid JSON object with string values.
 */
function validateResponse(text: string): Record<string, string> | null {
  try {
    const parsed = JSON.parse(text);
    if (typeof parsed !== 'object' || parsed === null) {
      return null;
    }
    // Validate all values are strings
    for (const [, value] of Object.entries(parsed)) {
      if (typeof value !== 'string') {
        return null;
      }
    }
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Generate AI suggestions for activity parameters based on process context.
 * Returns an empty object if no provider is configured or suggestion fails.
 */
export async function autoFillParams(
  request: AiAutoFillRequest,
  credentials?: AiProviderCredentials
): Promise<AiAutoFillResult> {
  if (!credentials) {
    return { suggestions: {} };
  }

  try {
    const { value: safeRequest } = redactSensitive(request);
    const prompt = buildPrompt(safeRequest);
    const jsonSchema = {
      type: 'object',
      additionalProperties: false,
      propertyNames: { type: 'string' },
      patternProperties: { '^.*$': { type: 'string' } },
    };

    const systemPrompt = renderPrompt('param_fill.system');
    const options = {
      systemPrompt: systemPrompt.text,
      userPrompt: prompt,
      jsonSchema,
      jsonMode: true,
    };

    const provider = new OpenAiCompatibleProvider();
    const result = await provider.generate(credentials, options);

    const validated = validateResponse(result.text);
    if (validated) {
      return { suggestions: validated };
    }

    return { suggestions: {} };
  } catch (error) {
    return { suggestions: {} };
  }
}

/**
 * Get auto-fill suggestions for activity parameters using the configured provider.
 */
export async function getParamSuggestions(
  request: AiAutoFillRequest,
  getCredentials: (providerId: string) => { apiKey: string; baseUrl?: string; model?: string } | undefined
): Promise<AiAutoFillResult> {
  // Try common provider IDs that might be configured
  const providerIds = ['openai-compatible', 'anthropic', 'ollama', 'groq', 'gemini', 'openrouter', 'mistral'];
  
  for (const providerId of providerIds) {
    const credentials = getCredentials(providerId);
    if (credentials) {
      return autoFillParams(request, credentials);
    }
  }

  return { suggestions: {} };
}
