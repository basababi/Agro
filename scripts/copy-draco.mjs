// Copies the Draco glTF decoder from three.js into public/draco/ so it is self-hosted.
// Re-run after upgrading three:  npm run copy-draco

import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const from = join(root, 'node_modules', 'three', 'examples', 'jsm', 'libs', 'draco', 'gltf');
const to = join(root, 'public', 'draco');

mkdirSync(to, { recursive: true });
for (const file of ['draco_decoder.js', 'draco_decoder.wasm', 'draco_wasm_wrapper.js']) {
  copyFileSync(join(from, file), join(to, file));
  console.log(`[copy-draco] ${file}`);
}
