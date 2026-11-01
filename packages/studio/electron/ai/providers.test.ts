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

describe('streaming (issue #820)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function sseResponse(body: string): Response {
    return new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
  }

  const sse = (events: string[]) => sseResponse(events.map((event) => `${event}\n\n`).join(''));

  test('OpenAI: generate() streams via SSE when onDelta is set and accounts usage from the final chunk', async () => {
    const events = [
      `data: ${JSON.stringify({ model: 'gpt-4o-mini', choices: [{ index: 0, delta: { role: 'assistant' } }] })}`,
      `data: ${JSON.stringify({ model: 'gpt-4o-mini', choices: [{ index: 0, delta: { content: '{"nodes":' } }] })}`,
      `data: ${JSON.stringify({ model: 'gpt-4o-mini', choices: [{ index: 0, delta: { content: '[]}' }, finish_reason: 'stop' }] })}`,
      `data: ${JSON.stringify({ choices: [], usage: { prompt_tokens: 11, completion_tokens: 22, total_tokens: 33 } })}`,
      'data: [DONE]',
    ];
    const fetchMock = vi.fn().mockResolvedValue(sse(events));
    vi.stubGlobal('fetch', fetchMock);

    const deltas: string[] = [];
    const provider = new OpenAiCompatibleProvider();
    const result = await provider.generate(
      { apiKey: 'key', model: 'gpt-4o-mini' },
      { systemPrompt: 'sys', userPrompt: 'user', jsonSchema: {}, onDelta: (d) => deltas.push(d) }
    );

    expect(deltas).toEqual(['{"nodes":', '[]}']);
    expect(result.text).toEqual('{"nodes":[]}');
    expect(result.truncated).toBe(false);
    expect(result.tokenUsage).toEqual({ prompt: 11, completion: 22, total: 33 });

    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(init.body);
    expect(body.stream).toBe(true);
    expect(body.stream_options).toEqual({ include_usage: true });
  });

  test('OpenAI: reports truncated:true from the streaming finish_reason', async () => {
    const events = [
      `data: ${JSON.stringify({ choices: [{ index: 0, delta: { content: '{"nod' } }] })}`,
      `data: ${JSON.stringify({ choices: [{ index: 0, delta: {}, finish_reason: 'length' }] })}`,
      'data: [DONE]',
    ];
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(sse(events)));

    const provider = new OpenAiCompatibleProvider();
    const result = await provider.generate(
      { apiKey: 'key', model: 'gpt-4o-mini' },
      { systemPrompt: 'sys', userPrompt: 'user', jsonSchema: {}, onDelta: () => {} }
    );

    expect(result.text).toBe('{"nod');
    expect(result.truncated).toBe(true);
  });

  test('OpenAI: throws when the stream contains no message content', async () => {
    const events = [
      `data: ${JSON.stringify({ choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] })}`,
      'data: [DONE]',
    ];
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(sse(events)));

    const provider = new OpenAiCompatibleProvider();
    await expect(
      provider.generate(
        { apiKey: 'key', model: 'gpt-4o-mini' },
        { systemPrompt: 'sys', userPrompt: 'user', jsonSchema: {}, onDelta: () => {} }
      )
    ).rejects.toThrow(/no message content/);
  });

  test('OpenAI: generate() without onDelta keeps the non-streaming request (no stream flag)', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: '{}' } }] }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const provider = new OpenAiCompatibleProvider();
    await provider.generate(
      { apiKey: 'key', model: 'gpt-4o-mini' },
      { systemPrompt: 'sys', userPrompt: 'user', jsonSchema: {} }
    );

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.stream).toBeUndefined();
    expect(body.stream_options).toBeUndefined();
  });

  test('Anthropic: streams input_json_delta fragments and assembles the tool input', async () => {
    const events = [
      `data: ${JSON.stringify({ type: 'message_start', message: { model: 'claude-sonnet-4-6', usage: { input_tokens: 9 } } })}`,
      `data: ${JSON.stringify({ type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: 'toolu_1', name: 'emit_rpa_diagram' } })}`,
      `data: ${JSON.stringify({ type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: '{"nodes":' } })}`,
      `data: ${JSON.stringify({ type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: '[]}' } })}`,
      `data: ${JSON.stringify({ type: 'message_delta', delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: 13 } })}`,
      `data: ${JSON.stringify({ type: 'message_stop' })}`,
    ];
    const fetchMock = vi.fn().mockResolvedValue(sse(events));
    vi.stubGlobal('fetch', fetchMock);

    const deltas: string[] = [];
    const provider = new AnthropicProvider();
    const result = await provider.generate(
      { apiKey: 'key', model: 'claude-sonnet-4-6' },
      { systemPrompt: 'sys', userPrompt: 'user', jsonSchema: { type: 'object' }, onDelta: (d) => deltas.push(d) }
    );

    expect(deltas).toEqual(['{"nodes":', '[]}']);
    expect(JSON.parse(result.text)).toEqual({ nodes: [] });
    expect(result.truncated).toBe(false);
    expect(result.tokenUsage).toEqual({ prompt: 9, completion: 13, total: 22 });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.stream).toBe(true);
    expect(body.tool_choice).toEqual({ type: 'tool', name: 'emit_rpa_diagram' });
  });

  test('Anthropic: throws when the stream has no tool_use block', async () => {
    const events = [
      `data: ${JSON.stringify({ type: 'message_start', message: { model: 'claude-sonnet-4-6' } })}`,
      `data: ${JSON.stringify({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'plain' } })}`,
      `data: ${JSON.stringify({ type: 'message_stop' })}`,
    ];
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(sse(events)));

    const provider = new AnthropicProvider();
    await expect(
      provider.generate(
        { apiKey: 'key', model: 'claude-sonnet-4-6' },
        { systemPrompt: 'sys', userPrompt: 'user', jsonSchema: {}, onDelta: () => {} }
      )
    ).rejects.toThrow(/tool_use/);
  });

  test('Anthropic: reports truncated:true from the streaming stop_reason', async () => {
    const events = [
      `data: ${JSON.stringify({ type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: 'toolu_1', name: 'emit_rpa_diagram' } })}`,
      `data: ${JSON.stringify({ type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: '{"n' } })}`,
      `data: ${JSON.stringify({ type: 'message_delta', delta: { stop_reason: 'max_tokens', stop_sequence: null }, usage: { output_tokens: 4 } })}`,
      `data: ${JSON.stringify({ type: 'message_stop' })}`,
    ];
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(sse(events)));

    const provider = new AnthropicProvider();
    const result = await provider.generate(
      { apiKey: 'key', model: 'claude-sonnet-4-6' },
      { systemPrompt: 'sys', userPrompt: 'user', jsonSchema: {}, onDelta: () => {} }
    );

    expect(result.text).toBe('{"n');
    expect(result.truncated).toBe(true);
  });

  test('Anthropic: generate() without onDelta keeps the non-streaming request', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ content: [{ type: 'tool_use', input: {} }] }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const provider = new AnthropicProvider();
    await provider.generate(
      { apiKey: 'key', model: 'claude-sonnet-4-6' },
      { systemPrompt: 'sys', userPrompt: 'user', jsonSchema: {} }
    );

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.stream).toBeUndefined();
  });
});
