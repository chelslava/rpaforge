import { type IpcMainInvokeEvent } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
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

  // The target may not exist yet (creating a new file/dir), so resolve it
  // lexically and realpath only the nearest EXISTING ancestor — that defeats
  // symlink traversal while still allowing not-yet-created leaves.
  const absolute = path.resolve(value);

  const cwd = fs.realpathSync(process.cwd());
  let baseDir: string;
  try {
    baseDir = allowedRoot ? fs.realpathSync(allowedRoot) : cwd;
  } catch {
    throw new Error(`Invalid IPC payload: ${paramName} is not accessible`);
  }

  let probe = absolute;
  let realExisting: string | null = null;
  for (;;) {
    try {
      realExisting = fs.realpathSync(probe);
      break;
    } catch {
      const parent = path.dirname(probe);
      if (parent === probe) break;
      probe = parent;
    }
  }
  if (realExisting === null) {
    throw new Error(`Invalid IPC payload: ${paramName} is not accessible`);
  }

  const within = (p: string, base: string): boolean =>
    p === base || p.startsWith(base + path.sep);

  // Both the existing portion (after symlink resolution) and the full lexical
  // target must stay inside the allowed root (or the cwd fallback).
  const ok = (p: string): boolean => within(p, baseDir) || within(p, cwd);
  if (!ok(realExisting) || !ok(absolute)) {
    throw new Error(`Invalid IPC payload: ${paramName} is outside the allowed project directory`);
  }

  const blockedSegments = ['.ssh', '.aws', '.gnupg', '.rpaforge', '.config' + path.sep + 'gh'];
  if (blockedSegments.some((seg) => absolute.includes(path.sep + seg + path.sep) || absolute.endsWith(path.sep + seg))) {
    throw new Error(`Invalid IPC payload: ${paramName} accesses a restricted path`);
  }
}

const RESTRICTED_SEGMENTS = ['.ssh', '.aws', '.gnupg', '.rpaforge', '.config' + path.sep + 'gh'];

/**
 * Validate a user-chosen project root. Unlike {@link validateFilePath}, this does
 * NOT confine the path to `process.cwd()`: the project root is the trust anchor
 * the user explicitly selects (via an OS folder dialog), and every later file
 * operation is confined to it by {@link validateProjectFilePath}. It still
 * rejects sensitive system locations and anything that is not a real directory.
 * Returns the resolved absolute path.
 */
export function validateProjectRoot(value: unknown, paramName: string): string {
  if (typeof value !== 'string') {
    throw new Error(`Invalid IPC payload: ${paramName} must be a string`);
  }

  if (value.includes('\x00') || /[\x00-\x1F]/.test(value)) {
    throw new Error(`Invalid IPC payload: ${paramName} contains invalid characters`);
  }

  let resolved: string;
  try {
    resolved = fs.realpathSync(value);
  } catch {
    throw new Error(`Invalid IPC payload: ${paramName} is not accessible`);
  }

  if (!fs.statSync(resolved).isDirectory()) {
    throw new Error(`Invalid IPC payload: ${paramName} must be a directory`);
  }

  if (
    RESTRICTED_SEGMENTS.some(
      (seg) => resolved.includes(path.sep + seg + path.sep) || resolved.endsWith(path.sep + seg)
    )
  ) {
    throw new Error(`Invalid IPC payload: ${paramName} accesses a restricted path`);
  }

  return resolved;
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
