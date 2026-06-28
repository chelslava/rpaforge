/**
 * AI provider adapters for diagram generation (E1 Phase 5.3).
 *
 * Both adapters are called only from the Electron main process — never from
 * the renderer — so API keys never need to cross the IPC boundary in
 * plaintext. The OpenAI-compatible adapter intentionally uses
 * `response_format: { type: 'json_object' }` rather than strict
 * `json_schema` mode: many "OpenAI-compatible" servers (custom endpoints,
 * Ollama-local) don't fully support strict schema enforcement, and OpenAI's
 * own strict mode requires every schema property to be `required`, which
 * fights the optional fields in our diagram shape. Shape correctness is
 * instead enforced by the 3-layer validation + retry loop in
 * generateDiagram.ts. Anthropic's tool-use `input_schema` has no such
 * all-required constraint, so it is used directly there.
 */

import type { AiProviderId } from '../../src/types/ai';

// Diagrams can run to dozens of nodes/edges of JSON; without an explicit cap
// many providers (especially free-tier models on aggregators like
// OpenRouter) default to a low completion length and silently truncate the
// response mid-JSON instead of erroring, which then fails JSON.parse.
const MAX_OUTPUT_TOKENS = 8192;

export interface AiProviderCredentials {
  apiKey: string;
  baseUrl?: string;
  /** Required for generate(); intentionally never defaulted in code (model ids go stale — the user supplies one). */
  model?: string;
}

export interface AiGenerateOptions {
  systemPrompt: string;
  userPrompt: string;
  jsonSchema: Record<string, unknown>;
  signal?: AbortSignal;
  jsonMode?: boolean;
}

export interface AiGenerateResult {
  text: string;
  /** True if the provider stopped because it hit MAX_OUTPUT_TOKENS, not because it finished — the JSON is likely incomplete. */
  truncated: boolean;
}

export interface AiProvider {
  readonly id: AiProviderId;
  generate(credentials: AiProviderCredentials, options: AiGenerateOptions): Promise<AiGenerateResult>;
  /** Cheap connectivity check (no/minimal token cost) for the Settings "Test connection" button. */
  test(credentials: AiProviderCredentials): Promise<void>;
}

function stripTrailingSlash(url: string): string {
  return url.replace(/\/+$/, '');
}

export class OpenAiCompatibleProvider implements AiProvider {
  readonly id: AiProviderId = 'openai-compatible';

  private baseUrl(credentials: AiProviderCredentials): string {
    return stripTrailingSlash(credentials.baseUrl?.trim() || 'https://api.openai.com/v1');
  }

  async generate(credentials: AiProviderCredentials, options: AiGenerateOptions): Promise<AiGenerateResult> {
    if (!credentials.model) {
      throw new Error('Model is not configured for the OpenAI-compatible provider.');
    }

    const body: Record<string, unknown> = {
      model: credentials.model,
      messages: [
        { role: 'system', content: options.systemPrompt },
        { role: 'user', content: options.userPrompt },
      ],
      max_tokens: MAX_OUTPUT_TOKENS,
    };

    if (options.jsonMode !== false) {
      body.response_format = { type: 'json_object' };
    }

    const response = await fetch(`${this.baseUrl(credentials)}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${credentials.apiKey}`,
      },
      signal: options.signal,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`OpenAI-compatible request failed (${response.status}): ${text.slice(0, 500)}`);
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string }; finish_reason?: string }>;
      error?: { message?: string; code?: number | string };
    };

    // Some OpenAI-compatible aggregators (observed on OpenRouter) report
    // upstream provider failures — timeouts, capacity, etc. — as HTTP 200
    // with an "error" object in the body instead of a non-2xx status, so
    // the !response.ok check above never catches them.
    if (data.error) {
      throw new Error(`OpenAI-compatible upstream error (code ${data.error.code ?? 'unknown'}): ${data.error.message ?? 'unknown error'}`);
    }

    const choice = data.choices?.[0];
    const content = choice?.message?.content;
    if (!content) {
      // Some models/routers put the actual answer in a non-standard field
      // (e.g. a "reasoning" field for thinking models) and leave the
      // standard "content" empty. Surface the raw response so this is
      // diagnosable from the error message alone, without re-running with
      // ad-hoc logging.
      throw new Error(
        `OpenAI-compatible response contained no message content. Raw response: ${JSON.stringify(data).slice(0, 1000)}`
      );
    }
    return { text: content, truncated: choice?.finish_reason === 'length' };
  }

  async test(credentials: AiProviderCredentials): Promise<void> {
    if (!credentials.apiKey) {
      throw new Error('API key is required.');
    }
    const response = await fetch(`${this.baseUrl(credentials)}/models`, {
      headers: { Authorization: `Bearer ${credentials.apiKey}` },
    });
    if (!response.ok) {
      throw new Error(`Connection test failed (HTTP ${response.status}).`);
    }
  }
}

export class AnthropicProvider implements AiProvider {
  readonly id: AiProviderId = 'anthropic';
  private static readonly API_VERSION = '2023-06-01';
  private static readonly TOOL_NAME = 'emit_rpa_diagram';

  private baseUrl(credentials: AiProviderCredentials): string {
    return stripTrailingSlash(credentials.baseUrl?.trim() || 'https://api.anthropic.com');
  }

  async generate(credentials: AiProviderCredentials, options: AiGenerateOptions): Promise<AiGenerateResult> {
    if (!credentials.model) {
      throw new Error('Model is not configured for the Anthropic provider.');
    }

    const response = await fetch(`${this.baseUrl(credentials)}/v1/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': credentials.apiKey,
        'anthropic-version': AnthropicProvider.API_VERSION,
      },
      signal: options.signal,
      body: JSON.stringify({
        model: credentials.model,
        max_tokens: MAX_OUTPUT_TOKENS,
        system: options.systemPrompt,
        messages: [{ role: 'user', content: options.userPrompt }],
        tools: [
          {
            name: AnthropicProvider.TOOL_NAME,
            description: 'Emit the generated RPA diagram as structured JSON.',
            input_schema: options.jsonSchema,
          },
        ],
        tool_choice: { type: 'tool', name: AnthropicProvider.TOOL_NAME },
      }),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`Anthropic request failed (${response.status}): ${text.slice(0, 500)}`);
    }

    const data = (await response.json()) as {
      content?: Array<{ type: string; input?: unknown }>;
      stop_reason?: string;
    };
    const toolUse = data.content?.find((block) => block.type === 'tool_use');
    if (!toolUse?.input) {
      throw new Error('Anthropic response contained no tool_use block.');
    }
    return { text: JSON.stringify(toolUse.input), truncated: data.stop_reason === 'max_tokens' };
  }

  async test(credentials: AiProviderCredentials): Promise<void> {
    if (!credentials.apiKey) {
      throw new Error('API key is required.');
    }
    const response = await fetch(`${this.baseUrl(credentials)}/v1/models`, {
      headers: {
        'x-api-key': credentials.apiKey,
        'anthropic-version': AnthropicProvider.API_VERSION,
      },
    });
    if (!response.ok) {
      throw new Error(`Connection test failed (HTTP ${response.status}).`);
    }
  }
}

const PROVIDERS: Record<AiProviderId, AiProvider> = {
  'openai-compatible': new OpenAiCompatibleProvider(),
  anthropic: new AnthropicProvider(),
};

export function getProvider(id: AiProviderId): AiProvider {
  return PROVIDERS[id];
}
