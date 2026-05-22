import { type IpcMainInvokeEvent } from 'electron';
import path from 'node:path';
import Ajv from 'ajv';
import { schemas } from '../src/types/ipc-schemas';

const ajv = new Ajv({ allErrors: false, strict: false });

let projectRoot: string | null = null;

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
    console.error(`[IPC Security] No schema registered for channel "${schemaName}" — request blocked`);
    throw new Error(`[IPC Security] No schema registered for channel "${schemaName}" — request blocked`);
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

export function validateFilePath(value: unknown, paramName: string, allowedRoot: string | null = null): void {
  if (typeof value !== 'string') {
    throw new Error(`Invalid IPC payload: ${paramName} must be a string`);
  }

  if (value.includes('\x00') || /[\x00-\x1F]/.test(value)) {
    throw new Error(`Invalid IPC payload: ${paramName} contains invalid characters`);
  }

  const resolved = path.resolve(value);
  const cwd = path.resolve(process.cwd());
  const baseDir = allowedRoot ? path.resolve(allowedRoot) : cwd;

  if (!resolved.startsWith(baseDir + path.sep) && resolved !== baseDir) {
    if (!resolved.startsWith(cwd + path.sep) && resolved !== cwd) {
      throw new Error(`Invalid IPC payload: ${paramName} is outside the allowed project directory`);
    }
  }

  const blockedSegments = ['.ssh', '.aws', '.gnupg', '.rpaforge', '.config' + path.sep + 'gh'];
  if (blockedSegments.some((seg) => resolved.includes(path.sep + seg + path.sep) || resolved.endsWith(path.sep + seg))) {
    throw new Error(`Invalid IPC payload: ${paramName} accesses a restricted path`);
  }
}

export function setProjectRoot(root: string | null): void {
  projectRoot = root;
}

export function getProjectRoot(): string | null {
  return projectRoot;
}

export function validateProjectFilePath(value: unknown, paramName: string): void {
  const root = getProjectRoot();
  if (!root) {
    throw new Error('IPC Security: project root not set — FS operation blocked');
  }
  validateFilePath(value, paramName, root);
}

export function validateMethodName(value: unknown): void {
  if (typeof value !== 'string') {
    throw new Error('Invalid IPC payload: method name must be a string');
  }

  if (!/^[a-zA-Z0-9_.]+$/.test(value)) {
    throw new Error('Invalid IPC payload: method name contains invalid characters');
  }
}
