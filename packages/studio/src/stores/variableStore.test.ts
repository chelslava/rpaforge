import { beforeEach, describe, expect, test } from 'vitest';
import { useVariableStore } from './variableStore';

describe('variableStore', () => {
  beforeEach(() => {
    useVariableStore.persist.clearStorage();
    useVariableStore.setState({ variables: [] });
  });

  test('adds variables with valid Python identifiers', () => {
    const variable = useVariableStore.getState().addVariable(
      {
        name: 'result_value',
        type: 'string',
        value: 'ok',
        scope: 'process'
      },
      'project-1'
    );

    expect(variable.name).toBe('result_value');
    expect(useVariableStore.getState().variables).toHaveLength(1);
  });

  test('allows identifiers that only differ from Python keywords by case', () => {
    const variable = useVariableStore.getState().addVariable(
      {
        name: 'Class',
        type: 'string',
        value: 'ok',
        scope: 'process'
      },
      'project-1'
    );

    expect(variable.name).toBe('Class');
  });

  test('rejects Python reserved keywords when adding variables', () => {
    expect(() =>
      useVariableStore.getState().addVariable(
        {
          name: 'class',
          type: 'string',
          value: 'bad',
          scope: 'process'
        },
        'project-1'
      )
    ).toThrow('Python reserved keyword');

    expect(useVariableStore.getState().variables).toHaveLength(0);
  });

  test('rejects Python reserved keywords when renaming variables', () => {
    const variable = useVariableStore.getState().addVariable(
      {
        name: 'safe_name',
        type: 'string',
        value: 'ok',
        scope: 'process'
      },
      'project-1'
    );

    expect(() => useVariableStore.getState().updateVariable(variable.id, { name: 'return' })).toThrow(
      'Python reserved keyword'
    );

    expect(useVariableStore.getState().variables[0].name).toBe('safe_name');
  });
});
