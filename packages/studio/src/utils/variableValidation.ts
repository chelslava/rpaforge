const PYTHON_RESERVED_KEYWORDS = new Set([
  'False',
  'None',
  'True',
  'and',
  'as',
  'assert',
  'async',
  'await',
  'break',
  'class',
  'continue',
  'def',
  'del',
  'elif',
  'else',
  'except',
  'finally',
  'for',
  'from',
  'global',
  'if',
  'import',
  'in',
  'is',
  'lambda',
  'nonlocal',
  'not',
  'or',
  'pass',
  'raise',
  'return',
  'try',
  'while',
  'with',
  'yield'
]);

export function getVariableNameError(name: string): string | null {
  if (!name.trim()) {
    return 'Variable name is required';
  }

  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
    return 'Variable name must be a valid Python identifier (letters, numbers, underscores, cannot start with number)';
  }

  if (PYTHON_RESERVED_KEYWORDS.has(name)) {
    return 'Variable name cannot be a Python reserved keyword';
  }

  return null;
}

export function assertValidVariableName(name: string): void {
  const error = getVariableNameError(name);
  if (error) {
    throw new Error(error);
  }
}
