// @vitest-environment node

import { describe, expect, test, vi } from 'vitest';
import { generateDiagram } from './generateDiagram';
import type { AiProvider, AiProviderCredentials, AiGenerateOptions } from './providers';
import type { AiActivitySnapshot } from '../../src/types/ai';

const credentials: AiProviderCredentials = { apiKey: 'key', model: 'test-model' };

type FakeResponse = string | (() => string) | { text: string; truncated: boolean };

function fakeProvider(responses: FakeResponse[]): AiProvider {
  let call = 0;
  return {
    id: 'openai-compatible',
    generate: vi.fn(async (_creds: AiProviderCredentials, _options: AiGenerateOptions) => {
      const entry = responses[Math.min(call, responses.length - 1)];
      call += 1;
      if (typeof entry === 'object') {
        return entry;
      }
      return { text: typeof entry === 'function' ? entry() : entry, truncated: false };
    }),
    test: vi.fn(),
  };
}

const ACTIVITIES: AiActivitySnapshot[] = [
  { id: 'web.click', name: 'Click', category: 'Web', description: 'Click an element', params: [], hasOutput: false },
];

const VALID_DIAGRAM = JSON.stringify({
  nodes: [
    { id: 'start', blockType: 'start', label: 'Start' },
    { id: 'act1', blockType: 'activity', activityId: 'web.click', label: 'Click button' },
    { id: 'end', blockType: 'end', label: 'End' },
  ],
  edges: [
    { from: 'start', to: 'act1' },
    { from: 'act1', to: 'end' },
  ],
});

describe('generateDiagram', () => {
  test('succeeds on the first attempt when the response is already valid', async () => {
    const provider = fakeProvider([VALID_DIAGRAM]);
    const result = await generateDiagram(provider, credentials, { prompt: 'click a button', activities: ACTIVITIES });

    expect(result.success).toBe(true);
    expect(result.attempts).toBe(1);
    expect(result.diagram?.nodes).toHaveLength(3);
  });

  test('treats a truncated response (finish_reason length / stop_reason max_tokens) as needing a shorter retry, not a JSON-parse retry', async () => {
    const provider = fakeProvider([
      { text: '{"nodes":[{"id":"start","blockType":"start"', truncated: true },
      VALID_DIAGRAM,
    ]);
    const result = await generateDiagram(provider, credentials, { prompt: 'click a button', activities: ACTIVITIES });

    expect(result.success).toBe(true);
    expect(result.attempts).toBe(2);
    const secondCallPrompt = (provider.generate as ReturnType<typeof vi.fn>).mock.calls[1][1].userPrompt as string;
    expect(secondCallPrompt).toMatch(/cut off because it was too long/);
  });

  test('retries and recovers from malformed JSON', async () => {
    const provider = fakeProvider(['not json at all', VALID_DIAGRAM]);
    const result = await generateDiagram(provider, credentials, { prompt: 'click a button', activities: ACTIVITIES });

    expect(result.success).toBe(true);
    expect(result.attempts).toBe(2);
    expect(provider.generate).toHaveBeenCalledTimes(2);
  });

  test('strips markdown code fences before parsing', async () => {
    const provider = fakeProvider([`Here you go:\n\`\`\`json\n${VALID_DIAGRAM}\n\`\`\``]);
    const result = await generateDiagram(provider, credentials, { prompt: 'click a button', activities: ACTIVITIES });

    expect(result.success).toBe(true);
    expect(result.attempts).toBe(1);
  });

  test('rejects an unknown activityId via shape validation and can recover on retry', async () => {
    const badDiagram = JSON.stringify({
      nodes: [
        { id: 'start', blockType: 'start', label: 'Start' },
        { id: 'act1', blockType: 'activity', activityId: 'does.not.exist', label: 'Mystery' },
        { id: 'end', blockType: 'end', label: 'End' },
      ],
      edges: [
        { from: 'start', to: 'act1' },
        { from: 'act1', to: 'end' },
      ],
    });
    const provider = fakeProvider([badDiagram, VALID_DIAGRAM]);
    const result = await generateDiagram(provider, credentials, { prompt: 'click a button', activities: ACTIVITIES });

    expect(result.success).toBe(true);
    expect(result.attempts).toBe(2);
  });

  test('rejects an edge handle that does not exist on the source node\'s real ports (e.g. try-catch "body"/"catch") and can recover on retry', async () => {
    const badHandleDiagram = JSON.stringify({
      nodes: [
        { id: 'start', blockType: 'start', label: 'Start' },
        { id: 'try1', blockType: 'try-catch', label: 'Try' },
        { id: 'if1', blockType: 'if', label: 'Check', condition: 'x > 0' },
        { id: 'end', blockType: 'end', label: 'End' },
      ],
      edges: [
        { from: 'start', to: 'try1' },
        { from: 'try1', to: 'if1', handle: 'body' },
        { from: 'try1', to: 'end', handle: 'catch' },
        { from: 'if1', to: 'end', handle: 'true' },
        { from: 'if1', to: 'end', handle: 'false' },
      ],
    });
    const provider = fakeProvider([badHandleDiagram, VALID_DIAGRAM]);
    const result = await generateDiagram(provider, credentials, { prompt: 'try something', activities: ACTIVITIES });

    expect(result.success).toBe(true);
    expect(result.attempts).toBe(2);
    expect(provider.generate).toHaveBeenCalledTimes(2);
    const secondCallPrompt = (provider.generate as ReturnType<typeof vi.fn>).mock.calls[1][1].userPrompt as string;
    expect(secondCallPrompt).toMatch(/handle "body"/);
    expect(secondCallPrompt).toMatch(/handle "catch"/);
  });

  test('rejects an omitted handle on a branching node (if/while/for-each/switch), since "output" is not a real port there', async () => {
    const omittedHandleDiagram = JSON.stringify({
      nodes: [
        { id: 'start', blockType: 'start', label: 'Start' },
        { id: 'if1', blockType: 'if', label: 'Check', condition: 'x > 0' },
        { id: 'end', blockType: 'end', label: 'End' },
      ],
      edges: [
        { from: 'start', to: 'if1' },
        { from: 'if1', to: 'end' },
      ],
    });
    const provider = fakeProvider([omittedHandleDiagram]);
    const result = await generateDiagram(provider, credentials, { prompt: 'check something', activities: [] });

    expect(result.success).toBe(false);
    expect(result.errors?.some((error) => /uses handle "\(omitted\)"/.test(error))).toBe(true);
  });

  test('rejects an edge sourced from a terminal node (end/throw have no output port)', async () => {
    const edgeFromEndDiagram = JSON.stringify({
      nodes: [
        { id: 'start', blockType: 'start', label: 'Start' },
        { id: 'end', blockType: 'end', label: 'End' },
        { id: 'extra', blockType: 'end', label: 'Extra' },
      ],
      edges: [
        { from: 'start', to: 'end' },
        { from: 'end', to: 'extra' },
      ],
    });
    const provider = fakeProvider([edgeFromEndDiagram]);
    const result = await generateDiagram(provider, credentials, { prompt: 'do nothing twice', activities: [] });

    expect(result.success).toBe(false);
    expect(result.errors?.some((error) => /has no output port/.test(error))).toBe(true);
  });

  test('rejects forbidden blockType "parallel" even though it parses and matches the registry', async () => {
    const parallelDiagram = JSON.stringify({
      nodes: [
        { id: 'start', blockType: 'start', label: 'Start' },
        { id: 'p1', blockType: 'parallel', label: 'Branches' },
        { id: 'end', blockType: 'end', label: 'End' },
      ],
      edges: [
        { from: 'start', to: 'p1' },
        { from: 'p1', to: 'end' },
      ],
    });
    const provider = fakeProvider([parallelDiagram]);
    const result = await generateDiagram(provider, credentials, { prompt: 'do two things at once', activities: [] });

    // The JSON schema's blockType enum already excludes 'parallel', so this
    // fails shape validation (layer 1) before semantic checks ever run.
    expect(result.success).toBe(false);
    expect(result.attempts).toBe(3);
  });

  test('catches a missing Start node via structural validation (layer 3)', async () => {
    const noStartDiagram = JSON.stringify({
      nodes: [{ id: 'end', blockType: 'end', label: 'End' }],
      edges: [],
    });
    const provider = fakeProvider([noStartDiagram]);
    const result = await generateDiagram(provider, credentials, { prompt: 'do nothing', activities: [] });

    expect(result.success).toBe(false);
    expect(result.errors?.some((error) => /start/i.test(error))).toBe(true);
  });

  test('gives up after MAX_RETRIES and returns the last raw text + errors', async () => {
    const provider = fakeProvider(['still not json', 'still not json', 'still not json']);
    const result = await generateDiagram(provider, credentials, { prompt: 'click a button', activities: ACTIVITIES });

    expect(result.success).toBe(false);
    expect(result.attempts).toBe(3);
    expect(provider.generate).toHaveBeenCalledTimes(3);
    expect(result.rawText).toBe('still not json');
  });

  test('falls back to free-text JSON extraction when provider rejects response_format (HTTP 400 with json_object)', async () => {
    const provider: AiProvider = {
      id: 'openai-compatible',
      generate: vi.fn(async (_creds: AiProviderCredentials, options: AiGenerateOptions) => {
        if (options.jsonMode !== false) {
          throw new Error('OpenAI-compatible request failed (400): response_format: json_object is not supported');
        }
        return { text: VALID_DIAGRAM, truncated: false };
      }),
      test: vi.fn(),
    };
    const result = await generateDiagram(provider, credentials, { prompt: 'click a button', activities: ACTIVITIES });

    expect(result.success).toBe(true);
    expect(result.attempts).toBe(2);
    expect(provider.generate).toHaveBeenCalledTimes(2);
    const firstCall = (provider.generate as ReturnType<typeof vi.fn>).mock.calls[0][1];
    const secondCall = (provider.generate as ReturnType<typeof vi.fn>).mock.calls[1][1];
    expect(firstCall.jsonMode).not.toBe(false);
    expect(secondCall.jsonMode).toBe(false);
  });

  test('falls back to free-text when provider returns HTTP 422 with response_format error', async () => {
    const provider: AiProvider = {
      id: 'openai-compatible',
      generate: vi.fn(async (_creds: AiProviderCredentials, options: AiGenerateOptions) => {
        if (options.jsonMode !== false) {
          throw new Error('OpenAI-compatible request failed (422): response_format mode not allowed');
        }
        return { text: `\`\`\`json\n${VALID_DIAGRAM}\n\`\`\`` , truncated: false };
      }),
      test: vi.fn(),
    };
    const result = await generateDiagram(provider, credentials, { prompt: 'click a button', activities: ACTIVITIES });

    expect(result.success).toBe(true);
    expect(result.attempts).toBe(2);
    expect(result.diagram?.nodes).toHaveLength(3);
  });

  test('returns a failure immediately if the provider call itself throws (e.g. network/auth error)', async () => {
    const provider: AiProvider = {
      id: 'anthropic',
      generate: vi.fn().mockRejectedValue(new Error('401 Unauthorized')),
      test: vi.fn(),
    };
    const result = await generateDiagram(provider, credentials, { prompt: 'click a button', activities: ACTIVITIES });

    expect(result.success).toBe(false);
    expect(result.attempts).toBe(1);
    expect(result.errors?.[0]).toMatch(/401/);
    expect(provider.generate).toHaveBeenCalledTimes(1);
  });
});
