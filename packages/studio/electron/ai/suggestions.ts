/**
 * AI suggestions for RPAForge Studio (Issue #592).
 * Context-aware activity suggestions that appear when a user selects a node.
 * Generates "What's Next?" suggestions based on current node, graph position,
 * previous activities, and common RPA patterns.
 */

import type { AiProvider, AiProviderCredentials } from './providers';
import type { AiActivitySnapshot } from '../../src/types/ai';
import { renderPrompt } from './prompts/registry';
import { redactSensitive } from './privacy';

/**
 * Context for generating suggestions - limited to activity metadata only
 * (no raw process data sent to AI for privacy/security)
 */
export interface SuggestionContext {
  selectedActivityId: string;
  selectedActivityCategory: string;
  processActivities: { id: string; name: string; category: string }[];
  variables: { name: string; type: string }[];
}

/**
 * Suggestion result item
 */
export interface SuggestionItem {
  activityId: string;
  label: string;
  reason: string; // Short explanation for UI tooltip
}

/**
 * Render the registry system prompt for one suggestion request.
 */
function buildSuggestionPrompt(context: SuggestionContext): { text: string; promptId: string; promptVersion: number } {
  const { selectedActivityId, selectedActivityCategory, processActivities, variables } = context;

  const processList = processActivities
    .map((activity) => {
      return `- \`${activity.id}\` (${activity.category}) — ${activity.name}`;
    })
    .join('\n');

  const variableList = variables.length > 0
    ? `\n\n## Variables\n\nAvailable variables (from previous activities):\n${variables.map(v => `- \`${v.name}\` (${v.type})`).join('\n')}`
    : '';

  return renderPrompt('suggestions.system', {
    selectedActivityId,
    selectedActivityCategory,
    processList: processList || '(no activities yet - this should not happen in practice)',
    variableList,
  });
}

/**
 * Get AI-generated activity suggestions for the selected node
 */
export async function getActivitySuggestions(
  provider: AiProvider,
  credentials: AiProviderCredentials,
  context: SuggestionContext,
  signal?: AbortSignal
): Promise<{ suggestions: SuggestionItem[] }> {
  const { value: safeContext } = redactSensitive(context);
  const systemPrompt = buildSuggestionPrompt(safeContext);

  const userPrompt = renderPrompt('suggestions.user', {
    selectedActivityId: safeContext.selectedActivityId,
    selectedActivityCategory: safeContext.selectedActivityCategory,
  }).text;

  try {
    const result = await provider.generate(credentials, {
      systemPrompt: systemPrompt.text,
      userPrompt,
      jsonSchema: {
        type: 'object',
        additionalProperties: false,
        required: ['suggestions'],
        properties: {
          suggestions: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['activityId', 'label', 'reason'],
              properties: {
                activityId: { type: 'string', minLength: 1 },
                label: { type: 'string', minLength: 1 },
                reason: { type: 'string', minLength: 1 },
              },
            },
            maxItems: 4,
          },
        },
      },
      signal,
      jsonMode: true,
    });

    let parsed: { suggestions: SuggestionItem[] };
    try {
      parsed = JSON.parse(result.text);
    } catch {
      throw new Error('AI returned invalid JSON for suggestions');
    }

    if (!Array.isArray(parsed.suggestions)) {
      throw new Error('AI response missing suggestions array');
    }

    // Validate that all activityIds are from the available activities
    const availableActivityIds = new Set(safeContext.processActivities.map(a => a.id));
    const validSuggestions = parsed.suggestions.filter(suggestion =>
      availableActivityIds.has(suggestion.activityId)
    );

    // If all suggestions were invalid, return empty (AI may have hallucinated)
    if (validSuggestions.length === 0 && parsed.suggestions.length > 0) {
      return { suggestions: [] };
    }

    return { suggestions: validSuggestions };
  } catch (error) {
    // On error (network, timeout, invalid response), return empty suggestions
    return { suggestions: [] };
  }
}
