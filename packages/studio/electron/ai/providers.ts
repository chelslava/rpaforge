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
 * Gemini adapter uses function-calling via `tools` array, similar to Anthropic
 * but with different request/response shapes specific to Google AI SDK.
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import type { AiProviderId, TokenUsage } from '../../src/types/ai';

const MAX_OUTPUT_TOKENS = 8192;

export interface AiProviderCredentials {
  apiKey: string;
  baseUrl?: string;
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
  truncated: boolean;
  tokenUsage?: TokenUsage;
}

export interface AiProvider {
  readonly id: AiProviderId;
  generate(credentials: AiProviderCredentials, options: AiGenerateOptions): Promise<AiGenerateResult>;
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
      usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
    };

    if (data.error) {
      throw new Error(`OpenAI-compatible upstream error (code ${data.error.code ?? 'unknown'}): ${data.error.message ?? 'unknown error'}`);
    }

    const choice = data.choices?.[0];
    const content = choice?.message?.content;
    if (!content) {
      throw new Error(
        `OpenAI-compatible response contained no message content. Raw response: ${JSON.stringify(data).slice(0, 1000)}`
      );
    }

    const tokenUsage: TokenUsage | undefined = data.usage
      ? {
          prompt: data.usage.prompt_tokens ?? 0,
          completion: data.usage.completion_tokens ?? 0,
          total: data.usage.total_tokens ?? 0,
        }
      : undefined;

    return { text: content, truncated: choice?.finish_reason === 'length', tokenUsage };
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
      usage?: { input_tokens?: number; output_tokens?: number };
    };
    const toolUse = data.content?.find((block) => block.type === 'tool_use');
    if (!toolUse?.input) {
      throw new Error('Anthropic response contained no tool_use block.');
    }

    const tokenUsage: TokenUsage | undefined = data.usage
      ? {
          prompt: data.usage.input_tokens ?? 0,
          completion: data.usage.output_tokens ?? 0,
          total: (data.usage.input_tokens ?? 0) + (data.usage.output_tokens ?? 0),
        }
      : undefined;

    return { text: JSON.stringify(toolUse.input), truncated: data.stop_reason === 'max_tokens', tokenUsage };
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

export class GeminiProvider implements AiProvider {
  readonly id: AiProviderId = 'gemini';
  private static readonly TOOL_NAME = 'emit_rpa_diagram';

  async generate(credentials: AiProviderCredentials, options: AiGenerateOptions): Promise<AiGenerateResult> {
    if (!credentials.apiKey) {
      throw new Error('API key is required for the Gemini provider.');
    }
    if (!credentials.model) {
      throw new Error('Model is not configured for the Gemini provider.');
    }

    const client = new GoogleGenerativeAI(credentials.apiKey);
    const model = client.getGenerativeModel({ model: credentials.model });

    const toolDefinition = {
      name: GeminiProvider.TOOL_NAME,
      description: 'Emit the generated RPA diagram as structured JSON.',
      inputSchema: {
        type: 'object' as const,
        properties: (options.jsonSchema.properties as Record<string, unknown>) || {},
        required: (options.jsonSchema.required as string[]) || [],
      },
    };

    const systemUserPrompt = `${options.systemPrompt}\n\n${options.userPrompt}`;

    try {
      const stream = await model.generateContentStream({
        contents: [{ role: 'user', parts: [{ text: systemUserPrompt }] }],
        tools: [{ functionDeclarations: [toolDefinition] }],
        generationConfig: {
          maxOutputTokens: MAX_OUTPUT_TOKENS,
          responseMimeType: 'application/json',
        },
      });

      let fullText = '';
      let truncated = false;
      let promptTokens = 0;
      let completionTokens: number;

      for await (const chunk of stream.stream) {
        const content = chunk.candidates?.[0]?.content;
        if (!content) continue;

        for (const part of content.parts) {
          if (part.text) {
            fullText += part.text;
          }
          if (part.functionCall) {
            fullText = JSON.stringify(part.functionCall.args || {});
          }
        }

        const finishReason = chunk.candidates?.[0]?.finishReason;
        if (finishReason === 'MAX_TOKENS') {
          truncated = true;
        }

        const usage = chunk.usageMetadata;
        if (usage) {
          promptTokens = usage.promptTokenCount ?? 0;
          completionTokens = usage.candidatesTokenCount ?? 0;
        }
      }

      if (!fullText) {
        throw new Error('Gemini response contained no text or function_call.');
      }

      const tokenUsage: TokenUsage | undefined =
        promptTokens > 0 || completionTokens > 0
          ? {
              prompt: promptTokens,
              completion: completionTokens,
              total: promptTokens + completionTokens,
            }
          : undefined;

      return { text: fullText, truncated, tokenUsage };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Gemini request failed: ${message}`);
    }
  }

  async test(credentials: AiProviderCredentials): Promise<void> {
    if (!credentials.apiKey) {
      throw new Error('API key is required.');
    }
    try {
      const client = new GoogleGenerativeAI(credentials.apiKey);
      const model = client.getGenerativeModel({ model: 'gemini-1.5-flash' });
      await model.generateContent('test');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes('401') || message.includes('UNAUTHENTICATED') || message.includes('invalid')) {
        throw new Error('Invalid API key.');
      }
      throw new Error(`Connection test failed: ${message.slice(0, 200)}`);
    }
  }
}

const PROVIDERS: Record<AiProviderId, AiProvider> = {
  'openai-compatible': new OpenAiCompatibleProvider(),
  anthropic: new AnthropicProvider(),
  ollama: new OpenAiCompatibleProvider(),
  groq: new OpenAiCompatibleProvider(),
  openrouter: new OpenAiCompatibleProvider(),
  mistral: new OpenAiCompatibleProvider(),
  'nvidia-nim': new OpenAiCompatibleProvider(),
  gemini: new GeminiProvider(),
};

export function getProvider(id: AiProviderId): AiProvider {
  return PROVIDERS[id];
}
