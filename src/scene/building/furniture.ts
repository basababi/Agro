// Furniture, fittings, floor finishes and ceiling lights after the furnished plan (third drawing),
// measured from it in the building frame: the lobby's exhibits and seating, the classroom desks,
// the staff rooms, toilets and washroom, the dining tables, the laboratory benches and shelving.
// Rooms the drawing leaves empty (the stair hall) only get lights and a plant.

import { IcosahedronGeometry } from 'three';
import { arcPoints, Builder, sector, type V3 } from './builder';
import {
  ARC_PARTITIONS_F1,
  ARC_PARTITIONS_F2,
  DEG,
  END,
  I,
  INNER_IN,
  LEVEL,
  O,
  OUTER_IN,
  polar,
  rayToCircle,
  toPolar,
  WALL,
  type XZ,
} from './plan';
import { CEILING } from './walls';

export const FURN = {
  wood: 'furnWood',
  woodDark: 'furnWoodDark',
  carcass: 'laminate',
  worktop: 'worktop',
  frame: 'metalDark',
  steel: 'steel',
  seat: 'chairSeat',
  chairFrame: 'chairFrame',
  porcelain: 'porcelain',
  board: 'whiteboard',
  touch: 'touchScreen',
  glass: 'windowGlass',
  lamp: 'lamp',
  housing: 'lampHousing',
  pot: 'pot',
  plant: 'plant',
  soil: 'soil',
  stone: 'stone',
  mirror: 'mirror',
  books: 'books',
  timeline: 'timeline',
  tile: 'floorTile',
  vinyl: 'floorVinyl',
  shadow: 'contactShadow',
} as const;

/**
 * Keys the walker passes through: chairs (between the desks they would trap him) and the floor
 * finishes, which lie a few millimetres above the slab.
 */
export const PASSABLE_FURNITURE: string[] = [FURN.seat, FURN.chairFrame, FURN.tile, FURN.vinyl, FURN.shadow];

const P = WALL.partition;
const F1 = LEVEL.f1;
const F2 = LEVEL.f2;

// ---- Geometry helpers ------------------------------------------------------------------------

type Local = (x: number, z: number) => XZ;

/** A local frame at c: x along `angle` (degrees, from +X towards +Z), z across it. */
function frame(c: XZ, angle: number): Local {
  const ux = Math.cos(angle * DEG);
  const uz = Math.sin(angle * DEG);
  return (x, z) => [c[0] + ux * x - uz * z, c[1] + uz * x + ux * z];
}

/** A box centred on local (x, z), lx × lz, from y0 to y1. */
function box(b: Builder, key: string, f: Local, x: number, z: number, lx: number, lz: number, y0: number, y1: number) {
  const hx = lx / 2;
  const hz = lz / 2;
  b.prism([f(x - hx, z - hz), f(x + hx, z - hz), f(x + hx, z + hz), f(x - hx, z + hz)], y0, y1, key);
}

function ellipse(f: Local, x: number, z: number, rx: number, rz: number, n = 14): XZ[] {
  return Array.from({ length: n }, (_, i) => {
    const t = (i / n) * Math.PI * 2;
    return f(x + Math.cos(t) * rx, z + Math.sin(t) * rz);
  });
}

/**
 * A soft contact shadow on the floor under a footprint: local (x, z), lx × lz, in the frame at c,
 * grown by `spread` on every side.
 */
function shade(b: Builder, c: XZ, angle: number, x: number, z: number, lx: number, lz: number, floor: number, spread = 0.12) {
  const f = frame(c, angle);
  const hx = lx / 2 + spread;
  const hz = lz / 2 + spread;
  const ux = Math.cos(angle * DEG);
  const uz = Math.sin(angle * DEG);
  const uv = (p: V3): [number, number] => {
    const dx = p[0] - c[0];
    const dz = p[2] - c[1];
    return [(dx * ux + dz * uz - x + hx) / (2 * hx), (-dx * uz + dz * ux - z + hz) / (2 * hz)];
  };
  const y = floor + 0.008;
  const q = [f(x - hx, z - hz), f(x + hx, z - hz), f(x + hx, z + hz), f(x - hx, z + hz)].map(([px, pz]) => [px, y, pz] as V3);
  b.triangle(FURN.shadow, q[0], q[1], q[2], uv, [0, 1, 0]);
  b.triangle(FURN.shadow, q[0], q[2], q[3], uv, [0, 1, 0]);
}

/** A soft contact shadow along an arc around c, between radii r0 and r1. */
function arcShade(b: Builder, c: XZ, r0: number, r1: number, a0: number, a1: number, floor: number, spread = 0.12) {
  const y = floor + 0.008;
  const inner = arcPoints(c, r0 - spread, a0, a1, 3);
  const outer = arcPoints(c, r1 + spread, a0, a1, 3);
  const uv = (p: V3): [number, number] => [(Math.hypot(p[0] - c[0], p[2] - c[1]) - (r0 - spread)) / (r1 - r0 + 2 * spread), 0.5];
  for (let i = 0; i < inner.length - 1; i++) {
    const q = [inner[i], inner[i + 1], outer[i + 1], outer[i]].map(([px, pz]) => [px, y, pz] as V3);
    b.triangle(FURN.shadow, q[0], q[1], q[2], uv, [0, 1, 0]);
    b.triangle(FURN.shadow, q[0], q[2], q[3], uv, [0, 1, 0]);
  }
}

const heading = (a: XZ, b: XZ) => Math.atan2(b[1] - a[1], b[0] - a[0]) / DEG;
const mid = (a: XZ, b: XZ): XZ => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
const dist = (a: XZ, b: XZ) => Math.hypot(b[0] - a[0], b[1] - a[1]);
const CORNERS = [
  [-1, -1],
  [1, -1],
  [1, 1],
  [-1, 1],
] as const;

/** Point on a face of the radial wall at θ (around O, thickness t) at radius r; side 1 = larger θ. */
function radialFace(theta: number, t: number, r: number, side: 1 | -1): XZ {
  const [x, z] = polar(O, theta, r);
  return [x + Math.cos(theta * DEG) * side * (t / 2), z + Math.sin(theta * DEG) * side * (t / 2)];
}

/** Point on the room face of the left end wall, `s` metres from its inner (courtyard) end. */
function leftEndFace(s: number): XZ {
  const [a, e] = [END.left.inner, END.left.outer];
  const l = dist(a, e);
  const u: XZ = [(e[0] - a[0]) / l, (e[1] - a[1]) / l];
  return [a[0] + u[0] * s - u[1] * WALL.exterior, a[1] + u[1] * s + u[0] * WALL.exterior];
}

/** Direction (degrees) facing a centre from the point at angle φ around it. */
const towards = (phi: number) => phi + 90;

/** A deterministic random sequence for the shelves and plants. */
function seeded(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---- Pieces -------------------------------------------------------------------------------------

function table(b: Builder, c: XZ, angle: number, length: number, depth: number, floor: number, height = 0.75) {
  const f = frame(c, angle);
  box(b, FURN.wood, f, 0, 0, length, depth, floor + height - 0.035, floor + height);
  const x = length / 2 - 0.07;
  const z = depth / 2 - 0.07;
  for (const [sx, sz] of CORNERS) box(b, FURN.frame, f, sx * x, sz * z, 0.045, 0.045, floor, floor + height - 0.035);
  for (const sz of [-1, 1]) box(b, FURN.frame, f, 0, sz * z, length - 0.14, 0.025, floor + height - 0.1, floor + height - 0.035);
  shade(b, c, angle, 0, 0, length, depth, floor, 0.1);
}

/** A chair at c, facing `face` (degrees). */
function chair(b: Builder, c: XZ, face: number, floor: number) {
  const f = frame(c, face);
  box(b, FURN.seat, f, 0, 0, 0.44, 0.44, floor + 0.42, floor + 0.47);
  box(b, FURN.seat, f, -0.2, 0, 0.04, 0.42, floor + 0.56, floor + 0.86);
  for (const [sx, sz] of CORNERS) box(b, FURN.chairFrame, f, sx * 0.19, sz * 0.19, 0.025, 0.025, floor, floor + 0.42);
  for (const sz of [-1, 1]) box(b, FURN.chairFrame, f, -0.2, sz * 0.19, 0.025, 0.025, floor + 0.47, floor + 0.62);
  shade(b, c, face, 0, 0, 0.44, 0.44, floor, 0.05);
}

/** A square table with a chair on each side. */
function tableSet(b: Builder, c: XZ, angle: number, floor: number, size = 1.1) {
  table(b, c, angle, size, size, floor);
  const f = frame(c, angle);
  for (let k = 0; k < 4; k++) {
    const d = size / 2 + 0.12;
    const t = k * 90 * DEG;
    chair(b, f(Math.cos(t) * d, Math.sin(t) * d), angle + k * 90 + 180, floor);
  }
}

function bench(b: Builder, c: XZ, angle: number, length: number, depth: number, floor: number, height = 0.45) {
  const f = frame(c, angle);
  box(b, FURN.wood, f, 0, 0, length, depth, floor + height - 0.05, floor + height);
  for (const sx of [-1, 1]) box(b, FURN.frame, f, sx * (length / 2 - 0.12), 0, 0.05, depth - 0.08, floor, floor + height - 0.05);
  shade(b, c, angle, 0, 0, length, depth, floor, 0.08);
}

/**
 * Cabinets with their back on the line a→e, reaching `depth` into the room on the `side` of it
 * (1: the left of a→e, i.e. towards +90° from its heading). Base units get a worktop; tall ones
 * (lockers, wardrobes) do not.
 */
function cabinets(b: Builder, a: XZ, e: XZ, side: 1 | -1, depth: number, floor: number, opts: { height?: number; top?: string; tall?: boolean } = {}) {
  const tall = opts.tall ?? false;
  const height = opts.height ?? (tall ? 1.95 : 0.9);
  const top = tall ? null : (opts.top ?? FURN.worktop);
  const body = top ? height - 0.03 : height;
  const length = dist(a, e);
  const f = frame(mid(a, e), heading(a, e));
  const across = (d0: number, d1: number) => (side * (d0 + d1)) / 2;
  box(b, FURN.frame, f, 0, across(0, depth - 0.06), length, depth - 0.06, floor, floor + 0.08);
  box(b, FURN.carcass, f, 0, across(0, depth - 0.02), length, depth - 0.02, floor + 0.08, floor + body);
  if (top) box(b, top, f, 0, across(0, depth + 0.02), length + 0.02, depth + 0.02, floor + body, floor + height);
  const doors = Math.max(1, Math.round(length / (tall ? 0.5 : 0.6)));
  shade(b, mid(a, e), heading(a, e), 0, (side * depth) / 2, length, depth, floor, 0.1);
  const front = side * (depth - 0.02);
  for (let i = 1; i < doors; i++) box(b, FURN.frame, f, -length / 2 + (i * length) / doors, front, 0.006, 0.008, floor + 0.1, floor + body - 0.02);
  for (let i = 0; i < doors; i++) {
    const x = -length / 2 + ((i + (i % 2 ? 0.2 : 0.8)) * length) / doors;
    const y = tall ? floor + 1.05 : floor + body - 0.1;
    box(b, FURN.steel, f, x, front + side * 0.012, tall ? 0.015 : 0.12, 0.02, y, y + (tall ? 0.18 : 0.015));
  }
}

/** Open shelving along a→e with files and boxes on it. */
function shelving(b: Builder, a: XZ, e: XZ, side: 1 | -1, depth: number, floor: number, height: number, levels: number, seed: number) {
  const random = seeded(seed);
  const length = dist(a, e);
  const f = frame(mid(a, e), heading(a, e));
  const z = (side * depth) / 2;
  // standing shelving casts a contact shadow, a wall shelf does not
  if (height > 1) shade(b, mid(a, e), heading(a, e), 0, z, length, depth, floor, 0.1);
  const posts = Math.max(2, Math.round(length / 0.9) + 1);
  for (let i = 0; i < posts; i++) box(b, FURN.frame, f, -length / 2 + 0.02 + (i * (length - 0.04)) / (posts - 1), z, 0.03, depth, floor, floor + height);
  for (let level = 0; level < levels; level++) {
    const y = floor + 0.1 + (level * (height - 0.13)) / (levels - 1);
    box(b, FURN.carcass, f, 0, z, length, depth, y, y + 0.025);
    if (level === levels - 1) continue;
    let x = -length / 2 + 0.05;
    while (x < length / 2 - 0.15) {
      const w = Math.min(0.15 + random() * 0.45, length / 2 - 0.05 - x);
      if (random() < 0.82) box(b, FURN.books, f, x + w / 2, z, w, depth - 0.08, y + 0.025, y + 0.025 + 0.2 + random() * 0.12);
      x += w + 0.02 + random() * 0.12;
    }
  }
}

/** A toilet with its cistern against the wall at `wall` (a point on the wall face), facing `face`. */
function toilet(b: Builder, wall: XZ, face: number, floor: number) {
  const f = frame(wall, face);
  box(b, FURN.porcelain, f, 0.09, 0, 0.17, 0.4, floor + 0.38, floor + 0.78);
  b.prism(ellipse(f, 0.42, 0, 0.26, 0.18), floor, floor + 0.39, FURN.porcelain);
  b.prism(ellipse(f, 0.43, 0, 0.27, 0.19), floor + 0.39, floor + 0.42, FURN.carcass);
  shade(b, wall, face, 0.35, 0, 0.7, 0.4, floor, 0.06);
}

/** A wall basin with a tap and a mirror above it. */
function basin(b: Builder, wall: XZ, face: number, floor: number, width = 0.5) {
  const f = frame(wall, face);
  box(b, FURN.porcelain, f, 0.22, 0, 0.44, width, floor + 0.7, floor + 0.85);
  b.prism(ellipse(f, 0.25, 0, 0.14, width * 0.32), floor + 0.85, floor + 0.853, FURN.steel);
  box(b, FURN.steel, f, 0.05, 0, 0.03, 0.03, floor + 0.85, floor + 1.0);
  box(b, FURN.steel, f, 0.11, 0, 0.13, 0.025, floor + 0.975, floor + 1.0);
  box(b, FURN.mirror, f, 0.006, 0, 0.012, width + 0.1, floor + 1.15, floor + 1.85);
}

/** A run of washbasins in a counter, with one long mirror. */
function vanity(b: Builder, a: XZ, e: XZ, side: 1 | -1, floor: number, basins: number) {
  cabinets(b, a, e, side, 0.55, floor, { height: 0.85, top: FURN.porcelain });
  const length = dist(a, e);
  const f = frame(mid(a, e), heading(a, e));
  for (let i = 0; i < basins; i++) {
    const x = -length / 2 + ((i + 0.5) * length) / basins;
    b.prism(ellipse(f, x, side * 0.3, 0.2, 0.15), floor + 0.85, floor + 0.853, FURN.steel);
    box(b, FURN.steel, f, x, side * 0.06, 0.03, 0.03, floor + 0.85, floor + 1.0);
    box(b, FURN.steel, f, x, side * 0.12, 0.025, 0.13, floor + 0.975, floor + 1.0);
  }
  box(b, FURN.mirror, f, 0, side * 0.006, length - 0.1, 0.012, floor + 1.1, floor + 1.9);
}

/** A whiteboard on a wall face a→e, the room on `side`. */
function whiteboard(b: Builder, a: XZ, e: XZ, side: 1 | -1, floor: number) {
  const length = dist(a, e);
  const f = frame(mid(a, e), heading(a, e));
  box(b, FURN.frame, f, 0, side * 0.012, length + 0.04, 0.024, floor + 0.88, floor + 2.12);
  box(b, FURN.board, f, 0, side * 0.026, length, 0.006, floor + 0.9, floor + 2.1);
  box(b, FURN.frame, f, 0, side * 0.06, length * 0.7, 0.07, floor + 0.88, floor + 0.9);
}

/** A display table with a touch screen for its top (the interactive site plan). */
function touchTable(b: Builder, c: XZ, angle: number, length: number, depth: number, floor: number) {
  const f = frame(c, angle);
  box(b, FURN.frame, f, 0, 0, length - 0.2, depth - 0.2, floor, floor + 0.06);
  box(b, FURN.wood, f, 0, 0, length - 0.1, depth - 0.1, floor + 0.06, floor + 0.8);
  box(b, FURN.wood, f, 0, 0, length, depth, floor + 0.8, floor + 0.86);
  box(b, FURN.touch, f, 0, 0, length - 0.16, depth - 0.16, floor + 0.86, floor + 0.865);
  shade(b, c, angle, 0, 0, length, depth, floor);
}

/** A glass display case on a timber base, with soil monoliths standing in it. */
function vitrine(b: Builder, c: XZ, angle: number, length: number, depth: number, floor: number) {
  const f = frame(c, angle);
  const glass0 = floor + 0.85;
  const glass1 = floor + 1.35;
  box(b, FURN.frame, f, 0, 0, length - 0.1, depth - 0.1, floor, floor + 0.06);
  box(b, FURN.wood, f, 0, 0, length, depth, floor + 0.06, glass0);
  shade(b, c, angle, 0, 0, length, depth, floor);
  box(b, FURN.glass, f, 0, 0, length - 0.04, depth - 0.04, glass0, glass1);
  for (const [sx, sz] of CORNERS) box(b, FURN.frame, f, sx * (length / 2 - 0.03), sz * (depth / 2 - 0.03), 0.025, 0.025, glass0, glass1);
  for (const sz of [-1, 1]) box(b, FURN.frame, f, 0, sz * (depth / 2 - 0.03), length - 0.04, 0.025, glass1 - 0.025, glass1);
  // soil profiles: dark topsoil over brown subsoil over pale parent rock
  const samples = 6;
  for (let i = 0; i < samples; i++) {
    const x = -length / 2 + ((i + 0.5) * length) / samples;
    box(b, FURN.frame, f, x, 0, 0.04, 0.04, glass0, glass0 + 0.05);
    box(b, FURN.stone, f, x, 0, 0.22, 0.05, glass0 + 0.05, glass0 + 0.14);
    box(b, FURN.soil, f, x, 0, 0.22, 0.05, glass0 + 0.14, glass0 + 0.3);
    box(b, FURN.woodDark, f, x, 0, 0.22, 0.05, glass0 + 0.3, glass0 + 0.36);
  }
}

/** A low-poly ball of leaves, jittered so it does not look like a ball. */
const LEAVES = new IcosahedronGeometry(1, 1).getAttribute('position');
function foliage(b: Builder, [x, y, z]: V3, r: number, squash = 0.85) {
  const jitter = (vx: number, vy: number, vz: number) => {
    const s = Math.sin(vx * 12.9898 + vy * 78.233 + vz * 37.719) * 43758.5453;
    return 1 + 0.22 * (s - Math.floor(s) - 0.5);
  };
  for (let i = 0; i < LEAVES.count; i += 3) {
    const corners = [0, 1, 2].map((k) => {
      const vx = LEAVES.getX(i + k);
      const vy = LEAVES.getY(i + k);
      const vz = LEAVES.getZ(i + k);
      const j = jitter(vx, vy, vz) * r;
      return [x + vx * j, y + vy * j * squash, z + vz * j] as V3;
    });
    const out: V3 = [
      LEAVES.getX(i) + LEAVES.getX(i + 1) + LEAVES.getX(i + 2),
      LEAVES.getY(i) + LEAVES.getY(i + 1) + LEAVES.getY(i + 2),
      LEAVES.getZ(i) + LEAVES.getZ(i + 1) + LEAVES.getZ(i + 2),
    ];
    b.triangle(FURN.plant, corners[0], corners[1], corners[2], () => [0, 0], out);
  }
}

function pottedPlant(b: Builder, c: XZ, floor: number, size = 1) {
  const f = frame(c, 0);
  b.prism(ellipse(f, 0, 0, 0.2 * size, 0.2 * size, 12), floor, floor + 0.42 * size, FURN.pot);
  foliage(b, [c[0], floor + 0.85 * size, c[1]], 0.42 * size);
  foliage(b, [c[0] + 0.1 * size, floor + 1.3 * size, c[1] - 0.06 * size], 0.3 * size);
  shade(b, c, 0, 0, 0, 0.4 * size, 0.4 * size, floor, 0.12);
}

/** A round recessed ceiling light. */
function ceilingLight(b: Builder, c: XZ, ceiling: number, size = 0.5) {
  const f = frame(c, 0);
  b.prism(ellipse(f, 0, 0, size / 2, size / 2, 18), ceiling - 0.04, ceiling, FURN.housing, FURN.housing, { bottom: false });
  b.cap(FURN.lamp, ellipse(f, 0, 0, size / 2 - 0.03, size / 2 - 0.03, 18), [], ceiling - 0.042, -1);
}

/** A pendant lamp over a table. */
function pendant(b: Builder, c: XZ, ceiling: number, bottom: number) {
  const f = frame(c, 0);
  box(b, FURN.frame, f, 0, 0, 0.012, 0.012, bottom + 0.22, ceiling);
  b.prism(ellipse(f, 0, 0, 0.19, 0.19, 16), bottom, bottom + 0.22, FURN.frame, FURN.frame, { bottom: false });
  b.cap(FURN.lamp, ellipse(f, 0, 0, 0.16, 0.16, 16), [], bottom + 0.04, -1);
}

/** Counter along an arc around c between radii r0 < r1 (the wall side is r1). */
function arcCounter(b: Builder, c: XZ, r0: number, r1: number, a0: number, a1: number, floor: number, height = 0.9, top: string = FURN.wood) {
  b.prism(sector(c, r0 + 0.04, r1, a0, a1).poly, floor, floor + 0.08, FURN.frame);
  b.prism(sector(c, r0, r1, a0, a1).poly, floor + 0.08, floor + height - 0.035, FURN.carcass);
  b.prism(sector(c, r0 - 0.02, r1, a0, a1).poly, floor + height - 0.035, floor + height, top);
  arcShade(b, c, r0, r1, a0, a1, floor);
  const doors = Math.max(1, Math.round((((a1 - a0) * DEG) * r0) / 0.6));
  for (let i = 1; i < doors; i++) {
    const a = a0 + ((a1 - a0) * i) / doors;
    box(b, FURN.frame, frame(polar(c, a, r0), a), 0, 0, 0.006, 0.008, floor + 0.1, floor + height - 0.05);
  }
}

/** Built-in bench along an arc around c. */
function arcBench(b: Builder, c: XZ, r0: number, r1: number, a0: number, a1: number, floor: number, height = 0.45) {
  b.prism(sector(c, r0 + 0.07, r1 - 0.03, a0 + 0.3, a1 - 0.3).poly, floor, floor + height - 0.05, FURN.woodDark);
  b.prism(sector(c, r0, r1, a0, a1).poly, floor + height - 0.05, floor + height, FURN.wood);
  arcShade(b, c, r0, r1, a0, a1, floor, 0.08);
}

/** A panel on a curved wall, facing the centre, with its texture mapped once over it. */
function arcPanel(b: Builder, key: string, c: XZ, r: number, a0: number, a1: number, y0: number, y1: number) {
  const line = arcPoints(c, r, a0, a1, 1);
  const uv = (p: V3): [number, number] => [(toPolar(c, [p[0], p[2]]).theta - a0) / (a1 - a0), (p[1] - y0) / (y1 - y0)];
  for (let i = 0; i < line.length - 1; i++) {
    const [p, q] = [line[i], line[i + 1]];
    const toward: V3 = [c[0] - p[0], 0, c[1] - p[1]];
    b.triangle(key, [p[0], y0, p[1]], [q[0], y0, q[1]], [q[0], y1, q[1]], uv, toward);
    b.triangle(key, [p[0], y0, p[1]], [q[0], y1, q[1]], [p[0], y1, p[1]], uv, toward);
  }
}

/** A lab bench along the radial line at θ from rIn to rOut, with a shelf spine, a sink and chairs. */
function labBench(b: Builder, theta: number, rIn: number, rOut: number, floor: number) {
  const length = rOut - rIn;
  const along = theta - 90; // pointing outwards
  const f = frame(mid(polar(O, theta, rIn), polar(O, theta, rOut)), along);
  const w = 0.8;
  box(b, FURN.frame, f, 0, 0, length - 0.06, w - 0.12, floor, floor + 0.08);
  box(b, FURN.carcass, f, 0, 0, length - 0.02, w - 0.04, floor + 0.08, floor + 0.87);
  box(b, FURN.worktop, f, 0, 0, length, w, floor + 0.87, floor + 0.9);
  shade(b, mid(polar(O, theta, rIn), polar(O, theta, rOut)), along, 0, 0, length, w, floor);
  for (const s of [-1, 1]) {
    for (let i = 1; i < 6; i++) box(b, FURN.frame, f, -length / 2 + (i * length) / 6, s * (w / 2 - 0.02), 0.006, 0.006, floor + 0.1, floor + 0.85);
  }
  // shelf spine down the middle, from behind the sink to the outer end
  const s0 = -length / 2 + 0.7;
  const s1 = length / 2 - 0.05;
  for (const x of [s0, (s0 + s1) / 2, s1]) box(b, FURN.steel, f, x, 0, 0.04, 0.04, floor + 0.9, floor + 1.62);
  for (const y of [1.25, 1.6]) box(b, FURN.carcass, f, (s0 + s1) / 2, 0, s1 - s0, 0.3, floor + y, floor + y + 0.02);
  const random = seeded(Math.round(theta * 10) + 7);
  for (let x = s0 + 0.1; x < s1 - 0.15; x += 0.25 + random() * 0.3) {
    box(b, random() < 0.5 ? FURN.books : FURN.carcass, f, x, 0, 0.12, 0.12 + random() * 0.1, floor + 1.27, floor + 1.4 + random() * 0.12);
  }
  // sink and tap at the inner end
  box(b, FURN.steel, f, -length / 2 + 0.32, 0, 0.42, 0.5, floor + 0.9, floor + 0.903);
  box(b, FURN.steel, f, -length / 2 + 0.62, 0, 0.03, 0.03, floor + 0.9, floor + 1.2);
  box(b, FURN.steel, f, -length / 2 + 0.52, 0, 0.2, 0.025, floor + 1.17, floor + 1.2);
  for (const x of [-0.2, 0.85]) {
    for (const s of [-1, 1]) chair(b, f(x, s * (w / 2 + 0.12)), along - s * 90, floor);
  }
}

// ---- Floor finishes -------------------------------------------------------------------------------

/** Points along the inner wall's room face, between two angles around O. */
function innerFace(fromTheta: number, toTheta: number): XZ[] {
  const at = (theta: number) => toPolar(I, polar(O, theta, rayToCircle(theta, I, INNER_IN))).theta;
  return arcPoints(I, INNER_IN, at(fromTheta), at(toTheta), 1.5);
}

/** The toilets 2 / 13: inside the curved front wall and the slanted right wall. */
function toiletFloor(): XZ[] {
  return [...arcPoints(O, 12.83, 14.25, 29.4), polar(O, 32.6, OUTER_IN), ...arcPoints(O, OUTER_IN, 32.6, 14.25)];
}

function buildFinishes(f1: Builder, f2: Builder) {
  const lift = 0.004;
  f1.cap(FURN.tile, toiletFloor(), [], F1 + lift, 1);
  f2.cap(FURN.tile, toiletFloor(), [], F2 + lift, 1);
  // washroom 7: between the inner wall, the radial wall at −41.8°, the hall arc and the end wall
  const hall = ARC_PARTITIONS_F1[HALL_INNER];
  const mid7 = (hall.r0 + hall.r1) / 2;
  const endWall = (s: number) => leftEndFace(s);
  f1.cap(FURN.tile, [...innerFace(-74, -41.8), polar(O, -41.8, rayToCircle(-41.8, I, mid7)), ...arcPoints(I, mid7, hall.to, hall.from, 1.5), endWall(0.2)], [], F1 + lift, 1);
  // laboratory 12: sheet vinyl
  f2.cap(FURN.vinyl, [...arcPoints(O, OUTER_IN, -41.85, 14.25, 1.5), ...innerFace(14.25, -41.85)], [], F2 + lift, 1);
}

// ---- Rooms --------------------------------------------------------------------------------------

/** Indices into the curved partitions (see plan.ts). */
const HALL_INNER = 2;
const HALL_OUTER = 3;
const DIVIDER_15_16 = 1;

/** Lobby (1): interactive table, soil vitrine, seating, the timeline wall and its counter. */
function lobby(b: Builder) {
  touchTable(b, [0.64, -12.41], 0, 2.5, 0.85, F1);
  vitrine(b, [-2.84, -7.63], 0, 2.5, 0.85, F1);
  // two benches with a planter between them
  bench(b, [2.57, -10.75], 0, 1.1, 0.38, F1);
  bench(b, [2.57, -9.96], 0, 1.1, 0.38, F1);
  box(b, FURN.woodDark, frame([2.57, -10.355], 0), 0, 0, 0.42, 0.4, F1, F1 + 0.45);
  foliage(b, [2.57, F1 + 0.72, -10.355], 0.3, 0.75);
  shade(b, [2.57, -10.355], 0, 0, 0, 0.42, 0.4, F1, 0.08);
  // counter and timeline panel along the back wall
  arcCounter(b, O, OUTER_IN - 0.5, OUTER_IN - 0.005, -8.6, 13.6, F1);
  arcPanel(b, FURN.timeline, O, OUTER_IN - 0.02, -8.2, 13.2, F1 + 1.25, F1 + 2.75);
  // bench along room 3's curved wall
  arcBench(b, O, 9.95, 10.4, -34.3, -10.4, F1);
  pottedPlant(b, polar(I, -15, 8.6), F1, 1.1);
  pottedPlant(b, polar(I, 15, 8.6), F1, 1.1);
  pottedPlant(b, polar(O, -6.5, 12.6), F1, 0.9);
  for (const r of [9.0, 11.4]) for (const t of [-3, 6, 15, 24, 33]) ceilingLight(b, polar(O, t, r), CEILING[0]);
  for (const t of [-3, 6]) ceilingLight(b, polar(O, t, 13.6), CEILING[0]);
}

/** Classroom (3): nine long desks facing the teacher's table and the whiteboard by the door. */
function classroom(b: Builder) {
  const angle = 54.7;
  const desks: XZ[] = [
    [-7.16, -11.82],
    [-6.2, -12.32],
    [-5.25, -12.78],
    [-4.3, -13.13],
    [-3.28, -13.46],
    [-5.8, -9.95],
    [-4.82, -10.48],
    [-3.83, -10.94],
    [-2.91, -11.28],
  ];
  for (const c of desks) {
    table(b, c, angle, 1.55, 0.55, F1);
    const f = frame(c, angle);
    for (const x of [-0.38, 0.38]) chair(b, f(x, -0.5), angle + 90, F1);
  }
  table(b, [-7.62, -10.17], 49, 0.9, 0.6, F1);
  chair(b, frame([-7.62, -10.17], 49)(0, 0.5), 49 - 90, F1);
  whiteboard(b, radialFace(-41.8, P, 11.5, 1), radialFace(-41.8, P, 13.9, 1), 1, F1);
  for (const r of [11.8, 13.6]) for (const t of [-35, -27, -19, -12]) ceilingLight(b, polar(O, t, r), CEILING[0]);
}

/** Staff rooms 4 and 5: lockers, a table with two chairs, a basin. */
function staffRooms(b: Builder) {
  // room 4: lockers on the wall to room 3, basin beside them
  cabinets(b, radialFace(-41.8, P, 12.0, -1), radialFace(-41.8, P, 14.55, -1), -1, 0.5, F1, { tall: true });
  basin(b, radialFace(-41.8, P, 11.55, -1), -41.8 + 180, F1, 0.45);
  table(b, [-11.49, -8.11], 34.7, 1.2, 0.8, F1);
  for (const s of [-1, 1]) chair(b, frame([-11.49, -8.11], 34.7)(0, s * 0.52), 34.7 - s * 90, F1);
  ceilingLight(b, polar(O, -49.5, 13.3), CEILING[0]);
  // room 5: lockers on the end wall, basin in the corner by the hall
  cabinets(b, leftEndFace(5.75), leftEndFace(7.75), 1, 0.5, F1, { tall: true });
  basin(b, leftEndFace(5.4), heading(END.left.inner, END.left.outer) + 90, F1, 0.45);
  table(b, [-12.35, -6.6], 25, 1.2, 0.8, F1);
  for (const s of [-1, 1]) chair(b, frame([-12.35, -6.6], 25)(0, s * 0.52), 25 - s * 90, F1);
  ceilingLight(b, polar(O, -66, 13.3), CEILING[0]);
}

/** Hall 6: a basin on the wall to room 5 and a bench on the wall to room 7. */
function hall6(b: Builder) {
  const outer = ARC_PARTITIONS_F1[HALL_OUTER];
  const inner = ARC_PARTITIONS_F1[HALL_INNER];
  basin(b, polar(I, -61, outer.r0), towards(-61), F1, 0.45);
  arcBench(b, I, inner.r1, inner.r1 + 0.42, -60.5, -52.5, F1);
  ceilingLight(b, polar(I, -50, 11.07), CEILING[0]);
  ceilingLight(b, polar(I, -61, 11.07), CEILING[0]);
}

/** Washroom 7: two toilets in cubicles on the wall to the lobby, basins on the end wall. */
function washroom7(b: Builder) {
  const face = -41.8 + 180;
  for (const r of [7.2, 8.45]) toilet(b, radialFace(-41.8, P, r, -1), face, F1);
  box(b, FURN.carcass, frame(radialFace(-41.8, P, 7.83, -1), face), 0.65, 0, 1.3, 0.03, F1 + 0.15, F1 + 2.0);
  vanity(b, leftEndFace(0.75), leftEndFace(2.45), 1, F1, 2);
  ceilingLight(b, polar(O, -58, 8.0), CEILING[0]);
}

/** Toilets 2 (ground floor) and 13 (first floor) share a layout. */
function toilets(b: Builder, floor: number, ceiling: number) {
  toilet(b, radialFace(14.25, 0.22, 14.3, 1), 14.25, floor);
  for (const t of [21.0, 23.9]) basin(b, polar(O, t, OUTER_IN), towards(t), floor, 0.45);
  const a = polar(O, 29.4, 12.78);
  const e = polar(O, 32.6, OUTER_IN);
  const h = heading(a, e);
  const l = dist(a, e);
  const u: XZ = [(e[0] - a[0]) / l, (e[1] - a[1]) / l];
  const along = 1.55;
  toilet(b, [a[0] + u[0] * along + u[1] * (P / 2), a[1] + u[1] * along - u[0] * (P / 2)], h - 90, floor);
  for (const t of [18.3, 25.9]) ceilingLight(b, polar(O, t, 13.8), ceiling, 0.35);
}

/** Dining room 8: four tables of four. */
function dining(b: Builder) {
  const tables: XZ[] = [
    [8.09, -6.51],
    [10.46, -8.5],
    [12.08, -5.82],
    [9.64, -4.35],
  ];
  for (const c of tables) {
    tableSet(b, c, -15, F1);
    pendant(b, c, CEILING[0], F1 + 2.0);
  }
  pottedPlant(b, polar(O, 48, 13.9), F1);
}

/** Laboratory 12: three island benches, a counter under the courtyard window, a wall counter. */
function laboratory(b: Builder) {
  for (const t of [-23.3, -7.9, 6.4]) labBench(b, t, 11.1, 14.55, F2);
  // counter along the inner wall, with a sink at its right end and two chairs
  const c = polar(I, -13, 7.95);
  const f = frame(c, -13);
  box(b, FURN.frame, f, 0, 0.03, 3.2, 0.5, F2, F2 + 0.08);
  box(b, FURN.carcass, f, 0, 0, 3.2, 0.58, F2 + 0.08, F2 + 0.87);
  box(b, FURN.worktop, f, 0, 0, 3.22, 0.62, F2 + 0.87, F2 + 0.9);
  shade(b, c, -13, 0, 0, 3.2, 0.6, F2);
  box(b, FURN.steel, f, 1.2, 0, 0.45, 0.4, F2 + 0.9, F2 + 0.903);
  box(b, FURN.steel, f, 1.2, 0.22, 0.03, 0.03, F2 + 0.9, F2 + 1.15);
  for (const x of [-0.9, 0.1]) chair(b, f(x, -0.42), -13 + 90, F2);
  // wall counter with a shelf above, on the wall to room 14
  const a = radialFace(-41.85, P, 10.6, 1);
  const e = radialFace(-41.85, P, 14.45, 1);
  cabinets(b, a, e, 1, 0.65, F2);
  shelving(b, radialFace(-41.85, P, 10.8, 1), radialFace(-41.85, P, 14.3, 1), 1, 0.3, F2 + 1.45, 0.62, 2, 31);
  for (const r of [9.6, 11.8, 13.8]) for (const t of [-34, -24, -14, -4, 6]) ceilingLight(b, polar(O, t, r), CEILING[1]);
}

/** Stair hall 10 (first floor). */
function stairHall(b: Builder) {
  // by the courtyard window, clear of the doors to the toilets and the laboratory
  pottedPlant(b, polar(O, 22, 7.1), F2);
  ceilingLight(b, polar(O, 22, 9.3), CEILING[1]);
  ceilingLight(b, polar(O, 31, 10.3), CEILING[1]);
}

/** Room 11: a table of four and a long run of cabinets under the outer windows. */
function room11(b: Builder) {
  tableSet(b, [8.82, -5.44], -15, F2);
  cabinets(b, polar(O, 45.8, OUTER_IN - 0.005), polar(O, 72.3, OUTER_IN - 0.005), 1, 0.8, F2, { height: 0.88, top: FURN.wood });
  ceilingLight(b, polar(O, 55, 10.4), CEILING[1]);
  ceilingLight(b, polar(O, 64, 12.6), CEILING[1]);
}

/** Rooms 14, 15, 16 (first floor, left wing): desk counter, shelving, desk, low cabinets. */
function leftWingF2(b: Builder) {
  // 14: counter on the wall to the laboratory, sink at its outer end
  cabinets(b, radialFace(-41.85, P, 10.6, -1), radialFace(-41.85, P, 14.45, -1), -1, 0.6, F2);
  const sink = frame(radialFace(-41.85, P, 13.9, -1), -41.85 + 180);
  box(b, FURN.steel, sink, 0.3, 0, 0.4, 0.45, F2 + 0.9, F2 + 0.903);
  box(b, FURN.steel, sink, 0.06, 0, 0.03, 0.03, F2 + 0.9, F2 + 1.15);
  chair(b, frame(radialFace(-41.85, P, 11.8, -1), -41.85 + 180)(0.75, 0), -41.85, F2);
  ceilingLight(b, polar(O, -49.5, 10.5), CEILING[1]);
  ceilingLight(b, polar(O, -49.5, 13.2), CEILING[1]);
  // 15: desk on the end wall, shelving along the curved wall to room 16
  cabinets(b, leftEndFace(0.8), leftEndFace(2.5), 1, 0.6, F2, { height: 0.75, top: FURN.wood });
  chair(b, frame(leftEndFace(1.65), heading(END.left.inner, END.left.outer) + 90)(0.55, 0), heading(END.left.inner, END.left.outer) - 90, F2);
  // the curved wall in three straight runs, the room on the side towards I
  const divider = ARC_PARTITIONS_F2[DIVIDER_15_16];
  const face = divider.r0;
  const start = divider.from + 0.3 / face / DEG;
  const end = divider.to - 0.3 / face / DEG;
  const runs = 3;
  for (let i = 0; i < runs; i++) {
    const a0 = start + ((end - start) * i) / runs;
    const a1 = start + ((end - start) * (i + 1)) / runs;
    shelving(b, polar(I, a0, face), polar(I, a1, face), 1, 0.4, F2, 2.0, 5, 40 + i);
  }
  ceilingLight(b, polar(O, -66, 9.2), CEILING[1]);
  // 16: low cabinets under the outer window, a counter on the end wall
  arcCounter(b, O, OUTER_IN - 0.45, OUTER_IN - 0.005, -72.3, -57.8, F2, 0.85, FURN.wood);
  cabinets(b, leftEndFace(5.3), leftEndFace(7.25), 1, 0.6, F2);
  ceilingLight(b, polar(O, -66, 13.2), CEILING[1]);
}

/** All furniture, fittings, finishes and lights; ground floor into `f1`, first floor into `f2`. */
export function buildFurniture(f1: Builder, f2: Builder) {
  buildFinishes(f1, f2);
  lobby(f1);
  classroom(f1);
  staffRooms(f1);
  hall6(f1);
  washroom7(f1);
  toilets(f1, F1, CEILING[0]);
  dining(f1);
  laboratory(f2);
  stairHall(f2);
  room11(f2);
  toilets(f2, F2, CEILING[1]);
  leftWingF2(f2);
}
