/**
 * Regenerate electron-updater's latest.yml hashes after code signing (#852).
 *
 * Authenticode signing rewrites the installer .exe bytes, so every sha512
 * electron-builder recorded in latest.yml goes stale — and electron-updater
 * refuses updates whose manifest hash does not match the downloaded file.
 * This script re-hashes every entry (and the top-level sha512, which mirrors
 * the file named by the top-level `path:`) from the artifacts on disk.
 * No new dependencies: the manifest shape emitted by electron-builder
 * (flat keys, a `files:` list of `- url:`/`sha512:`/`size:` items) is edited
 * line-wise in place, preserving the original structure and key order.
 *
 * CLI: node scripts/regenerate-latest-yml.mjs <dist-dir>
 *   where <dist-dir> holds latest.yml next to the built artifacts.
 */

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

/** sha512 as electron-updater expects it: base64 digest of the file bytes. */
export function fileSha512Base64(filePath) {
  return createHash('sha512').update(readFileSync(filePath)).digest('base64');
}

/**
 * Recompute sha512/size for every entry of a latest.yml manifest.
 *
 * @param {string} latestYmlPath path to latest.yml
 * @param {string} baseDir directory the entry `url`s resolve against
 * @returns {{ updated: string[], missing: string[], topLevelUpdated: boolean }}
 *   touched entry urls, referenced-but-absent files (reported, left as-is),
 *   and whether the top-level sha512 was refreshed.
 */
export function regenerateLatestYml(
  latestYmlPath,
  baseDir = path.dirname(latestYmlPath),
) {
  const raw = readFileSync(latestYmlPath, 'utf-8');
  const eol = raw.includes('\r\n') ? '\r\n' : '\n';
  const lines = raw.split(/\r?\n/);

  /** sha512 electron-updater validates for the file named by top-level path. */
  let topLevelPath = null;
  const updated = [];
  const missing = [];
  let topLevelUpdated = false;

  // First pass: the top-level `path:` value (before any indented block).
  for (const line of lines) {
    const match = line.match(/^(path):\s*['"]?([^'"]*?)['"]?\s*$/);
    if (match) {
      topLevelPath = match[2];
      break;
    }
  }

  // Second pass: rewrite hashes. Context url = top-level path until the
  // `files:` key, then the most recent `- url:` list entry.
  let contextUrl = topLevelPath;
  let inFilesList = false;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];

    const listEntry = line.match(/^\s*-\s+url:\s*['"]?([^'"]*?)['"]?\s*$/);
    if (listEntry) {
      inFilesList = true;
      contextUrl = listEntry[1];
      continue;
    }
    if (inFilesList && /^[^\s#]/.test(line)) {
      // A non-indented key ends the files: list.
      inFilesList = false;
      contextUrl = topLevelPath;
    }

    const field = line.match(/^\s*(sha512|size):\s*(.*)$/);
    if (!field || contextUrl === null || contextUrl === undefined) {
      continue;
    }

    const target = path.join(baseDir, contextUrl);
    let content;
    try {
      content = readFileSync(target);
    } catch {
      if (!missing.includes(contextUrl)) {
        missing.push(contextUrl);
      }
      continue;
    }
    if (field[1] === 'sha512') {
      lines[i] = `sha512: ${createHash('sha512').update(content).digest('base64')}`;
    } else {
      lines[i] = `size: ${content.length}`;
    }
    if (!inFilesList) {
      topLevelUpdated = true;
    } else if (!updated.includes(contextUrl)) {
      updated.push(contextUrl);
    }
  }

  writeFileSync(latestYmlPath, lines.join(eol), 'utf-8');
  return { updated, missing, topLevelUpdated };
}

function main(argv) {
  const distDir = argv[2];
  if (!distDir) {
    console.error('Usage: node scripts/regenerate-latest-yml.mjs <dist-dir>');
    process.exitCode = 1;
    return;
  }
  const latestYmlPath = path.join(distDir, 'latest.yml');
  const { updated, missing, topLevelUpdated } = regenerateLatestYml(latestYmlPath, distDir);
  if (topLevelUpdated) {
    console.log('regenerated: top-level sha512');
  }
  for (const url of updated) {
    console.log(`regenerated: ${url}`);
  }
  for (const url of missing) {
    console.warn(`warning: manifest references missing file: ${url}`);
  }
  if (updated.length === 0 && !topLevelUpdated) {
    console.error('No manifest entries were updated - refusing to ship a broken update feed');
    process.exitCode = 1;
  }
}

if (process.argv[1] && process.argv[1].endsWith('regenerate-latest-yml.mjs')) {
  main(process.argv);
}
