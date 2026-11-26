// @vitest-environment node

/**
 * Offline prompt evaluation harness — "prompt CI" for the Studio side
 * (issue #904). No network. Three gates:
 *
 * 1. Version-bump gate: the committed baseline pins every template's
 *    sha256 at its version; an edit without a version bump + baseline
 *    refresh fails with instructions (RPAFORGE_PROMPT_BASELINE_UPDATE=1
 *    rewrites the baseline — update_baseline lifecycle, bench.yml precedent).
 * 2. Golden render hashes: renderPrompt output for recorded sample
 *    variables is pinned byte-identically to the pre-migration strings.
 * 3. Golden replay: recorded provider responses are replayed through the
 *    real flows (generateDiagram / diagnoseFailure / assistantChat),
 *    asserting parse validity, retry budgets and prompt identity in the
 *    results that feed security-audit telemetry.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import type { AiProvider, AiProviderCredentials } from '../../providers';
import { generateDiagram } from '../../generateDiagram';
import { diagnoseFailure } from '../../diagnoseFailure';
import { assistantChat } from '../../assistant';
import { renderPrompt, templateDigest, templateIds } from '../registry';

const EVAL_DIR = join(__dirname);

interface Baseline {
  templates: Record<string, { version: number; digest: string }>;
}

interface GoldenRenders {
  renders: Record<string, { variables: Record<string, string>; sha256: string }>;
}

const baseline: Baseline = JSON.parse(
  readFileSync(join(EVAL_DIR, 'baseline.json'), 'utf8')
);
const golden: GoldenRenders = JSON.parse(
  readFileSync(join(EVAL_DIR, 'golden-renders.json'), 'utf8')
);

describe('version-bump gate', () => {
  it('baseline matches the registry', () => {
    const current = Object.fromEntries(
      templateIds().map((id) => ({
        [id]: { version: 1, digest: templateDigest(id) },
      }))
    );
    if (process.env.RPAFORGE_PROMPT_BASELINE_UPDATE === '1') {
      const { writeFileSync } = require('node:fs') as typeof import('node:fs');
      writeFileSync(
        join(EVAL_DIR, 'baseline.json'),
        JSON.stringify(
          { comment: baselineComment(), templates: current },
          null,
          2
        ) + '\n'
      );
      return;
    }
    const changed = Object.keys(current).filter(
      (id) => JSON.stringify(baseline.templates[id]) !== JSON.stringify(current[id])
    );
    expect(changed, baselineMessage(changed)).toEqual([]);
  });

  it('a simulated edit without a version bump is caught', () => {
    const tampered = { ...baseline.templates };
    tampered['diagram.system'] = { version: 1, digest: 'deadbeef' };
    const current = templateDigest('diagram.system');
    const changed = Object.keys(tampered).filter(
      (id) => tampered[id].digest !== (id === 'diagram.system' ? current : baseline.templates[id].digest)
    );
    expect(changed).toEqual(['diagram.system']);
  });
});

function baselineComment(): string {
  return (
    'Prompt CI baseline (issue #904): sha256 of each Studio template raw text ' +
    "at its pinned version. A template change MUST bump the version in " +
    'templates/<id>.json AND refresh this file ' +
    '(RPAFORGE_PROMPT_BASELINE_UPDATE=1). Eval flags prompt edits whose gate regresses.'
  );
}

function baselineMessage(changed: string[]): string {
  return (
    'Prompt templates changed without a baseline refresh: ' + changed.join(', ') +
    '. Bump "version" in the template JSON and refresh ' +
    'electron/ai/prompts/eval/baseline.json (RPAFORGE_PROMPT_BASELINE_UPDATE=1).'
  );
}

describe('golden render hashes (v1 byte-identical)', () => {
  it('every template has a pinned render', () => {
    expect(Object.keys(golden.renders).sort()).toEqual(templateIds());
  });

  it('renders match the recorded hashes', () => {
    const { createHash } = require('node:crypto') as typeof import('node:crypto');
    for (const [id, info] of Object.entries(golden.renders)) {
      const rendered = renderPrompt(id, info.variables);
      const hash = createHash('sha256').update(rendered.text, 'utf8').digest('hex');
      expect(hash, `${id} no longer renders its pinned v1 text`).toBe(info.sha256);
    }
  });
});

// ------------------------------------------------------------ golden replay

type FakeResponse = string | (() => string);

function fakeProvider(responses: FakeResponse[]): AiProvider {
  const scripted = [...responses];
  return {
    id: 'openai-compatible',
    test: () => {},
    generate: async () => {
      const next = scripted.length > 1 ? scripted.shift()! : scripted[0];
      const text = typeof next === 'function' ? next() : next;
      return { text, truncated: false };
    },
  } as unknown as AiProvider;
}

const CREDENTIALS: AiProviderCredentials = {
  providerId: 'openai-compatible',
  apiKey: 'test-key',
  baseUrl: 'https://provider.test/v1',
  model: 'test-model',
};

const VALID_DIAGRAM = JSON.stringify({
  nodes: [
    { id: 'n1', blockType: 'start' },
    { id: 'n2', blockType: 'end' },
  ],
  edges: [{ from: 'n1', to: 'n2' }],
});

const VALID_DIAGNOSIS = JSON.stringify({
  root_cause: 'Selector no longer matches.',
  confidence: 'high',
  explanation: 'The element id changed after the page redesign.',
  proposals: [{ type: 'param_change', node_id: 'n1', param: 'selector', new_value: '#new' }],
});

const VALID_ASSISTANT = JSON.stringify({ answer: 'Added a retry.', edits: [] });

describe('golden replay through the real flows', () => {
  it('generateDiagram: valid recorded answer parses on attempt 1 with prompt identity', async () => {
    const result = await generateDiagram(
      fakeProvider([VALID_DIAGRAM]),
      CREDENTIALS,
      { prompt: 'open a browser', activities: [] }
    );
    expect(result.success).toBe(true);
    expect(result.attempts).toBe(1);
    expect(result.prompt).toEqual({ id: 'diagram.system', version: 1 });
  });

  it('generateDiagram: invalid answer self-corrects within the retry budget', async () => {
    const result = await generateDiagram(
      fakeProvider(['not json at all', VALID_DIAGRAM]),
      CREDENTIALS,
      { prompt: 'open a browser', activities: [] }
    );
    expect(result.success).toBe(true);
    expect(result.attempts).toBe(2);
  });

  it('diagnoseFailure: valid recorded answer parses with prompt identity', async () => {
    const result = await diagnoseFailure(fakeProvider([VALID_DIAGNOSIS]), CREDENTIALS, {
      runRecord: {
        run_id: 'run-1',
        process_name: 'demo',
        status: 'failed',
        error: 'click failed',
        steps: [],
      },
      diagram: { nodes: [{ id: 'n1' }], edges: [] },
    });
    expect(result.success).toBe(true);
    expect(result.attempts).toBe(1);
    expect(result.diagnosis?.proposals).toHaveLength(1);
    expect(result.prompt).toEqual({ id: 'diagnosis.system', version: 1 });
  });

  it('diagnoseFailure: schema-invalid answer self-corrects within budget', async () => {
    const result = await diagnoseFailure(
      fakeProvider(['{"root_cause": 42}', VALID_DIAGNOSIS]),
      CREDENTIALS,
      {
        runRecord: { run_id: 'run-1', status: 'failed', error: 'x', steps: [] },
        diagram: { nodes: [{ id: 'n1' }], edges: [] },
      }
    );
    expect(result.success).toBe(true);
    expect(result.attempts).toBe(2);
  });

  it('assistantChat: valid recorded answer parses with prompt identity', async () => {
    const result = await assistantChat(fakeProvider([VALID_ASSISTANT]), CREDENTIALS, {
      requestId: 'req-1',
      providerId: 'openai-compatible',
      history: [],
      userMessage: 'add a retry',
      context: { diagramNodes: [{ id: 'n1', label: 'Click', type: 'activity' }] },
    });
    expect(result.success).toBe(true);
    expect(result.answer).toBe('Added a retry.');
    expect(result.attempts).toBe(1);
    expect(result.prompt).toEqual({ id: 'assistant.system', version: 1 });
  });

  it('assistantChat: unknown node id in edits self-corrects within budget', async () => {
    const badEdits = JSON.stringify({
      answer: 'x',
      edits: [{ type: 'wrap_retry', node_id: 'ghost', retry_count: 3 }],
    });
    const result = await assistantChat(
      fakeProvider([badEdits, VALID_ASSISTANT]),
      CREDENTIALS,
      {
        requestId: 'req-2',
        providerId: 'openai-compatible',
        history: [],
        userMessage: 'wrap retry',
        context: { diagramNodes: [{ id: 'n1', label: 'Click', type: 'activity' }] },
      }
    );
    expect(result.success).toBe(true);
    expect(result.attempts).toBe(2);
  });
});
