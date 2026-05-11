import { describe, expect, test } from 'vitest';
import { getVariableNameError } from './variableValidation';

describe('variableValidation', () => {
  test('rejects Python reserved keywords exactly', () => {
    expect(getVariableNameError('class')).toContain('Python reserved keyword');
    expect(getVariableNameError('return')).toContain('Python reserved keyword');
  });

  test('allows identifiers that only differ from Python keywords by case', () => {
    expect(getVariableNameError('Class')).toBeNull();
    expect(getVariableNameError('Return')).toBeNull();
  });
});
