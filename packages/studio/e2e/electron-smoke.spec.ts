import { expect, test } from '@playwright/test';
import { _electron as electron, type ElectronApplication, type Page } from 'playwright';
import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const studioDir = path.resolve(import.meta.dirname, '..');

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

async function closeElectron(app: ElectronApplication | undefined): Promise<void> {
  if (!app) return;
  await app.close().catch(() => undefined);
}

async function removeTempDirectory(directory: string): Promise<void> {
  await Promise.race([
    rm(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 }),
    new Promise<void>((resolve) => setTimeout(resolve, 10_000)),
  ]);
}

test('launches the production Electron app and completes an IPC file round-trip', async () => {
  const executable = resolvePackagedExecutable();
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'rpaforge-electron-e2e-'));
  const userDataRoot = await mkdtemp(path.join(os.tmpdir(), 'rpaforge-electron-user-data-'));
  let app: ElectronApplication | undefined;

  try {
    app = await electron.launch({
      executablePath: executable,
      args: [`--user-data-dir=${userDataRoot}`],
      env: {
        ...process.env,
        ELECTRON_ENABLE_LOGGING: '1',
      },
    });

    const page: Page = await app.firstWindow();
    await page.waitForLoadState('domcontentloaded');
    await expect(page).toHaveTitle(/RPAForge Studio/i);
    await expect(page.getByRole('heading', { name: 'Welcome to RPAForge' })).toBeVisible();

    const apiSurface = await page.evaluate(async () => {
      const api = window.rpaforge;
      return {
        keys: api ? Object.keys(api) : [],
        bridgeStatus: api ? await api.bridge.getStatus() : null,
      };
    });

    expect(apiSurface.keys).toEqual(expect.arrayContaining(['bridge', 'engine', 'fs']));
    expect(apiSurface.bridgeStatus?.state).toBeTruthy();

    await expect
      .poll(
        () => page.evaluate(() => window.rpaforge?.bridge.getStatus()),
        { timeout: 75_000, message: 'Bundled Python bridge did not become operational' }
      )
      .toMatchObject({ isOperational: true });
    console.log('Packaged bridge is operational');

    const projectRoot = path.join(tempRoot, 'project');
    const projectFile = path.join(projectRoot, 'project.json');
    const projectContent = JSON.stringify({ name: 'Electron E2E Project', version: '1.0.0' });
    const roundTrip = await page.evaluate(
      async ({ root, file, content }) => {
        const api = window.rpaforge;
        if (!api) throw new Error('RPAForge preload API is unavailable');
        await api.fs.setProjectRoot(root);
        await api.fs.writeFile(file, content);
        return {
          exists: await api.fs.pathExists(file),
          content: await api.fs.readFile(file),
        };
      },
      { root: projectRoot, file: projectFile, content: projectContent }
    );
    console.log('IPC file round-trip completed');

    expect(roundTrip).toEqual({ exists: true, content: projectContent });
  } finally {
    console.log('Closing packaged Electron app');
    await closeElectron(app);
    console.log('Packaged Electron app closed');
    await removeTempDirectory(tempRoot);
    await removeTempDirectory(userDataRoot);
    console.log('Temporary E2E project removed');
  }
});
