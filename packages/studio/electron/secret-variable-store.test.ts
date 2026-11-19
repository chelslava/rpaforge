import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

let homePath = '';
let encryptionAvailable = true;
let failDecryption = false;

vi.mock('electron', () => ({
  app: { getPath: () => homePath },
  safeStorage: {
    isEncryptionAvailable: () => encryptionAvailable,
    encryptString: (value: string) => Buffer.from(value, 'utf8').toString('base64'),
    decryptString: (value: string | Buffer) => {
      if (failDecryption) throw new Error('decrypt failed: key mismatch');
      return Buffer.from(value.toString(), 'base64').toString('utf8');
    },
  },
}));

import {
  SECRET_STORE_SEALED_MESSAGE,
  deleteSecret,
  getSecret,
  getSecretReference,
  getSecretStoreStatus,
  inspectSecretStore,
  reencryptSecretStore,
  resetSecretStore,
  setSecret,
} from './secret-variable-store';

describe('secret variable store', () => {
  afterEach(async () => {
    encryptionAvailable = true;
    failDecryption = false;
    if (homePath) await rm(homePath, { recursive: true, force: true });
    homePath = '';
  });

  it('stores and resolves secrets without writing plaintext to disk', async () => {
    homePath = await mkdtemp(join(tmpdir(), 'rpaforge-secrets-'));

    const secretRef = await setSecret('variable-1', 'super-secret');

    expect(secretRef).toBe('secret://variable-1');
    expect(getSecretReference('variable-1')).toBe(secretRef);
    expect(getSecret(secretRef)).toBe('super-secret');
    await expect(readFile(join(homePath, 'secret-variables.enc.json'), 'utf8')).resolves.not.toContain('super-secret');
  });

  it('deletes a stored secret and reports availability', async () => {
    homePath = await mkdtemp(join(tmpdir(), 'rpaforge-secrets-'));
    const secretRef = await setSecret('variable-2', 'temporary');

    await deleteSecret(secretRef);

    expect(getSecret(secretRef)).toBeNull();
    expect(getSecretStoreStatus()).toEqual({ available: true, backend: 'os' });
  });

  it('rejects writes when OS-backed encryption is unavailable', async () => {
    homePath = await mkdtemp(join(tmpdir(), 'rpaforge-secrets-'));
    encryptionAvailable = false;

    expect(getSecretStoreStatus()).toEqual({ available: false, backend: 'unavailable' });
    await expect(setSecret('variable-3', 'secret')).rejects.toThrow('unavailable');
  });

  it('rejects malformed ids and references', async () => {
    await expect(setSecret('../escape', 'secret')).rejects.toThrow('invalid');
    expect(() => getSecret('not-a-secret-ref')).toThrow('invalid');
  });

  it('detects a safeStorage key change without decrypting values', async () => {
    homePath = await mkdtemp(join(tmpdir(), 'rpaforge-secrets-'));
    await setSecret('variable-4', 'key-change-victim');
    failDecryption = true;

    expect(() => getSecret('secret://variable-4')).toThrow(SECRET_STORE_SEALED_MESSAGE);
    expect(inspectSecretStore()).toEqual({
      exists: true,
      decryptable: false,
      error: SECRET_STORE_SEALED_MESSAGE,
    });
  });

  it('never writes a plaintext fallback file when sealed', async () => {
    homePath = await mkdtemp(join(tmpdir(), 'rpaforge-secrets-'));
    await setSecret('variable-5', 'sealed-value');
    failDecryption = true;

    expect(() => getSecret('secret://variable-5')).toThrow(SECRET_STORE_SEALED_MESSAGE);

    const files = await readdir(homePath);
    expect(files).toEqual(['secret-variables.enc.json']);
    await expect(readFile(join(homePath, 'secret-variables.enc.json'), 'utf8')).resolves.not.toContain('sealed-value');
  });

  it('resets the sealed store for the guided re-entry flow', async () => {
    homePath = await mkdtemp(join(tmpdir(), 'rpaforge-secrets-'));
    await setSecret('variable-6', 'about-to-loose');
    failDecryption = true;

    await resetSecretStore();

    expect(inspectSecretStore()).toEqual({ exists: false, decryptable: true, error: null });
  });

  it('reencrypts the store atomically from freshly entered values', async () => {
    homePath = await mkdtemp(join(tmpdir(), 'rpaforge-secrets-'));
    await setSecret('variable-7', 'old');
    failDecryption = true;
    await resetSecretStore();
    failDecryption = false;

    const result = await reencryptSecretStore({ 'variable-7': 'fresh-value' });

    expect(result).toEqual({ secretRefs: ['secret://variable-7'] });
    expect(getSecret('secret://variable-7')).toBe('fresh-value');
    await expect(readFile(join(homePath, 'secret-variables.enc.json'), 'utf8')).resolves.not.toContain('fresh-value');
  });

  it('rejects invalid re-encrypt entries without writing the store', async () => {
    homePath = await mkdtemp(join(tmpdir(), 'rpaforge-secrets-'));

    await expect(reencryptSecretStore({ '../escape': 'x' })).rejects.toThrow('invalid');
    expect(inspectSecretStore()).toEqual({ exists: false, decryptable: true, error: null });
  });
});
