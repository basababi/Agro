// Runs scripts/export_glb.py inside Blender (background mode) to regenerate public/models/center.glb.
//
//   npm run export-model
//
// Overrides: BLENDER_PATH (blender executable), BLEND_FILE (source .blend).
// The source .blend is never written: its hash and modified time are checked before and after.

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const script = join(root, 'scripts', 'export_glb.py');
const out = join(root, 'public', 'models', 'center.glb');
const blend = process.env.BLEND_FILE ?? 'C:\\Users\\Dell\\Documents\\AgroForest_LearningCenter_2026.blend';

const MAX_BYTES = 8 * 1024 * 1024;
const GROUPS = ['terrain', 'building', 'floor1', 'floor2', 'greenhouse', 'outdoor', 'vegetation', 'paths'];

function fail(message) {
  console.error(`\n[export-model] ERROR: ${message}`);
  process.exit(1);
}

function findBlender() {
  if (process.env.BLENDER_PATH) {
    if (!existsSync(process.env.BLENDER_PATH)) fail(`BLENDER_PATH does not exist: ${process.env.BLENDER_PATH}`);
    return process.env.BLENDER_PATH;
  }
  if (process.platform !== 'win32') return 'blender';

  const base = 'C:\\Program Files\\Blender Foundation';
  const preferred = join(base, 'Blender 5.1', 'blender.exe');
  if (existsSync(preferred)) return preferred;
  if (existsSync(base)) {
    // Newest installed version first.
    const dirs = readdirSync(base).sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
    for (const dir of dirs) {
      const exe = join(base, dir, 'blender.exe');
      if (existsSync(exe)) return exe;
    }
  }
  fail(`blender.exe not found under ${base}. Set the BLENDER_PATH environment variable.`);
}

function fingerprint(file) {
  const { mtimeMs, size } = statSync(file);
  const sha256 = createHash('sha256').update(readFileSync(file)).digest('hex');
  return { mtimeMs, size, sha256 };
}

// Reads the JSON chunk of a GLB and counts nodes per extras.group.
function inspectGlb(file) {
  const buf = readFileSync(file);
  if (buf.readUInt32LE(0) !== 0x46546c67) fail(`${file} is not a GLB file`);
  const jsonLength = buf.readUInt32LE(12);
  const json = JSON.parse(buf.toString('utf8', 20, 20 + jsonLength));
  const counts = Object.fromEntries(GROUPS.map((g) => [g, 0]));
  for (const node of json.nodes ?? []) {
    const group = node.extras?.group;
    if (group in counts) counts[group] += 1;
  }
  let triangles = 0;
  for (const mesh of json.meshes ?? []) {
    for (const prim of mesh.primitives) {
      if (prim.indices != null) triangles += json.accessors[prim.indices].count / 3;
    }
  }
  return {
    counts,
    triangles,
    nodes: json.nodes?.length ?? 0,
    meshes: json.meshes?.length ?? 0,
    materials: (json.materials ?? []).map((m) => m.name),
    draco: (json.extensionsRequired ?? []).includes('KHR_draco_mesh_compression'),
  };
}

if (!existsSync(blend)) fail(`source .blend not found: ${blend}`);
const blender = findBlender();
const before = fingerprint(blend);

console.log(`[export-model] blender ${blender}`);
console.log(`[export-model] source  ${blend}`);
console.log(`[export-model] output  ${out}\n`);

const run = spawnSync(blender, ['-b', blend, '--python-exit-code', '1', '--python', script, '--', out], {
  stdio: 'inherit',
});
if (run.error) fail(`could not start Blender: ${run.error.message}`);

const after = fingerprint(blend);
const untouched =
  after.mtimeMs === before.mtimeMs && after.size === before.size && after.sha256 === before.sha256;
if (!untouched) fail('the source .blend changed during the export — restore it from a backup!');
if (run.status !== 0) fail(`Blender exited with code ${run.status}`);
if (!existsSync(out)) fail('Blender finished but no GLB was written');

const size = statSync(out).size;
const info = inspectGlb(out);
console.log(`\n[export-model] source .blend unchanged (sha256 ${after.sha256.slice(0, 12)}…)`);
console.log(`[export-model] ${(size / 1024 / 1024).toFixed(2)} MB, ${info.nodes} nodes, ${info.meshes} meshes, ${info.triangles} triangles, draco: ${info.draco}`);
console.log(`[export-model] groups: ${GROUPS.map((g) => `${g}=${info.counts[g]}`).join(' ')}`);
console.log(`[export-model] materials: ${info.materials.join(', ')}`);

const missing = GROUPS.filter((g) => info.counts[g] === 0);
if (missing.length) fail(`group(s) missing from the GLB: ${missing.join(', ')}`);
if (size >= MAX_BYTES) fail(`GLB is ${size} bytes, must stay under ${MAX_BYTES}`);
console.log('[export-model] OK');
