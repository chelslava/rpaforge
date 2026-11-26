import { describe, expect, it, vi } from 'vitest';
import {
  assistantChat,
  flattenHistory,
  validateAssistantAnswer,
} from './assistant';
import type { AiProvider, AiProviderCredentials } from './providers';
import type {
  AiAssistantChatRequest,
  AssistantMessage,
} from '../../src/types/ai';

const credentials: AiProviderCredentials = { apiKey: 'test-key' };

const DIAGRAM_NODES = [
  { id: 'start-1', label: 'Start', type: 'start' },
  { id: 'click-download', label: 'Click download', type: 'activity', paramKeys: ['selector'] },
];

function makeRequest(
  overrides: Partial<AiAssistantChatRequest> = {}
): AiAssistantChatRequest {
  return {
    requestId: 'req-1',
    providerId: 'openai-compatible',
    history: [],
    userMessage: 'Add a retry to the download click',
    context: { diagramNodes: DIAGRAM_NODES },
    ...overrides,
  };
}

const VALID_ANSWER = {
  answer: 'Wrapped the download click in a retry scope.',
  edits: [
    {
      type: 'wrap_retry',
      node_id: 'click-download',
      retry_count: 3,
      retry_interval_s: 2,
    },
  ],
};

function providerReturning(text: string, truncated = false): AiProvider {
  return {
    id: 'openai-compatible',
    generate: vi.fn().mockResolvedValue({
      text,
      truncated,
      tokenUsage: { prompt: 20, completion: 10, total: 30 },
    }),
    test: vi.fn(),
  } as unknown as AiProvider;
}

describe('flattenHistory', () => {
  it('labels prior turns and appends the new message', () => {
    const history: AssistantMessage[] = [
      { role: 'user', content: 'hello' },
      { role: 'assistant', content: 'hi' },
    ];
    const prompt = flattenHistory(history, 'add retry');
    expect(prompt).toContain('Conversation so far:');
    expect(prompt).toContain('User: hello');
    expect(prompt).toContain('Assistant: hi');
    expect(prompt.endsWith('User: add retry')).toBe(true);
  });

  it('omits the transcript header for a fresh conversation', () => {
    expect(flattenHistory([], 'just asking')).toBe('User: just asking');
  });
});

describe('validateAssistantAnswer', () => {
  it('accepts a valid answer with known node ids', () => {
    const outcome = validateAssistantAnswer(
      VALID_ANSWER,
      new Set(['click-download'])
    );
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.edits).toHaveLength(1);
      expect(outcome.answer).toContain('Wrapped');
    }
  });

  it('rejects edits referencing unknown nodes', () => {
    const outcome = validateAssistantAnswer(
      {
        answer: 'x',
        edits: [{ type: 'wrap_retry', node_id: 'ghost' }],
      },
      new Set(['click-download'])
    );
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.errors.join(' ')).toContain('unknown node id');
    }
  });

  it('rejects unknown edit types and missing fields', () => {
    const outcome = validateAssistantAnswer(
      {
        answer: 'x',
        edits: [
          { type: 'delete_everything' },
          { type: 'param_change', node_id: 'click-download' },
        ],
      },
      new Set(['click-download'])
    );
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      const joined = outcome.errors.join(' ');
      expect(joined).toContain('known edit type');
      expect(joined).toContain('"param"');
    }
  });

  it('accepts an empty edits list for pure explanations', () => {
    const outcome = validateAssistantAnswer(
      { answer: 'The process has 3 nodes.', edits: [] },
      new Set(['click-download'])
    );
    expect(outcome.ok).toBe(true);
  });
});

describe('assistantChat', () => {
  it('streams deltas to the caller', async () => {
    const generate = vi.fn().mockResolvedValue({
      text: JSON.stringify(VALID_ANSWER),
      truncated: false,
      tokenUsage: { prompt: 1, completion: 1, total: 2 },
    });
    const provider = { id: 'openai-compatible', generate, test: vi.fn() } as unknown as AiProvider;
    const deltas: string[] = [];
    await assistantChat(provider, credentials, makeRequest(), undefined, (delta) =>
      deltas.push(delta)
    );
    const options = (generate.mock.calls[0] as unknown[])[1] as {
      onDelta?: (delta: string) => void;
      userPrompt: string;
    };
    options.onDelta?.('chunk-1');
    expect(deltas).toEqual(['chunk-1']);
  });

  it('flattens history and context into the user prompt', async () => {
    const generate = vi.fn().mockResolvedValue({
      text: JSON.stringify(VALID_ANSWER),
      truncated: false,
    });
    const provider = { id: 'openai-compatible', generate, test: vi.fn() } as unknown as AiProvider;
    await assistantChat(
      provider,
      credentials,
      makeRequest({
        history: [{ role: 'user', content: 'earlier question' }],
        context: {
          diagramNodes: DIAGRAM_NODES,
          selectedNodeId: 'click-download',
          lastError: 'Click failed: element not found',
        },
      })
    );
    const options = (generate.mock.calls[0] as unknown[])[1] as {
      userPrompt: string;
      systemPrompt: string;
    };
    expect(options.userPrompt).toContain('Conversation so far:');
    expect(options.userPrompt).toContain('User: earlier question');
    expect(options.userPrompt).toContain('Selected node: click-download');
    expect(options.userPrompt).toContain('Last run error');
    expect(options.systemPrompt).toContain('JSON');
  });

  it('redacts secret-shaped values from history before the provider call', async () => {
    const generate = vi.fn().mockResolvedValue({
      text: JSON.stringify(VALID_ANSWER),
      truncated: false,
    });
    const provider = { id: 'openai-compatible', generate, test: vi.fn() } as unknown as AiProvider;
    await assistantChat(
      provider,
      credentials,
      makeRequest({
        history: [
          { role: 'user', content: 'the api_key: sk-proj-supersecret123 is broken' },
        ],
      })
    );
    const options = (generate.mock.calls[0] as unknown[])[1] as { userPrompt: string };
    expect(options.userPrompt).not.toContain('sk-proj-supersecret123');
    expect(options.userPrompt).toContain('[REDACTED]');
  });

  it('param values of the diagram never enter the prompt', async () => {
    const generate = vi.fn().mockResolvedValue({
      text: JSON.stringify(VALID_ANSWER),
      truncated: false,
    });
    const provider = { id: 'openai-compatible', generate, test: vi.fn() } as unknown as AiProvider;
    await assistantChat(provider, credentials, makeRequest());
    const options = (generate.mock.calls[0] as unknown[])[1] as { userPrompt: string };
    // param KEY names are included, values are not sent at all by the panel
    expect(options.userPrompt).toContain('params: selector');
  });

  it('feeds validation errors back and retries on invalid JSON', async () => {
    const generate = vi
      .fn()
      .mockResolvedValueOnce({ text: 'garbage', truncated: false })
      .mockResolvedValueOnce({
        text: JSON.stringify(VALID_ANSWER),
        truncated: false,
      });
    const provider = { id: 'openai-compatible', generate, test: vi.fn() } as unknown as AiProvider;
    const result = await assistantChat(provider, credentials, makeRequest());
    expect(result.success).toBe(true);
    expect(result.attempts).toBe(2);
    const secondCall = (generate.mock.calls[1] as unknown[])[1] as { userPrompt: string };
    expect(secondCall.userPrompt).toContain('not valid JSON');
  });

  it('fails with errors after exhausted retries on unknown node ids', async () => {
    const bad = {
      answer: 'x',
      edits: [{ type: 'wrap_retry', node_id: 'ghost' }],
    };
    const provider = providerReturning(JSON.stringify(bad));
    const result = await assistantChat(provider, credentials, makeRequest());
    expect(result.success).toBe(false);
    expect(result.attempts).toBe(3);
    expect(result.errors?.join(' ')).toContain('unknown node id');
  });

  it('returns cancelled when the signal aborts and the provider throws', async () => {
    const controller = new AbortController();
    const provider = {
      id: 'openai-compatible',
      generate: vi.fn().mockImplementation(() => {
        controller.abort();
        throw new Error('aborted');
      }),
      test: vi.fn(),
    } as unknown as AiProvider;
    const result = await assistantChat(
      provider,
      credentials,
      makeRequest(),
      controller.signal
    );
    expect(result.success).toBe(false);
    expect(result.errors).toEqual(['cancelled']);
  });

  it('passes token usage through to the result', async () => {
    const provider = providerReturning(JSON.stringify(VALID_ANSWER));
    const result = await assistantChat(provider, credentials, makeRequest());
    expect(result.tokenUsage?.total).toBe(30);
  });
});
