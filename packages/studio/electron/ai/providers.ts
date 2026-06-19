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
}

export interface AiProvider {
  readonly id: AiProviderId;
  generate(credentials: AiProviderCredentials, options: AiGenerateOptions): Promise<string>;
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

  async generate(credentials: AiProviderCredentials, options: AiGenerateOptions): Promise<string> {
    if (!credentials.model) {
      throw new Error('Model is not configured for the OpenAI-compatible provider.');
    }

    const response = await fetch(`${this.baseUrl(credentials)}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${credentials.apiKey}`,
      },
      signal: options.signal,
      body: JSON.stringify({
        model: credentials.model,
        messages: [
          { role: 'system', content: options.systemPrompt },
          { role: 'user', content: options.userPrompt },
        ],
        response_format: { type: 'json_object' },
      }),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`OpenAI-compatible request failed (${response.status}): ${text.slice(0, 500)}`);
    }

    const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error('OpenAI-compatible response contained no message content.');
    }
    return content;
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

  async generate(credentials: AiProviderCredentials, options: AiGenerateOptions): Promise<string> {
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
        max_tokens: 8192,
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

    const data = (await response.json()) as { content?: Array<{ type: string; input?: unknown }> };
    const toolUse = data.content?.find((block) => block.type === 'tool_use');
    if (!toolUse?.input) {
      throw new Error('Anthropic response contained no tool_use block.');
    }
    return JSON.stringify(toolUse.input);
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
