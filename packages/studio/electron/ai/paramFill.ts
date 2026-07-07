/**
 * AI param auto-fill module for RPAForge Studio.
 * Suggests parameter values for activities based on process context.
 */

import type { AiProvider, AiProviderCredentials } from './providers';
import type {
  AiAutoFillRequest,
  AiAutoFillResult,
} from '../../src/types/ai';
import { getProvider } from './providers';
import { OpenAiCompatibleProvider } from './providers';

/**
 * Build a prompt for AI param auto-fill suggestions.
 * Excludes sensitive data (passwords, API keys) from context.
 */
function buildPrompt(request: AiAutoFillRequest): string {
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

  return `Suggest parameter values for activity "${request.activityName}" (category: ${request.activityCategory}) in a process context.

Available parameters:
${paramsList}

Current process variables (excluding passwords/API keys):
${variablesList || '(none)'}

Previous activities in the process:
${previousActivitiesList || '(none)'}

Please return ONLY a JSON object mapping parameter names to suggested values. Do not include explanations, markdown formatting, or any other text.

Example output format:
{
  "param1": "suggested value",
  "param2": "another value"
}

Return only the JSON object, nothing else.`;
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
    for (const [key, value] of Object.entries(parsed)) {
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
    const prompt = buildPrompt(request);
    const jsonSchema = {
      type: 'object',
      additionalProperties: false,
      propertyNames: { type: 'string' },
      patternProperties: { '^.*$': { type: 'string' } },
    };

    const options = {
      systemPrompt: 'You are a helpful assistant that suggests parameter values for RPA automation activities.',
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
