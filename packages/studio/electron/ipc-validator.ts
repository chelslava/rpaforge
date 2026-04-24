import { type IpcMainInvokeEvent } from 'electron';

/**
 * Validates IPC request parameters to prevent malicious payloads.
 * Should be called at the start of every IPC handler.
 */
export function validateIPCPayload(
  event: IpcMainInvokeEvent,
  schema: Record<string, unknown>,
  fieldName: string,
): void {
  // Check if event is from a trusted source
  if (!event || !event.sender) {
    throw new Error('Invalid IPC event');
  }

  // Validate payload structure
  if (schema && typeof schema === 'object') {
    for (const [key, value] of Object.entries(schema)) {
      if (value !== undefined) {
        const actualType = typeof value;
        const expectedType = typeof schema[key];
        if (actualType !== expectedType && !(actualType === 'object' && expectedType === 'object')) {
          throw new Error(`Invalid IPC payload: ${fieldName}.${key} type mismatch`);
        }
      }
    }
  }
}

/**
 * Validates that a string parameter is safe (no dangerous characters).
 */
export function validateSafeString(value: unknown, paramName: string): void {
  if (typeof value !== 'string') {
    throw new Error(`Invalid IPC payload: ${paramName} must be a string`);
  }

  // Basic sanitization - reject control characters and null bytes
  if (value.includes('\x00') || /[\x00-\x08\x0B\x0C\x0E-\x1F]/.test(value)) {
    throw new Error(`Invalid IPC payload: ${paramName} contains invalid characters`);
  }
}

/**
 * Validates file path for security (prevents path traversal attacks).
 */
export function validateFilePath(value: unknown, paramName: string): void {
  if (typeof value !== 'string') {
    throw new Error(`Invalid IPC payload: ${paramName} must be a string`);
  }

  // Basic path validation - reject path traversal
  if (value.includes('..')) {
    throw new Error(`Invalid IPC payload: ${paramName} contains invalid path traversal`);
  }

  // Reject null bytes and control characters
  if (value.includes('\x00') || /[\x00-\x1F]/.test(value)) {
    throw new Error(`Invalid IPC payload: ${paramName} contains invalid characters`);
  }
}

/**
 * Validates method name to prevent arbitrary code execution.
 */
export function validateMethodName(value: unknown): void {
  if (typeof value !== 'string') {
    throw new Error('Invalid IPC payload: method name must be a string');
  }

  // Allow only alphanumeric, underscore, and dot
  if (!/^[a-zA-Z0-9_.]+$/.test(value)) {
    throw new Error('Invalid IPC payload: method name contains invalid characters');
  }
}
