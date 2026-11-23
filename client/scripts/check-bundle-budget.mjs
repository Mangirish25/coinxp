import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import logger from 'node:console';
import process from 'node:process';
import { URL } from 'node:url';
import { gzipSync } from 'node:zlib';
import budgetConfig from '../src/visuals/bundleBudgets.json' with { type: 'json' };

const distUrl = new URL('../dist/', import.meta.url);
const distPath = decodeURIComponent(distUrl.pathname.replace(/^\/(\w:)/, '$1'));
const manifestPath = join(distPath, '.vite', 'manifest.json');
const kilobytes = 1024;

if (!statSync(manifestPath, { throwIfNoEntry: false })?.isFile()) {
  logger.error('Bundle budget check failed: client/dist/.vite/manifest.json is missing.');
  process.exit(1);
}

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const gzipBytesByFile = new Map();
const gzipBytes = (file) => {
  if (!gzipBytesByFile.has(file)) gzipBytesByFile.set(file, gzipSync(readFileSync(join(distPath, file))).byteLength);
  return gzipBytesByFile.get(file);
};
const staticFilesFor = (entryKey, seen = new Set()) => {
  if (seen.has(entryKey) || !manifest[entryKey]) return seen;
  seen.add(entryKey);
  for (const imported of manifest[entryKey].imports ?? []) staticFilesFor(imported, seen);
  return seen;
};

const entryKey = Object.keys(manifest).find((key) => key.endsWith('index.html'));
if (!entryKey) {
  logger.error('Bundle budget check failed: the Vite HTML entry is missing.');
  process.exit(1);
}
const initialFiles = [...staticFilesFor(entryKey)].map((key) => manifest[key]);
const initialJsBytes = initialFiles.filter(({ file }) => file.endsWith('.js')).reduce((sum, { file }) => sum + gzipBytes(file), 0);
const assets = Object.entries(manifest)
  .map(([key, entry]) => ({ key, ...entry, gzipBytes: gzipBytes(entry.file) }))
  .filter(({ file }) => file.endsWith('.js') || file.endsWith('.css'));

let exceeded = initialJsBytes > budgetConfig.initialJsGzipKb * kilobytes;
logger.log(`initial static JavaScript: ${(initialJsBytes / kilobytes).toFixed(1)} KiB gzip / ${budgetConfig.initialJsGzipKb} KiB budget`);
if (exceeded) logger.error('Bundle budget exceeded: initial static JavaScript');

for (const asset of assets) {
  const budgetKb = asset.file.endsWith('.css')
    ? budgetConfig.cssGzipKb
    : asset.name === 'visuals'
      ? budgetConfig.visualsChunkGzipKb
      : asset.isDynamicEntry
        ? budgetConfig.routeChunkGzipKb
        : budgetConfig.vendorChunkGzipKb;
  logger.log(`${asset.file}: ${(asset.gzipBytes / kilobytes).toFixed(1)} KiB gzip / ${budgetKb} KiB budget`);
  if (asset.gzipBytes > budgetKb * kilobytes) {
    exceeded = true;
    logger.error(`Bundle budget exceeded: ${asset.file}`);
  }
}

if (exceeded) process.exit(1);
if (assets.length === 0) {
  logger.error('Bundle budget check failed: no JavaScript or CSS assets were found.');
  process.exit(1);
}
