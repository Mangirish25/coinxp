import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

const assetDirectory = new URL('../dist/assets/', import.meta.url);
const directoryPath = decodeURIComponent(assetDirectory.pathname.replace(/^\/(\w:)/, '$1'));
const budgets = new Map([
  ['.js', 180 * 1024],
  ['.css', 32 * 1024],
]);

if (!statSync(directoryPath, { throwIfNoEntry: false })?.isDirectory()) {
  console.error('Bundle budget check failed: client/dist/assets is missing.');
  process.exit(1);
}

const assets = readdirSync(directoryPath)
  .filter((name) => [...budgets.keys()].some((extension) => name.endsWith(extension)))
  .map((name) => {
    const contents = readFileSync(join(directoryPath, name));
    return { name, gzipBytes: gzipSync(contents).byteLength };
  })
  .sort((left, right) => right.gzipBytes - left.gzipBytes);

let exceeded = false;
for (const asset of assets) {
  const extension = asset.name.slice(asset.name.lastIndexOf('.'));
  const budget = budgets.get(extension);
  console.log(`${asset.name}: ${(asset.gzipBytes / 1024).toFixed(1)} KiB gzip / ${(budget / 1024).toFixed(0)} KiB budget`);
  if (asset.gzipBytes > budget) {
    exceeded = true;
    console.error(`Bundle budget exceeded: ${asset.name}`);
  }
}

if (exceeded) process.exit(1);
if (assets.length === 0) {
  console.error('Bundle budget check failed: no JavaScript or CSS assets were found.');
  process.exit(1);
}
