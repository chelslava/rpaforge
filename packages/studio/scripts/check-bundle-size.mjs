import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIST_DIR = fileURLToPath(new URL('../dist', import.meta.url));
const BUDGETS = {
  entryBytes: 3_500_000,
  largestJavaScriptBytes: 1_500_000,
  stylesheetBytes: 140_000,
};

async function collectFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const filePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectFiles(filePath)));
    } else {
      files.push(filePath);
    }
  }

  return files;
}

function formatBytes(bytes) {
  return `${(bytes / 1024).toFixed(1)} KB`;
}

const files = await collectFiles(DIST_DIR);
const assets = files.filter((filePath) => filePath.includes(`${path.sep}assets${path.sep}`));
const javascript = assets.filter((filePath) => filePath.endsWith('.js'));
const stylesheets = assets.filter((filePath) => filePath.endsWith('.css'));
const entry = javascript.find((filePath) => path.basename(filePath).startsWith('index-'));

if (!entry) {
  throw new Error('Renderer bundle entry was not found in dist/assets.');
}

const sizes = await Promise.all(
  assets.map(async (filePath) => ({
    filePath,
    bytes: (await stat(filePath)).size,
  }))
);
const sizeByPath = new Map(sizes.map((asset) => [asset.filePath, asset.bytes]));
const entryBytes = sizeByPath.get(entry);
const secondaryJavaScript = javascript.filter((filePath) => filePath !== entry);
const largestJavaScriptBytes = Math.max(...secondaryJavaScript.map((filePath) => sizeByPath.get(filePath)), 0);
const stylesheetBytes = Math.max(...stylesheets.map((filePath) => sizeByPath.get(filePath)), 0);

console.log(`Renderer entry: ${formatBytes(entryBytes)} / ${formatBytes(BUDGETS.entryBytes)}`);
console.log(`Largest JavaScript chunk: ${formatBytes(largestJavaScriptBytes)} / ${formatBytes(BUDGETS.largestJavaScriptBytes)}`);
console.log(`Largest stylesheet: ${formatBytes(stylesheetBytes)} / ${formatBytes(BUDGETS.stylesheetBytes)}`);

const violations = [];
if (entryBytes > BUDGETS.entryBytes) {
  violations.push(`renderer entry exceeds ${formatBytes(BUDGETS.entryBytes)}`);
}
if (largestJavaScriptBytes > BUDGETS.largestJavaScriptBytes) {
  violations.push(`a JavaScript chunk exceeds ${formatBytes(BUDGETS.largestJavaScriptBytes)}`);
}
if (stylesheetBytes > BUDGETS.stylesheetBytes) {
  violations.push(`a stylesheet exceeds ${formatBytes(BUDGETS.stylesheetBytes)}`);
}

if (violations.length > 0) {
  throw new Error(`Renderer bundle budget exceeded: ${violations.join('; ')}`);
}
