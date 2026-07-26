import { app, safeStorage } from 'electron';
import * as fs from 'node:fs';
import * as fsp from 'node:fs/promises';
import * as path from 'node:path';

const SECRET_REF_PREFIX = 'secret://';
const VARIABLE_ID_PATTERN = /^[A-Za-z0-9._:-]{1,255}$/;

export interface SecretStoreStatus {
  available: boolean;
  backend: 'os' | 'unavailable';
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
  const decrypted = safeStorage.decryptString(encrypted);
  const parsed: unknown = JSON.parse(decrypted);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Secret variable store is corrupted.');
  }
  return parsed as SecretStoreFile;
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

