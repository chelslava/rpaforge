/**
 * Display-safe conversions for unknown values (issue #885).
 *
 * `String(value)` on objects yields '[object Object]' — every call-site
 * here actually wants primitives verbatim and JSON for the rest, and
 * error messages want `error.message` rather than a JSON dump.
 */

export function toDisplayString(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return String(value);
  }
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString();
  try {
    return JSON.stringify(value) ?? '';
  } catch {
    return '[unserializable]';
  }
}

export function toErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return toDisplayString(error);
}
