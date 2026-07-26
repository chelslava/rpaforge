import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

let homePath = '';
let encryptionAvailable = true;

vi.mock('electron', () => ({
  app: { getPath: () => homePath },
  safeStorage: {
    isEncryptionAvailable: () => encryptionAvailable,
    encryptString: (value: string) => Buffer.from(value, 'utf8').toString('base64'),
    decryptString: (value: string | Buffer) => Buffer.from(value.toString(), 'base64').toString('utf8'),
  },
}));

import {
  deleteSecret,
  getSecret,
  getSecretReference,
  getSecretStoreStatus,
  setSecret,
} from './secret-variable-store';

describe('secret variable store', () => {
  afterEach(async () => {
    encryptionAvailable = true;
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
});
