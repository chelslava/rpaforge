// @vitest-environment node

import { afterEach, describe, expect, test, vi } from 'vitest';
import { AnthropicProvider, OpenAiCompatibleProvider, GeminiProvider, getProvider } from './providers';

describe('OpenAiCompatibleProvider', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test('generate() posts chat/completions and returns message content', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: '{"nodes":[],"edges":[]}' } }] }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const provider = new OpenAiCompatibleProvider();
    const result = await provider.generate(
      { apiKey: 'key', model: 'gpt-4o-mini' },
      { systemPrompt: 'sys', userPrompt: 'user', jsonSchema: {} }
    );

    expect(result).toEqual({ text: '{"nodes":[],"edges":[]}', truncated: false });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.openai.com/v1/chat/completions');
    expect(init.headers.Authorization).toBe('Bearer key');
    const body = JSON.parse(init.body);
    expect(body.model).toBe('gpt-4o-mini');
    expect(body.response_format).toEqual({ type: 'json_object' });
    expect(body.max_tokens).toBeGreaterThanOrEqual(4096);
  });

  test('generate() respects a custom baseUrl (e.g. Ollama-local)', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: '{}' } }] }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const provider = new OpenAiCompatibleProvider();
    await provider.generate(
      { apiKey: 'key', model: 'llama3', baseUrl: 'http://localhost:11434/v1/' },
      { systemPrompt: 'sys', userPrompt: 'user', jsonSchema: {} }
    );

    expect(fetchMock.mock.calls[0][0]).toBe('http://localhost:11434/v1/chat/completions');
  });

  test('generate() throws without a configured model', async () => {
    const provider = new OpenAiCompatibleProvider();
    await expect(
      provider.generate({ apiKey: 'key' }, { systemPrompt: '', userPrompt: '', jsonSchema: {} })
    ).rejects.toThrow(/model/i);
  });

  test('generate() throws with response status and body on failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 401, text: async () => 'invalid key' })
    );

    const provider = new OpenAiCompatibleProvider();
    await expect(
      provider.generate({ apiKey: 'bad', model: 'gpt-4o-mini' }, { systemPrompt: '', userPrompt: '', jsonSchema: {} })
    ).rejects.toThrow(/401/);
  });

  test('generate() throws on an HTTP 200 response carrying an upstream error body (observed on OpenRouter timeouts)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ error: { message: 'The operation was aborted', code: 504 } }),
      })
    );

    const provider = new OpenAiCompatibleProvider();
    await expect(
      provider.generate({ apiKey: 'key', model: 'gpt-4o-mini' }, { systemPrompt: '', userPrompt: '', jsonSchema: {} })
    ).rejects.toThrow(/aborted/);
  });

  test('test() hits /models and resolves on 200', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
    const provider = new OpenAiCompatibleProvider();
    await expect(provider.test({ apiKey: 'key' })).resolves.toBeUndefined();
  });

  test('test() rejects on non-2xx', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 403 }));
    const provider = new OpenAiCompatibleProvider();
    await expect(provider.test({ apiKey: 'key' })).rejects.toThrow(/403/);
  });

  test('test() rejects without an API key', async () => {
    const provider = new OpenAiCompatibleProvider();
    await expect(provider.test({ apiKey: '' })).rejects.toThrow(/API key/i);
  });

  test('generate() reports truncated:true when finish_reason is "length"', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ choices: [{ message: { content: '{"nodes":[' }, finish_reason: 'length' }] }),
      })
    );

    const provider = new OpenAiCompatibleProvider();
    const result = await provider.generate(
      { apiKey: 'key', model: 'gpt-4o-mini' },
      { systemPrompt: 'sys', userPrompt: 'user', jsonSchema: {} }
    );

    expect(result.truncated).toBe(true);
    expect(result.text).toBe('{"nodes":[');
  });
});

describe('AnthropicProvider', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test('generate() posts /v1/messages with tool-use and returns the tool input as JSON', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        content: [{ type: 'tool_use', input: { nodes: [], edges: [] } }],
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const provider = new AnthropicProvider();
    const result = await provider.generate(
      { apiKey: 'key', model: 'claude-sonnet-4-6' },
      { systemPrompt: 'sys', userPrompt: 'user', jsonSchema: { type: 'object' } }
    );

    expect(result.truncated).toBe(false);
    expect(JSON.parse(result.text)).toEqual({ nodes: [], edges: [] });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.anthropic.com/v1/messages');
    expect(init.headers['x-api-key']).toBe('key');
    const body = JSON.parse(init.body);
    expect(body.tool_choice).toEqual({ type: 'tool', name: 'emit_rpa_diagram' });
    expect(body.tools[0].input_schema).toEqual({ type: 'object' });
    expect(body.max_tokens).toBeGreaterThanOrEqual(4096);
  });

  test('generate() throws when the response has no tool_use block', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ content: [] }) }));
    const provider = new AnthropicProvider();
    await expect(
      provider.generate({ apiKey: 'key', model: 'claude-sonnet-4-6' }, { systemPrompt: '', userPrompt: '', jsonSchema: {} })
    ).rejects.toThrow(/tool_use/);
  });

  test('test() hits /v1/models', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);
    const provider = new AnthropicProvider();
    await provider.test({ apiKey: 'key' });
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.anthropic.com/v1/models');
  });

  test('generate() reports truncated:true when stop_reason is "max_tokens"', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          content: [{ type: 'tool_use', input: { nodes: [] } }],
          stop_reason: 'max_tokens',
        }),
      })
    );

    const provider = new AnthropicProvider();
    const result = await provider.generate(
      { apiKey: 'key', model: 'claude-sonnet-4-6' },
      { systemPrompt: '', userPrompt: '', jsonSchema: {} }
    );

    expect(result.truncated).toBe(true);
  });
});

describe('GeminiProvider', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test('has id "gemini"', () => {
    const provider = new GeminiProvider();
    expect(provider.id).toBe('gemini');
  });

  test('test() throws without an API key', async () => {
    const provider = new GeminiProvider();
    await expect(provider.test({ apiKey: '' })).rejects.toThrow(/API key/i);
  });

  test('generate() throws without an API key', async () => {
    const provider = new GeminiProvider();
    await expect(
      provider.generate(
        { apiKey: '' },
        { systemPrompt: '', userPrompt: '', jsonSchema: {} }
      )
    ).rejects.toThrow(/API key/i);
  });

  test('generate() throws without a model', async () => {
    const provider = new GeminiProvider();
    await expect(
      provider.generate(
        { apiKey: 'key' },
        { systemPrompt: '', userPrompt: '', jsonSchema: {} }
      )
    ).rejects.toThrow(/model/i);
  });
});

describe('getProvider', () => {
  test('returns the matching adapter for each provider id', () => {
    expect(getProvider('openai-compatible')).toBeInstanceOf(OpenAiCompatibleProvider);
    expect(getProvider('anthropic')).toBeInstanceOf(AnthropicProvider);
  });

  test('gemini resolves to a GeminiProvider', () => {
    expect(getProvider('gemini')).toBeInstanceOf(GeminiProvider);
  });

  test('ollama resolves to an OpenAI-compatible provider', () => {
    expect(getProvider('ollama')).toBeInstanceOf(OpenAiCompatibleProvider);
  });

  test('groq resolves to an OpenAI-compatible provider', () => {
    expect(getProvider('groq')).toBeInstanceOf(OpenAiCompatibleProvider);
  });

  test('ollama generate() uses the supplied baseUrl (preset is http://localhost:11434/v1)', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: '{}' } }] }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const provider = getProvider('ollama');
    await provider.generate(
      { apiKey: '', model: 'llama3', baseUrl: 'http://localhost:11434/v1' },
      { systemPrompt: 'sys', userPrompt: 'user', jsonSchema: {} }
    );

    expect(fetchMock.mock.calls[0][0]).toBe('http://localhost:11434/v1/chat/completions');
    vi.unstubAllGlobals();
  });

  test('groq generate() uses the supplied baseUrl (preset is https://api.groq.com/openai/v1)', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: '{}' } }] }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const provider = getProvider('groq');
    await provider.generate(
      { apiKey: 'groq-key', model: 'mixtral-8x7b-32768', baseUrl: 'https://api.groq.com/openai/v1' },
      { systemPrompt: 'sys', userPrompt: 'user', jsonSchema: {} }
    );

    expect(fetchMock.mock.calls[0][0]).toBe('https://api.groq.com/openai/v1/chat/completions');
    vi.unstubAllGlobals();
  });
});
