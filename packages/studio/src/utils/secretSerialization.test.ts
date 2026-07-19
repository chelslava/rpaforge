import { describe, expect, test } from 'vitest';
import {
  isOpaqueSecretReference,
  sanitizeSecretVariable,
  sanitizeVariableMapForPersistence,
  sanitizeVariablesForPersistence,
} from './secretSerialization';

describe('secret serialization', () => {
  test('removes a plaintext secret without mutating the source', () => {
    const source = { name: 'token', type: 'secret', value: 'do-not-persist', scope: 'process' };

    const sanitized = sanitizeSecretVariable(source);

    expect(sanitized).toEqual({ ...source, value: '' });
    expect(source.value).toBe('do-not-persist');
  });

  test('preserves an opaque reference while removing its value', () => {
    const sanitized = sanitizeSecretVariable({
      name: 'token',
      type: 'secret',
      value: 'plaintext',
      secretRef: 'secret://vault-item-1',
    });

    expect(sanitized).toMatchObject({ value: '', secretRef: 'secret://vault-item-1' });
    expect(JSON.stringify(sanitized)).not.toContain('plaintext');
  });

  test('migrates a legacy opaque value into the reference field', () => {
    const sanitized = sanitizeSecretVariable({
      name: 'token',
      type: 'secret',
      value: 'opaque://vault-item-2',
    });

    expect(sanitized).toEqual({
      name: 'token',
      type: 'secret',
      value: '',
      secretRef: 'opaque://vault-item-2',
    });
  });

  test('leaves non-secret values unchanged and supports custom ref keys', () => {
    const variable = { name: 'count', type: 'number', value: '42' };
    expect(sanitizeSecretVariable(variable)).toEqual(variable);

    const sanitized = sanitizeSecretVariable(
      { name: 'token', type: 'secret', value: 'plaintext', vaultId: 'vault-1' },
      { referenceKey: 'vaultId' }
    );
    expect(sanitized).toEqual({ name: 'token', type: 'secret', value: '', vaultId: 'vault-1' });
  });

  test('sanitizes arrays and project variable maps', () => {
    const variables = [
      { name: 'token', type: 'secret', value: 'plaintext' },
      { name: 'host', type: 'string', value: 'example.test' },
    ];
    expect(sanitizeVariablesForPersistence(variables)).toEqual([
      { name: 'token', type: 'secret', value: '' },
      { name: 'host', type: 'string', value: 'example.test' },
    ]);
    expect(sanitizeVariableMapForPersistence({ main: variables })).toEqual({
      main: [
        { name: 'token', type: 'secret', value: '' },
        { name: 'host', type: 'string', value: 'example.test' },
      ],
    });
  });

  test('recognizes only explicitly opaque URI references', () => {
    expect(isOpaqueSecretReference('secret://vault-item')).toBe(true);
    expect(isOpaqueSecretReference('opaque://vault-item')).toBe(true);
    expect(isOpaqueSecretReference('plaintext')).toBe(false);
  });
});
