import { describe, expect, test } from 'vitest';
import {
  CONNECTION_STYLES,
  createConnection,
  getConnectionType,
  validateConnection,
} from './connections';

describe('connections', () => {
  test('branch handles produce parallel edge semantics', () => {
    const edge = createConnection('parallel', 'target', 'branch-1', 'input');

    expect(edge.sourceHandle).toBe('branch-1');
    expect(edge.targetHandle).toBe('input');
    expect(edge.data?.type).toBe('parallel');
    expect(edge.style).toMatchObject({
      stroke: CONNECTION_STYLES.parallel.color,
      strokeWidth: CONNECTION_STYLES.parallel.strokeWidth,
    });
  });

  test('getConnectionType maps typed handles', () => {
    expect(getConnectionType('true', 'input')).toBe('true');
    expect(getConnectionType('false', 'input')).toBe('false');
    expect(getConnectionType('error', 'input')).toBe('error');
    expect(getConnectionType('branch-2', 'input')).toBe('parallel');
  });

  test('validateConnection rejects non-input targets for typed outputs', () => {
    expect(validateConnection('parallel', 'branch-1', 'activity', 'input').isValid).toBe(true);
    expect(validateConnection('parallel', 'branch-1', 'activity', 'error')).toEqual({
      isValid: false,
      message: 'Parallel branches must connect to an input port.',
    });
  });
});
