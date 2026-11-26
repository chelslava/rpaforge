import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
  PromptError,
  getTemplate,
  renderPrompt,
  templateDigest,
  templateIds,
} from './registry';

const EXPECTED_IDS = [
  'assistant.retry_invalid_json',
  'assistant.retry_problems',
  'assistant.retry_truncated',
  'assistant.retry_validation',
  'assistant.system',
  'diagnosis.retry_invalid_json',
  'diagnosis.retry_problems',
  'diagnosis.retry_truncated',
  'diagnosis.retry_validation',
  'diagnosis.system',
  'diagram.retry_invalid_json',
  'diagram.retry_problems',
  'diagram.retry_truncated',
  'diagram.retry_validation',
  'diagram.system',
  'param_fill.system',
  'param_fill.user',
  'suggestions.system',
  'suggestions.user',
];

describe('prompt registry', () => {
  it('registers every studio template at v1', () => {
    expect(templateIds()).toEqual(EXPECTED_IDS);
    for (const id of templateIds()) {
      expect(getTemplate(id).version).toBe(1);
      expect(getTemplate(id).description.length).toBeGreaterThan(0);
    }
  });

  it('renders identity fields for telemetry', () => {
    const rendered = renderPrompt('diagnosis.system');
    expect(rendered.promptId).toBe('diagnosis.system');
    expect(rendered.promptVersion).toBe(1);
    expect(rendered.text.startsWith('You diagnose a failed RPA process run.')).toBe(true);
  });

  it('fails closed on unknown ids', () => {
    expect(() => renderPrompt('no.such_prompt')).toThrow(PromptError);
    expect(() => renderPrompt('no.such_prompt')).toThrow(/Unknown prompt id/);
  });

  it('fails closed on missing or extra variables', () => {
    expect(() => renderPrompt('diagram.retry_validation', { prompt: 'p' })).toThrow(
      /missing .*errors/
    );
    expect(() =>
      renderPrompt('diagram.retry_truncated', { prompt: 'p', extra: 'x' })
    ).toThrow(/unexpected/);
  });

  it('replaces every placeholder occurrence and leaves no residue', () => {
    const rendered = renderPrompt('suggestions.system', {
      selectedActivityId: 'ACT-ID-XYZ',
      selectedActivityCategory: 'web',
      processList: '- `Other` (web) — Other',
      variableList: '',
    });
    expect(rendered.text.includes('{{')).toBe(false);
    // selectedActivityId appears twice in the template (task + context sections)
    expect(rendered.text.split('ACT-ID-XYZ').length - 1).toBe(2);
    expect(rendered.text.includes('"ACT-ID-XYZ" (web)')).toBe(true);
  });

  it('digest is the sha256 of the raw template text', () => {
    const template = getTemplate('param_fill.system');
    const expected = createHash('sha256')
      .update(template.template, 'utf8')
      .digest('hex');
    expect(templateDigest('param_fill.system')).toBe(expected);
  });

  it('digest would change when template text changes', () => {
    const template = getTemplate('param_fill.system');
    const mutated = template.template.replace('helpful', 'structured');
    const mutatedDigest = createHash('sha256').update(mutated, 'utf8').digest('hex');
    expect(mutatedDigest).not.toBe(templateDigest('param_fill.system'));
  });
});
