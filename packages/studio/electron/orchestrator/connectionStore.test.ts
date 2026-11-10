// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from 'vitest';

const fsState = new Map<string, Buffer>();

vi.mock('electron', () => ({
  app: { getPath: vi.fn(() => '/tmp-rpaforge-test-home') },
  safeStorage: {
    isEncryptionAvailable: vi.fn(() => true),
    encryptString: vi.fn((value: string) =>
      Buffer.from(`enc:${Buffer.from(value, 'utf-8').toString('base64')}`, 'utf-8'),
    ),
    decryptString: vi.fn((buffer: Buffer) => {
      const raw = buffer.toString('utf-8');
      return Buffer.from(raw.replace(/^enc:/, ''), 'base64').toString('utf-8');
    }),
  },
}));

vi.mock('node:fs', () => ({
  existsSync: vi.fn((path: string) => fsState.has(path)),
  readFileSync: vi.fn((path: string) => {
    const data = fsState.get(path);
    if (!data) throw new Error('missing file');
    return data;
  }),
}));

vi.mock('node:fs/promises', () => ({
  writeFile: vi.fn(async (path: string, data: Buffer) => {
    fsState.set(path, data);
  }),
}));

import * as path from 'node:path';
import * as store from './connectionStore';

const STORE_PATH = path.join('/tmp-rpaforge-test-home', 'orchestrator-connections.enc.json');

describe('orchestrator connectionStore', () => {
  beforeEach(() => {
    fsState.clear();
  });

  test('save + list roundtrip encrypts the token at rest', () => {
    const saved = store.saveConnection({
      name: 'local',
      baseUrl: 'http://127.0.0.1:8765/',
      token: 'secret-token',
    });
    expect(saved.hasToken).toBe(true);

    const raw = fsState.get(STORE_PATH)?.toString('utf-8') ?? '';
    expect(raw.startsWith('enc:')).toBe(true);
    expect(raw).not.toContain('secret-token');

    const connections = store.listConnections();
    expect(connections).toHaveLength(1);
    expect(connections[0].baseUrl).toBe('http://127.0.0.1:8765');
    expect(connections[0].hasToken).toBe(true);
    expect(JSON.stringify(connections)).not.toContain('secret-token');
  });

  test('updating without a token keeps the stored token', () => {
    store.saveConnection({ name: 'a', baseUrl: 'http://h1:1', token: 'keep-me' });
    const updated = store.saveConnection({
      id: store.listConnections()[0].id,
      name: 'a renamed',
      baseUrl: 'http://h1:1',
    });
    expect(updated.name).toBe('a renamed');
    expect(updated.hasToken).toBe(true);
    expect(store.getTokenForProxy(updated.id)).toBe('keep-me');
  });

  test('deleteConnection removes the entry', () => {
    const saved = store.saveConnection({ name: 'a', baseUrl: 'http://h1:1' });
    expect(store.deleteConnection(saved.id)).toBe(true);
    expect(store.listConnections()).toHaveLength(0);
    expect(store.deleteConnection('nope')).toBe(false);
  });

  test('normalizeBaseUrl validates scheme and strips trailing slashes', () => {
    expect(store.normalizeBaseUrl('http://127.0.0.1:8765///')).toBe('http://127.0.0.1:8765');
    expect(store.normalizeBaseUrl('https://runner.corp.lan')).toBe('https://runner.corp.lan');
    expect(() => store.normalizeBaseUrl('')).toThrow('Base URL is required');
    expect(() => store.normalizeBaseUrl('ftp://host')).toThrow('http or https');
  });

  test('getTokenForProxy returns empty for unknown ids', () => {
    expect(store.getTokenForProxy('missing')).toBe('');
  });
});
