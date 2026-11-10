// @vitest-environment node

import { afterAll, describe, expect, test } from 'vitest';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { fileSha512Base64, regenerateLatestYml } from './regenerate-latest-yml.mjs';

const TEMP_DIRS = [];

function makeDist(manifest, files = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), 'latest-yml-'));
  TEMP_DIRS.push(dir);
  writeFileSync(path.join(dir, 'latest.yml'), manifest, 'utf-8');
  for (const [name, content] of Object.entries(files)) {
    writeFileSync(path.join(dir, name), content);
  }
  return dir;
}

afterAll(() => {
  for (const dir of TEMP_DIRS) {
    rmSync(dir, { recursive: true, force: true });
  }
});

const INSTALLED = 'installer-bytes-after-signing';
const BLOCKMAP = 'blockmap-bytes-after-signing';

const MANIFEST = [
  'version: 0.8.0',
  "path: 'RPAForge Studio Setup 0.8.0.exe'",
  'releaseDate: 2026-11-10T12:00:00.000Z',
  'sha512: STALE_TOP_HASH',
  'githubArtifactName: rpaforge-studio-0.8.0',
  'files:',
  "  - url: 'RPAForge Studio Setup 0.8.0.exe'",
  '    sha512: STALE_EXE_HASH',
  '    size: 111',
  "  - url: 'RPAForge Studio Setup 0.8.0.exe.blockmap'",
  '    sha512: STALE_BLOCKMAP_HASH',
  '    size: 222',
  '',
].join('\n');

describe('regenerateLatestYml', () => {
  test('re-hashes every entry and the top-level sha512 in place', () => {
    const dir = makeDist(MANIFEST, {
      'RPAForge Studio Setup 0.8.0.exe': INSTALLED,
      'RPAForge Studio Setup 0.8.0.exe.blockmap': BLOCKMAP,
    });

    const { updated, missing, topLevelUpdated } = regenerateLatestYml(
      path.join(dir, 'latest.yml'),
      dir,
    );

    expect(updated).toEqual([
      'RPAForge Studio Setup 0.8.0.exe',
      'RPAForge Studio Setup 0.8.0.exe.blockmap',
    ]);
    expect(missing).toEqual([]);
    expect(topLevelUpdated).toBe(true);

    const result = readFileSync(path.join(dir, 'latest.yml'), 'utf-8');
    const exeHash = createHash('sha512').update(INSTALLED).digest('base64');
    const blockmapHash = createHash('sha512').update(BLOCKMAP).digest('base64');

    expect(result).toContain(`sha512: ${exeHash}`); // top level
    expect(result).toContain(`sha512: ${blockmapHash}`); // blockmap entry
    expect(result).toContain(`size: ${INSTALLED.length}`);
    expect(result).toContain(`size: ${BLOCKMAP.length}`);
    expect(result).not.toContain('STALE_');
    // Structure and unrelated keys survive.
    expect(result).toContain('version: 0.8.0');
    expect(result).toContain('githubArtifactName: rpaforge-studio-0.8.0');
    expect(result.split('\n').length).toBe(MANIFEST.split('\n').length);
  });

  test('top-level sha512 mirrors the file named by path (not the first entry)', () => {
    const dir = makeDist(MANIFEST, {
      'RPAForge Studio Setup 0.8.0.exe': INSTALLED,
      'RPAForge Studio Setup 0.8.0.exe.blockmap': BLOCKMAP,
    });
    regenerateLatestYml(path.join(dir, 'latest.yml'), dir);
    const lines = readFileSync(path.join(dir, 'latest.yml'), 'utf-8').split('\n');
    const topLevel = lines.find((l) => l.startsWith('sha512:')).slice('sha512: '.length);
    expect(topLevel).toBe(fileSha512Base64(path.join(dir, 'RPAForge Studio Setup 0.8.0.exe')));
  });

  test('missing referenced files are reported and left untouched', () => {
    const dir = makeDist(MANIFEST, {
      'RPAForge Studio Setup 0.8.0.exe': INSTALLED,
      // blockmap absent
    });
    const { missing } = regenerateLatestYml(path.join(dir, 'latest.yml'), dir);
    expect(missing).toEqual(['RPAForge Studio Setup 0.8.0.exe.blockmap']);
    const result = readFileSync(path.join(dir, 'latest.yml'), 'utf-8');
    expect(result).toContain('STALE_BLOCKMAP_HASH');
    expect(result).not.toContain('STALE_EXE_HASH');
  });
});
