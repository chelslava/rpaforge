import { app, safeStorage } from 'electron';
import * as fs from 'node:fs';
import * as fsp from 'node:fs/promises';
import * as path from 'node:path';

const SECRET_REF_PREFIX = 'secret://';
const VARIABLE_ID_PATTERN = /^[A-Za-z0-9._:-]{1,255}$/;
const MAX_REENCRYPT_ENTRIES = 500;

/**
 * Stable message thrown when the store cannot be decrypted (typically the
 * OS-provided safeStorage key changed). Callers surface this to the user so
 * the guided re-entry flow (inspect -> reset -> reencrypt) can start.
 */
export const SECRET_STORE_SEALED_MESSAGE =
  'Secret variable store cannot be decrypted (the OS-provided key may have changed). Re-enter your secrets to rebuild the store.';

export interface SecretStoreStatus {
  available: boolean;
  backend: 'os' | 'unavailable';
}

export interface SecretStoreInspection {
  exists: boolean;
  /** Whether the store decrypts cleanly; false means a key change was detected. */
  decryptable: boolean;
  /** Non-null when the store exists but decryption failed. */
  error: string | null;
}

type SecretStoreFile = Record<string, string>;

function getStorePath(): string {
  return path.join(app.getPath('userData'), 'secret-variables.enc.json');
}

function assertVariableId(variableId: string): void {
  if (!VARIABLE_ID_PATTERN.test(variableId)) {
    throw new Error('Secret variable id is invalid.');
  }
}

function assertSecretReference(secretRef: string): void {
  if (!secretRef.startsWith(SECRET_REF_PREFIX) || secretRef.length <= SECRET_REF_PREFIX.length) {
    throw new Error('Secret variable reference is invalid.');
  }
}

function isAvailable(): boolean {
  return safeStorage.isEncryptionAvailable();
}

export function getSecretStoreStatus(): SecretStoreStatus {
  return {
    available: isAvailable(),
    backend: isAvailable() ? 'os' : 'unavailable',
  };
}

export function getSecretReference(variableId: string): string {
  assertVariableId(variableId);
  return `${SECRET_REF_PREFIX}${variableId}`;
}

function readStore(): SecretStoreFile {
  if (!fs.existsSync(getStorePath())) return {};
  if (!isAvailable()) throw new Error('OS-level encryption is unavailable on this machine.');

  const encrypted = fs.readFileSync(getStorePath());
  let decrypted: string;
  try {
    decrypted = safeStorage.decryptString(encrypted);
  } catch {
    // The Chromium-held safeStorage key no longer matches the file: the
    // ciphertext is unrecoverable, so fail with the stable sealed message
    // and never fall back to plaintext.
    throw new Error(SECRET_STORE_SEALED_MESSAGE);
  }
  const parsed: unknown = JSON.parse(decrypted);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Secret variable store is corrupted.');
  }
  return parsed as SecretStoreFile;
}

/**
 * Non-throwing store health check: detects a safeStorage key change
 * (decrypt failure) so the renderer can offer the guided re-entry flow.
 */
export function inspectSecretStore(): SecretStoreInspection {
  if (!fs.existsSync(getStorePath())) {
    return { exists: false, decryptable: true, error: null };
  }
  if (!isAvailable()) {
    return { exists: true, decryptable: false, error: 'OS-level encryption is unavailable on this machine.' };
  }
  try {
    readStore();
    return { exists: true, decryptable: true, error: null };
  } catch (error) {
    return {
      exists: true,
      decryptable: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Delete the sealed store. Values are unrecoverable after a key change —
 * the caller runs the guided re-entry flow (secret:set per variable) or
 * the explicit reencrypt action afterwards.
 */
export async function resetSecretStore(): Promise<void> {
  await fsp.rm(getStorePath(), { force: true });
}

/**
 * Guided re-entry / maintenance action: rebuild the store atomically from
 * freshly entered variable values. No plaintext fallback file is ever
 * written — only the safeStorage-encrypted blob lands on disk.
 */
export async function reencryptSecretStore(
  entries: Record<string, string>,
): Promise<{ secretRefs: string[] }> {
  const ids = Object.keys(entries);
  if (ids.length > MAX_REENCRYPT_ENTRIES) {
    throw new Error('Too many secret entries.');
  }
  const store: SecretStoreFile = {};
  for (const variableId of ids) {
    const value = entries[variableId];
    if (typeof value !== 'string' || value.length > 16384) {
      throw new Error('Secret variable value is invalid.');
    }
    store[getSecretReference(variableId)] = value;
  }
  await writeStore(store);
  return { secretRefs: Object.keys(store) };
}

async function writeStore(store: SecretStoreFile): Promise<void> {
  if (!isAvailable()) throw new Error('OS-level encryption is unavailable on this machine.');

  const storePath = getStorePath();
  const encrypted = safeStorage.encryptString(JSON.stringify(store));
  const temporaryPath = `${storePath}.${process.pid}.tmp`;
  await fsp.mkdir(path.dirname(storePath), { recursive: true });
  await fsp.writeFile(temporaryPath, encrypted);
  await fsp.rename(temporaryPath, storePath);
}

export async function setSecret(variableId: string, value: string): Promise<string> {
  const secretRef = getSecretReference(variableId);
  if (typeof value !== 'string' || value.length > 16384) {
    throw new Error('Secret variable value is invalid.');
  }
  const store = readStore();
  store[secretRef] = value;
  await writeStore(store);
  return secretRef;
}

export function getSecret(secretRef: string): string | null {
  assertSecretReference(secretRef);
  return readStore()[secretRef] ?? null;
}

export async function deleteSecret(secretRef: string): Promise<void> {
  assertSecretReference(secretRef);
  const store = readStore();
  if (!(secretRef in store)) return;
  delete store[secretRef];
  await writeStore(store);
}

