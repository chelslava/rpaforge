// Builds the Python engine into a self-contained PyInstaller bundle that the
// packaged Electron app ships and spawns in production (see electron/main.ts:
// resolveBridgeLaunchSpec and the `extraResources` entry in package.json).
//
// Output: packages/studio/resources/bridge/rpaforge-bridge[.exe]
//
// Prerequisites (build machine only — NOT end users):
//   - Python 3.10+ on PATH (or set the PYTHON env var)
//   - pyinstaller installed
//   - rpaforge-core and rpaforge-libraries installed (preferably with the
//     optional extras whose activities you want bundled), e.g.:
//       pip install pyinstaller ./packages/core
//       pip install "./packages/libraries[desktop,excel,database,keystore,dataframes]"

import { spawnSync } from 'node:child_process';
import { existsSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const studioDir = path.resolve(__dirname, '..');
const repoRoot = path.resolve(studioDir, '..', '..');

const specPath = path.join(repoRoot, 'packages', 'core', 'rpaforge-bridge.spec');
const distPath = path.join(studioDir, 'resources');
const workPath = path.join(repoRoot, '.pyinstaller-build');
const outputDir = path.join(distPath, 'bridge');
const exeName = process.platform === 'win32' ? 'rpaforge-bridge.exe' : 'rpaforge-bridge';
const outputExe = path.join(outputDir, exeName);

const pythonCandidates = process.env.PYTHON
  ? [process.env.PYTHON]
  : process.platform === 'win32'
    ? ['python', 'py']
    : ['python3', 'python'];

function resolvePython() {
  for (const candidate of pythonCandidates) {
    const result = spawnSync(candidate, ['--version'], { stdio: 'ignore' });
    if (!result.error && result.status === 0) {
      return candidate;
    }
  }
  return null;
}

const python = resolvePython();
if (!python) {
  console.error(
    `[build-bridge] No Python interpreter found (tried: ${pythonCandidates.join(', ')}).\n` +
      '              Install Python 3.10+ or set the PYTHON env var.'
  );
  process.exit(1);
}

// Clean previous output so stale binaries never leak into the bundle.
for (const dir of [outputDir, workPath]) {
  if (existsSync(dir)) {
    rmSync(dir, { recursive: true, force: true });
  }
}

console.log(`[build-bridge] Freezing engine with ${python} + PyInstaller...`);
const result = spawnSync(
  python,
  [
    '-m',
    'PyInstaller',
    specPath,
    '--distpath',
    distPath,
    '--workpath',
    workPath,
    '--noconfirm',
    '--clean',
  ],
  { stdio: 'inherit', cwd: repoRoot }
);

if (result.error) {
  console.error(`[build-bridge] Failed to launch PyInstaller: ${result.error.message}`);
  console.error('              Install it with: pip install pyinstaller');
  process.exit(1);
}

if (result.status !== 0) {
  console.error(`[build-bridge] PyInstaller exited with code ${result.status}.`);
  process.exit(result.status ?? 1);
}

if (!existsSync(outputExe)) {
  console.error(`[build-bridge] Expected executable not produced: ${outputExe}`);
  process.exit(1);
}

// PyInstaller's COLLECT step recreates the output folder and wipes the committed
// .gitkeep placeholder. Restore it so the working tree stays clean (the frozen
// bundle alongside it is git-ignored).
writeFileSync(
  path.join(outputDir, '.gitkeep'),
  '# Keeps resources/bridge present so electron-builder `extraResources` resolves\n' +
    '# even before the PyInstaller engine bundle is built. The frozen bridge output\n' +
    '# (everything else in this folder) is produced by `pnpm build:bridge` and is\n' +
    '# git-ignored — see .gitignore. The build script rewrites this placeholder after\n' +
    '# each build so the working tree stays clean.\n'
);

console.log(`[build-bridge] Done: ${outputExe}`);
