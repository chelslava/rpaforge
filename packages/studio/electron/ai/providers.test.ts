// @vitest-environment node

import { afterEach, describe, expect, test, vi } from 'vitest';
import { AnthropicProvider, OpenAiCompatibleProvider, getProvider } from './providers';

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

    expect(result).toBe('{"nodes":[],"edges":[]}');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.openai.com/v1/chat/completions');
    expect(init.headers.Authorization).toBe('Bearer key');
    const body = JSON.parse(init.body);
    expect(body.model).toBe('gpt-4o-mini');
    expect(body.response_format).toEqual({ type: 'json_object' });
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

    expect(JSON.parse(result)).toEqual({ nodes: [], edges: [] });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.anthropic.com/v1/messages');
    expect(init.headers['x-api-key']).toBe('key');
    const body = JSON.parse(init.body);
    expect(body.tool_choice).toEqual({ type: 'tool', name: 'emit_rpa_diagram' });
    expect(body.tools[0].input_schema).toEqual({ type: 'object' });
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
});

describe('getProvider', () => {
  test('returns the matching adapter for each provider id', () => {
    expect(getProvider('openai-compatible')).toBeInstanceOf(OpenAiCompatibleProvider);
    expect(getProvider('anthropic')).toBeInstanceOf(AnthropicProvider);
  });
});
