/**
 * AI suggestions for RPAForge Studio (Issue #592).
 * Context-aware activity suggestions that appear when a user selects a node.
 * Generates "What's Next?" suggestions based on current node, graph position,
 * previous activities, and common RPA patterns.
 */

import type { AiProvider, AiProviderCredentials } from './providers';
import type { AiActivitySnapshot } from '../../src/types/ai';
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
 * Build the system prompt for activity suggestions
 */
function buildSuggestionPrompt(context: SuggestionContext): string {
  const { selectedActivityId, selectedActivityCategory, processActivities, variables } = context;

  const processList = processActivities
    .map((activity) => {
      return `- \`${activity.id}\` (${activity.category}) — ${activity.name}`;
    })
    .join('\n');

  const variableList = variables.length > 0
    ? `\n\n## Variables\n\nAvailable variables (from previous activities):\n${variables.map(v => `- \`${v.name}\` (${v.type})`).join('\n')}`
    : '';

  return `# Task

The user is building an RPA process with RPAForge. They've selected the activity "${selectedActivityId}" (${selectedActivityCategory}) in the workflow designer.

Based on the current activity, the existing process flow, and the available variables, suggest what activity should come NEXT.

## Output format — strict

Respond with **only** a single JSON object. No markdown code fences, no commentary before or after — the response must start with \`{\` and end with \`}\`.

\`\`\`json
{
  "suggestions": [
    {
      "activityId": "string",
      "label": "string",
      "reason": "string"
    }
  ]
}
\`\`\`

The suggestions array should contain **up to 4 items**. Each suggestion includes:
- \`activityId\`: The exact ID of an activity from the available activities list
- \`label\`: A short human-readable label for the suggestion (2-4 words)
- \`reason\`: A brief explanation (1 sentence) of why this activity makes sense next

## Available activities

The user has these activities available in their process:
${processList || '(no activities yet - this should not happen in practice)'}

## Context

The user has selected "${selectedActivityId}" (${selectedActivityCategory}).
Consider:
1. Common RPA patterns for this activity type
2. What activities typically follow this one in automation workflows
3. The variables that have been defined so far
4. Logical flow (e.g., after "Open Application", you might "Wait For Window"; after "Read Excel", you might "For Each Row")

## Language

Respond in the same language as the activity names and labels. If activities use English names, respond in English.

## Example response

\`\`\`json
{
  "suggestions": [
    {
      "activityId": "DesktopUI.Wait For Window",
      "label": "Wait for window",
      "reason": "After opening an application, wait for its main window to appear before interacting with it."
    },
    {
      "activityId": "DesktopUI.Input Text",
      "label": "Input text",
      "reason": "Once the window is ready, you can type text into it."
    }
  ]
}
\`\`\`${variableList}`;
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

  const userPrompt = `The user has selected "${safeContext.selectedActivityId}" (${safeContext.selectedActivityCategory}) in their RPA process.

Based on the context above, what activity should come next? Consider the workflow patterns and available variables.

Return your response as JSON with up to 4 suggestions.`;

  try {
    const result = await provider.generate(credentials, {
      systemPrompt,
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
