/**
 * Copies registry module sources into the example's consumer-style source tree.
 */
import { copyFile, mkdir, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const registry = JSON.parse(await readFile(resolve(root, 'registry.json'), 'utf8'));
const sourcePrefix = 'src/';

for (const item of registry.items) {
  for (const file of item.files) await copyRegistryFile(file);
}

console.log('Copied registry modules to example/src/w10n.');

/**
 * Copies one supported registry source to its consumer destination.
 */
async function copyRegistryFile(file) {
  if (!file.path.startsWith(sourcePrefix)) {
    throw new Error(`Unsupported registry source: ${file.path}`);
  }
  const destination = resolve(root, 'example/src/w10n', file.path.slice(sourcePrefix.length));
  await mkdir(dirname(destination), { recursive: true });
  await copyFile(resolve(root, file.path), destination);
}
