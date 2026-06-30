/**
 * Encrypted storage for AI provider credentials (E1 Phase 5.3).
 *
 * Uses Electron's `safeStorage` (OS keychain-backed: DPAPI on Windows,
 * Keychain on macOS, libsecret on Linux) — first use of safeStorage in this
 * project. The encrypted blob lives at
 * `app.getPath('userData')/ai-providers.enc.json`. Renderer never sees this
 * module directly; only the IPC handlers in main.ts call it, and they only
 * ever return `{ provider, configured }` to the renderer, never the
 * decrypted config.
 */

import { app, safeStorage } from 'electron';
import * as fs from 'node:fs';
import * as fsp from 'node:fs/promises';
import * as path from 'node:path';
import type { AiProviderId, AiProviderStatus } from '../../src/types/ai';
import { createLogger } from '../../src/utils/logger';

const logger = createLogger('ai-keystore');

const ALL_PROVIDERS: AiProviderId[] = ['openai-compatible', 'anthropic'];

export interface StoredProviderConfig {
  apiKey: string;
  baseUrl?: string;
  model?: string;
}

type StoreFile = Partial<Record<AiProviderId, StoredProviderConfig>>;

function getStorePath(): string {
  return path.join(app.getPath('userData'), 'ai-providers.enc.json');
}

function readStore(): StoreFile {
  const filePath = getStorePath();
  if (!fs.existsSync(filePath)) {
    return {};
  }
  if (!safeStorage.isEncryptionAvailable()) {
    logger.error('OS-level encryption is unavailable; AI provider keys cannot be read');
    return {};
  }
  try {
    const encrypted = fs.readFileSync(filePath);
    const decrypted = safeStorage.decryptString(encrypted);
    return JSON.parse(decrypted) as StoreFile;
  } catch (error) {
    logger.error('Failed to read AI provider key store', error);
    return {};
  }
}

async function writeStore(store: StoreFile): Promise<void> {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('OS-level encryption is unavailable on this machine.');
  }
  const encrypted = safeStorage.encryptString(JSON.stringify(store));
  await fsp.writeFile(getStorePath(), encrypted);
}

export async function setProviderConfig(provider: AiProviderId, config: StoredProviderConfig): Promise<void> {
  const store = readStore();
  store[provider] = config;
  await writeStore(store);
}

export async function removeProviderConfig(provider: AiProviderId): Promise<void> {
  const store = readStore();
  delete store[provider];
  await writeStore(store);
}

/** Internal use only (generateDiagram.ts / the "test connection" handler) — never returned to the renderer. */
export function getProviderConfig(provider: AiProviderId): StoredProviderConfig | null {
  return readStore()[provider] ?? null;
}

export function getProviderStatuses(): AiProviderStatus[] {
  const store = readStore();
  return ALL_PROVIDERS.map((provider) => ({ provider, configured: Boolean(store[provider]?.apiKey) }));
}
