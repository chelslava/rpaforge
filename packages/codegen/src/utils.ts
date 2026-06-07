/**
 * Code generation utilities
 */

export function getActivityKeyword(blockData: Record<string, unknown>): string {
  const activityId = (blockData.activityId as string | undefined) || (blockData.name as string | undefined) || 'Log';
  return activityId.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

export function formatSwitchCondition(expression: string, value: string): string {
  const normalizedValue = value.trim();
  if (!normalizedValue) {
    return expression;
  }

  if (
    normalizedValue.startsWith('${') ||
    normalizedValue.startsWith('@{') ||
    normalizedValue.startsWith('&{') ||
    normalizedValue.startsWith('%{')
  ) {
    return `${expression} == ${normalizedValue}`;
  }

  if (normalizedValue.replace('.', '').match(/^\d+$/)) {
    return `${expression} == ${normalizedValue}`;
  }

  const escapedValue = normalizedValue.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  return `${expression} == '${escapedValue}'`;
}

export function reprValue(value: unknown): string {
  if (value === null || value === undefined) {
    return 'None';
  }
  if (typeof value === 'boolean') {
    return value ? 'True' : 'False';
  }
  if (typeof value === 'number') {
    return String(value);
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed === 'true' || trimmed === 'True') {
      return 'True';
    }
    if (trimmed === 'false' || trimmed === 'False') {
      return 'False';
    }
    if (trimmed.startsWith('${') || trimmed.startsWith('@{') || trimmed.startsWith('&{')) {
      return trimmed;
    }
    return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
  }
  return `"${String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

export function sanitizeIdentifier(name: string): string {
  const sanitized = name.replace(/[^a-zA-Z0-9_]/g, '_');
  if (sanitized && sanitized[0].match(/\d/)) {
    return `_${sanitized}`;
  }
  return sanitized || 'process';
}

export function sanitizeString(str: string): string {
  // eslint-disable-next-line no-control-regex
  return str.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
}
