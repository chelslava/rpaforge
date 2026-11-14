import { describe, expect, test } from 'vitest';

import { toDisplayString, toErrorMessage } from './toDisplayString';

describe('toDisplayString', () => {
  test('passes strings through unchanged, including the empty string', () => {
    expect(toDisplayString('hello')).toBe('hello');
    expect(toDisplayString('')).toBe('');
  });

  test('stringifies numbers, booleans and bigints', () => {
    expect(toDisplayString(42)).toBe('42');
    expect(toDisplayString(0)).toBe('0');
    expect(toDisplayString(-1.5)).toBe('-1.5');
    expect(toDisplayString(true)).toBe('true');
    expect(toDisplayString(false)).toBe('false');
    // JSON.stringify throws on bigint, so this is a real branch.
    expect(toDisplayString(1n)).toBe('1');
    expect(toDisplayString(-12345678901234567890n)).toBe('-12345678901234567890');
  });

  test('maps null and undefined to the empty string', () => {
    expect(toDisplayString(null)).toBe('');
    expect(toDisplayString(undefined)).toBe('');
  });

  test('formats dates as ISO strings', () => {
    expect(toDisplayString(new Date('2026-11-14T07:00:00.000Z'))).toBe('2026-11-14T07:00:00.000Z');
  });

  test('serializes plain objects and arrays as JSON', () => {
    expect(toDisplayString({ a: 1, b: 'x' })).toBe('{"a":1,"b":"x"}');
    expect(toDisplayString([1, 'two', true])).toBe('[1,"two",true]');
    expect(toDisplayString({})).toBe('{}');
  });

  test('reports cyclic objects as unserializable instead of throwing', () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(toDisplayString(cyclic)).toBe('[unserializable]');
  });

  test('maps a value whose toJSON returns undefined to the empty string', () => {
    expect(toDisplayString({ toJSON: () => undefined })).toBe('');
  });
});

describe('toErrorMessage', () => {
  test('returns the message of an Error instance', () => {
    expect(toErrorMessage(new Error('boom'))).toBe('boom');
    expect(toErrorMessage(new TypeError('wrong type'))).toBe('wrong type');
    expect(toErrorMessage(new Error(''))).toBe('');
  });

  test('passes plain strings through as-is', () => {
    expect(toErrorMessage('something failed')).toBe('something failed');
  });

  test('falls through to toDisplayString for other values', () => {
    expect(toErrorMessage({ code: 'E_FAIL' })).toBe('{"code":"E_FAIL"}');
    expect(toErrorMessage(42)).toBe('42');
    expect(toErrorMessage(null)).toBe('');
    expect(toErrorMessage(1n)).toBe('1');
  });
});
