import { expect, test } from '@playwright/test';
import { _electron as electron, type ElectronApplication } from 'playwright';
import { existsSync, readdirSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

/**
 * Auto-update staging E2E (issue #819) — GATED.
 *
 * Skipped unless RPAFORGE_UPDATE_FEED_URL points at a static HTTP provider
 * serving a latest.yml whose version is NEWER than the packaged app's
 * version (see docs/developer-guide/building-installer.md "Auto-update E2E
 * procedure": the target file can be the very installer under test, with a
 * synthetic bumped version and its real sha512). Not part of the default
 * E2E run: it needs a running feed server and downloads ~100MB.
 */

const studioDir = path.resolve(import.meta.dirname, '..');

test.skip(!process.env.RPAFORGE_UPDATE_FEED_URL, 'update E2E requires RPAFORGE_UPDATE_FEED_URL');

function resolvePackagedExecutable(): string {
  const configuredPath = process.env.RPAFORGE_ELECTRON_EXECUTABLE;
  const candidates = configuredPath
    ? [configuredPath]
    : process.platform === 'win32'
      ? [path.join(studioDir, 'dist-electron', 'win-unpacked', 'RPAForge Studio.exe')]
      : process.platform === 'darwin'
        ? [path.join(studioDir, 'dist-electron', 'mac', 'RPAForge Studio.app', 'Contents', 'MacOS', 'RPAForge Studio')]
        : [path.join(studioDir, 'dist-electron', 'linux-unpacked', 'rpaforge-studio')];

  const executable = candidates.find((candidate) => existsSync(candidate));
  if (!executable) {
    throw new Error(
      `Packaged Electron executable not found. Run "pnpm build" first or set RPAFORGE_ELECTRON_EXECUTABLE. Tried: ${candidates.join(', ')}`
    );
  }
  return executable;
}

/** electron-updater stages downloads under %LOCALAPPDATA%/<name>-updater/pending. */
async function findStagedUpdate(timeoutMs = 90_000): Promise<string | null> {
  const localAppData = process.env.LOCALAPPDATA ?? path.join(os.homedir(), 'AppData', 'Local');
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      for (const entry of readdirSync(localAppData)) {
        if (!entry.toLowerCase().endsWith('-updater')) continue;
        const pendingDir = path.join(localAppData, entry, 'pending');
        if (!existsSync(pendingDir)) continue;
        const staged = readdirSync(pendingDir).find((file) => !file.endsWith('.yml'));
        if (staged) return path.join(pendingDir, staged);
      }
    } catch {
      // LOCALAPPDATA read races are fine; retry until the deadline.
    }
    await new Promise((resolve) => setTimeout(resolve, 3_000));
  }
  return null;
}

test('stages a downloaded update from the configured feed', async ({ }, testInfo) => {
  testInfo.setTimeout(180_000);
  const executable = resolvePackagedExecutable();
  const userDataRoot = await mkdtemp(path.join(os.tmpdir(), 'rpaforge-update-e2e-'));
  let app: ElectronApplication | undefined;

  try {
    app = await electron.launch({
      executablePath: executable,
      args: [`--user-data-dir=${userDataRoot}`],
      env: {
        ...process.env,
        RPAFORGE_UPDATE_FEED_URL: process.env.RPAFORGE_UPDATE_FEED_URL,
      },
    });

    // The startup check fires ~10s after launch (AppUpdateManager), then the
    // download runs automatically (autoDownload=true). Wait for the staged
    // installer to appear in the updater cache.
    const staged = await findStagedUpdate();
    expect(staged, 'no update staged in the updater cache within the timeout').toBeTruthy();
  } finally {
    if (app) {
      await app.close().catch(() => undefined);
    }
    await rm(userDataRoot, { recursive: true, force: true }).catch(() => undefined);
  }
});
