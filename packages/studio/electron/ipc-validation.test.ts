// @vitest-environment node

import { describe, expect, test } from 'vitest';
import Ajv from 'ajv';
import { schemas } from '../src/types/ipc-schemas';

const ajv = new Ajv({ allErrors: false, strict: false });

describe('IPC schema validation (log:write + spy channels)', () => {
  describe('log:write', () => {
    const validate = ajv.compile(schemas['log:write']);

    test('accepts a well-formed log entry', () => {
      expect(
        validate({
          level: 'info',
          scope: 'renderer',
          message: 'Hello',
          timestamp: '2026-08-16T00:00:00.000Z',
        })
      ).toBe(true);
    });

    test('accepts optional details field', () => {
      expect(
        validate({
          level: 'error',
          scope: 'bridge',
          message: 'boom',
          details: { code: 42 },
          timestamp: '2026-08-16T00:00:00.000Z',
        })
      ).toBe(true);
    });

    test('rejects an invalid level', () => {
      expect(
        validate({
          level: 'verbose',
          scope: 's',
          message: 'x',
          timestamp: 't',
        })
      ).toBe(false);
    });

    test('rejects a missing required field', () => {
      expect(
        validate({
          level: 'info',
          scope: 's',
          message: 'x',
        })
      ).toBe(false);
    });

    test('rejects additional unknown properties', () => {
      expect(
        validate({
          level: 'info',
          scope: 's',
          message: 'x',
          timestamp: 't',
          evil: true,
        })
      ).toBe(false);
    });

    test('rejects very long messages', () => {
      expect(
        validate({
          level: 'info',
          scope: 's',
          message: 'x'.repeat(20001),
          timestamp: 't',
        })
      ).toBe(false);
    });
  });

  describe('spy_start / spy_stop', () => {
    test('spy_start accepts a valid mode', () => {
      const validate = ajv.compile(schemas['spy_start']);
      expect(validate({ mode: 'web' })).toBe(true);
      expect(validate({ mode: 'desktop' })).toBe(true);
    });

    test('spy_start rejects an invalid mode', () => {
      const validate = ajv.compile(schemas['spy_start']);
      expect(validate({ mode: 'mobile' })).toBe(false);
      expect(validate({})).toBe(false);
    });

    test('spy_stop accepts an empty payload', () => {
      const validate = ajv.compile(schemas['spy_stop']);
      expect(validate({})).toBe(true);
    });
  });
});