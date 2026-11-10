/**
 * Encrypted storage for Control Tower daemon connections (issue #858).
 *
 * Mirrors the AI keyStore pattern (issue E1 Phase 5.3): connection metadata
 * (name, base URL) lives unencrypted — it is not sensitive — while the bearer
 * token is sealed with Electron `safeStorage` (DPAPI/Keychain/libsecret) in
 * `orchestrator-connections.enc.json`. Tokens are never returned to the
 * renderer; the proxy handler (`orchestrator:proxy`) reads them in main and
 * attaches the Authorization header server-side.
 */

import { app, safeStorage } from 'electron';
import * as fs from 'node:fs';
import * as fsp from 'node:fs/promises';
import * as path from 'node:path';
import { createLogger } from '../../src/utils/logger';
import type { OrchestratorConnectionMeta } from '../../src/types/ipc-contracts';

const logger = createLogger('orchestrator-connections');

interface StoredConnection {
  id: string;
  name: string;
  baseUrl: string;
  /** Empty string = no token configured. */
  token: string;
}

interface StoreFile {
  connections: StoredConnection[];
}

function getStorePath(): string {
  return path.join(app.getPath('userData'), 'orchestrator-connections.enc.json');
}

function readStore(): StoreFile {
  const filePath = getStorePath();
  if (!fs.existsSync(filePath)) {
    return { connections: [] };
  }
  try {
    const encrypted = fs.readFileSync(filePath);
    if (!safeStorage.isEncryptionAvailable()) {
      logger.error('OS-level encryption is unavailable; connections cannot be read');
      return { connections: [] };
    }
    const decrypted = safeStorage.decryptString(encrypted);
    const parsed = JSON.parse(decrypted) as StoreFile;
    if (!parsed || !Array.isArray(parsed.connections)) {
      return { connections: [] };
    }
    return { connections: parsed.connections };
  } catch (error) {
    logger.error('Failed to read orchestrator connection store', error);
    return { connections: [] };
  }
}

async function writeStore(store: StoreFile): Promise<void> {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('OS-level encryption is unavailable on this machine.');
  }
  const encrypted = safeStorage.encryptString(JSON.stringify(store));
  await fsp.writeFile(getStorePath(), encrypted);
}

/** Normalize a base URL: trim, default scheme, strip trailing slash. */
export function normalizeBaseUrl(raw: string): string {
  const value = raw.trim().replace(/\/+$/, '');
  if (!value) {
    throw new Error('Base URL is required.');
  }
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(value) && !/^https?:\/\//i.test(value)) {
    throw new Error('Base URL must use http or https.');
  }
  const withScheme = /^https?:\/\//i.test(value) ? value : `http://${value}`;
  const parsed = new URL(withScheme);
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Base URL must use http or https.');
  }
  return parsed.origin;
}

function toMeta(connection: StoredConnection): OrchestratorConnectionMeta {
  return {
    id: connection.id,
    name: connection.name,
    baseUrl: connection.baseUrl,
    hasToken: connection.token.length > 0,
  };
}

export function listConnections(): OrchestratorConnectionMeta[] {
  return readStore().connections.map(toMeta);
}

export function saveConnection(input: {
  id?: string;
  name: string;
  baseUrl: string;
  token?: string;
}): OrchestratorConnectionMeta {
  const name = input.name.trim();
  if (!name) {
    throw new Error('Connection name is required.');
  }
  const baseUrl = normalizeBaseUrl(input.baseUrl);
  const store = readStore();
  const id = input.id ?? `conn-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const existing = store.connections.find((c) => c.id === id);
  const token =
    input.token !== undefined && input.token.length > 0
      ? input.token
      : (existing?.token ?? '');

  const next: StoredConnection = { id, name, baseUrl, token };
  const connections = existing
    ? store.connections.map((c) => (c.id === id ? next : c))
    : [...store.connections, next];
  writeStore({ connections });
  return toMeta(next);
}

export function deleteConnection(id: string): boolean {
  const store = readStore();
  const before = store.connections.length;
  const connections = store.connections.filter((c) => c.id !== id);
  writeStore({ connections });
  return connections.length < before;
}

/** Main-process only: the token for one connection ('' when unset). */
export function getTokenForProxy(id: string): string {
  const connection = readStore().connections.find((c) => c.id === id);
  return connection?.token ?? '';
}
