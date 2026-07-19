/**
 * Redaction helpers for renderer-owned project and recovery payloads.
 *
 * Secret values must be resolved by the privileged process. Persisted
 * renderer data may carry only an opaque reference, never the value itself.
 * The reference field is deliberately configurable so it can follow the
 * typed main-process contract without coupling this utility to IPC types.
 */

export interface SecretSerializationOptions {
  referenceKey?: string;
}

export type SerializableVariable = {
  type?: unknown;
  value?: unknown;
};

const DEFAULT_REFERENCE_KEY = 'secretRef';
const OPAQUE_REFERENCE_PATTERN = /^(?:secret|opaque):\/\/[^\s]+$/i;

export function isOpaqueSecretReference(value: unknown): value is string {
  return typeof value === 'string' && OPAQUE_REFERENCE_PATTERN.test(value);
}

/**
 * Return a persistence-safe copy of one variable without mutating renderer
 * state. Non-secret variables are copied unchanged. Secret `value` fields are
 * always blanked; an existing opaque reference is retained in `referenceKey`.
 */
export function sanitizeSecretVariable<T extends SerializableVariable>(
  variable: T,
  options: SecretSerializationOptions = {}
): T {
  if (variable.type !== 'secret') {
    return { ...variable };
  }

  const referenceKey = options.referenceKey ?? DEFAULT_REFERENCE_KEY;
  const record = variable as Record<string, unknown>;
  const existingReference = record[referenceKey];
  const valueReference = isOpaqueSecretReference(variable.value) ? variable.value : undefined;
  const reference = typeof existingReference === 'string' && existingReference.length > 0
    ? existingReference
    : valueReference;

  const sanitized = { ...variable, value: '' } as T;
  if (reference) {
    (sanitized as Record<string, unknown>)[referenceKey] = reference;
  } else {
    delete (sanitized as Record<string, unknown>)[referenceKey];
  }
  return sanitized;
}

export function sanitizeVariablesForPersistence<T extends SerializableVariable>(
  variables: readonly T[],
  options: SecretSerializationOptions = {}
): T[] {
  return variables.map((variable) => sanitizeSecretVariable(variable, options));
}

export function sanitizeVariableMapForPersistence<T extends SerializableVariable>(
  variables: Record<string, readonly T[]>,
  options: SecretSerializationOptions = {}
): Record<string, T[]> {
  return Object.fromEntries(
    Object.entries(variables).map(([key, values]) => [
      key,
      sanitizeVariablesForPersistence(values, options),
    ])
  );
}
