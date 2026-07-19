import { describe, expect, it } from 'vitest';
import { isLocalEndpoint, redactSensitive } from './privacy';

describe('AI privacy policy', () => {
  it('redacts sensitive field names and values recursively', () => {
    const source = {
      variables: [{ name: 'password', value: 'hunter2' }, { name: 'host', value: 'example.test' }],
      defaults: { api_key: 'key-value' },
    };
    const result = redactSensitive(source);

    expect(JSON.stringify(result.value)).not.toContain('hunter2');
    expect(JSON.stringify(result.value)).not.toContain('key-value');
    expect(result.value.variables[0]).toEqual({ name: '[REDACTED]', value: '[REDACTED]' });
    expect(result.report.redactedCount).toBeGreaterThanOrEqual(3);
    expect(result.report.categories).toContain('field-name');
  });

  it.each([
    ['Bearer abc.def.ghi', 'token'],
    ['https://user:password@example.test/api', 'url-credential'],
    ['-----BEGIN PRIVATE KEY-----\nsecret\n-----END PRIVATE KEY-----', 'private-key'],
  ])('redacts %s', (value, category) => {
    const result = redactSensitive({ prompt: value });
    expect(JSON.stringify(result.value)).not.toContain(value);
    expect(result.report.categories).toContain(category);
  });

  it('keeps ordinary context and reports no redactions', () => {
    const result = redactSensitive({ activity: 'Open browser', value: 'example.test' });
    expect(result.value).toEqual({ activity: 'Open browser', value: 'example.test' });
    expect(result.report).toEqual({ redactedCount: 0, categories: [] });
  });

  it.each([
    ['ollama', undefined, true],
    ['ollama', 'http://127.0.0.1:11434', true],
    ['ollama', 'http://remote.example:11434', false],
    ['openai-compatible', 'http://localhost:8080/v1', true],
    ['openai-compatible', 'https://api.openai.com/v1', false],
    ['openai-compatible', 'not-a-url', false],
  ])('classifies local endpoint %s %s', (provider, baseUrl, expected) => {
    expect(isLocalEndpoint(provider, baseUrl)).toBe(expected);
  });
});
