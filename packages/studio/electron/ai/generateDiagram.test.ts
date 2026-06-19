// @vitest-environment node

import { describe, expect, test, vi } from 'vitest';
import { generateDiagram } from './generateDiagram';
import type { AiProvider, AiProviderCredentials, AiGenerateOptions } from './providers';
import type { AiActivitySnapshot } from '../../src/types/ai';

const credentials: AiProviderCredentials = { apiKey: 'key', model: 'test-model' };

function fakeProvider(responses: string[] | (() => string)[]): AiProvider {
  let call = 0;
  return {
    id: 'openai-compatible',
    generate: vi.fn(async (_creds: AiProviderCredentials, _options: AiGenerateOptions) => {
      const entry = responses[Math.min(call, responses.length - 1)];
      call += 1;
      return typeof entry === 'function' ? entry() : entry;
    }),
    test: vi.fn(),
  };
}

const ACTIVITIES: AiActivitySnapshot[] = [
  { id: 'web.click', name: 'Click', category: 'Web', description: 'Click an element', params: [] },
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
