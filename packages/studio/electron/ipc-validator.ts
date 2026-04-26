import { type IpcMainInvokeEvent } from 'electron';
import Ajv from 'ajv';
import { schemas } from '../src/types/ipc-schemas';

const ajv = new Ajv({ allErrors: true, strict: false });

const compiledSchemas = new Map<string, any>();
for (const [schemaId, schemaDef] of Object.entries(schemas)) {
  try {
    compiledSchemas.set(schemaId, ajv.compile(schemaDef));
  } catch (error) {
    console.error(`Failed to compile schema ${schemaId}:`, error);
  }
}

export function validateIPCPayload(
  event: IpcMainInvokeEvent,
  schemaName: string,
  payload: unknown,
): void {
  if (!event || !event.sender) {
    throw new Error('Invalid IPC event');
  }

  const validator = compiledSchemas.get(schemaName);
  if (!validator) {
    console.warn(`No schema found for ${schemaName}, skipping validation`);
    return;
  }

  if (!validator(payload)) {
    const errors = validator.errors?.map((e: any) => `${e.instancePath} ${e.message}`).join(', ') || 'Unknown validation error';
    throw new Error(`Invalid IPC payload for ${schemaName}: ${errors}`);
  }
}

export function validateSafeString(value: unknown, paramName: string): void {
  if (typeof value !== 'string') {
    throw new Error(`Invalid IPC payload: ${paramName} must be a string`);
  }

  if (value.includes('\x00') || /[\x00-\x08\x0B\x0C\x0E-\x1F]/.test(value)) {
    throw new Error(`Invalid IPC payload: ${paramName} contains invalid characters`);
  }
}

export function validateFilePath(value: unknown, paramName: string): void {
  if (typeof value !== 'string') {
    throw new Error(`Invalid IPC payload: ${paramName} must be a string`);
  }

  if (value.includes('\x00') || /[\x00-\x1F]/.test(value)) {
    throw new Error(`Invalid IPC payload: ${paramName} contains invalid characters`);
  }

  if (value.includes('..')) {
    throw new Error(`Invalid IPC payload: ${paramName} contains invalid path traversal`);
  }
}

export function validateMethodName(value: unknown): void {
  if (typeof value !== 'string') {
    throw new Error('Invalid IPC payload: method name must be a string');
  }

  if (!/^[a-zA-Z0-9_.]+$/.test(value)) {
    throw new Error('Invalid IPC payload: method name contains invalid characters');
  }
}
