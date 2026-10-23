// Furniture, fittings, exhibits and lights in the updated room plan, measured in the building frame.

import { IcosahedronGeometry } from 'three';
import { arcPoints, Builder, sector, type V3 } from './builder';
import {
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
  equipment: 'labEquipment',
  equipmentDark: 'labEquipmentDark',
  screen: 'labScreen',
  indicator: 'equipmentIndicator',
  rubber: 'equipmentRubber',
  water: 'exhibitWater',
  chemical: 'chemicalCabinet',
  linen: 'linen',
  seasonSpring: 'seasonSpring',
  seasonSummer: 'seasonSummer',
  seasonAutumn: 'seasonAutumn',
  seasonWinter: 'seasonWinter',
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

/** A bed and locker for the staff rest rooms. */
function bed(b: Builder, c: XZ, angle: number, floor: number) {
  const f = frame(c, angle);
  box(b, FURN.frame, f, 0, 0, 1.95, 0.92, floor, floor + 0.3);
  box(b, FURN.linen, f, 0, 0, 1.88, 0.88, floor + 0.3, floor + 0.48);
  box(b, FURN.wood, f, 0.42, 0, 1.0, 0.86, floor + 0.48, floor + 0.51);
  box(b, FURN.linen, f, -0.64, 0, 0.36, 0.62, floor + 0.48, floor + 0.58);
  shade(b, c, angle, 0, 0, 1.95, 0.92, floor, 0.12);
}

/** A small sofa for the upstairs changing and rest area. */
function sofa(b: Builder, c: XZ, angle: number, floor: number) {
  const f = frame(c, angle);
  box(b, FURN.woodDark, f, 0, 0, 1.85, 0.72, floor, floor + 0.32);
  box(b, FURN.linen, f, 0, 0.02, 1.78, 0.68, floor + 0.32, floor + 0.52);
  box(b, FURN.linen, f, 0, -0.29, 1.82, 0.14, floor + 0.52, floor + 1.02);
  for (const x of [-0.84, 0.84]) box(b, FURN.linen, f, x, 0, 0.14, 0.68, floor + 0.48, floor + 0.88);
  shade(b, c, angle, 0, 0, 1.85, 0.72, floor, 0.12);
}

/** A compact appliance with a display and a metal work surface. */
function chamferedBox(b: Builder, key: string, f: Local, length: number, depth: number, y0: number, y1: number, bevel = 0.045) {
  const x = length / 2;
  const z = depth / 2;
  const cut = Math.min(bevel, length * 0.12, depth * 0.12);
  const outline: XZ[] = [
    [-x + cut, -z], [x - cut, -z], [x, -z + cut], [x, z - cut],
    [x - cut, z], [-x + cut, z], [-x, z - cut], [-x, -z + cut],
  ].map(([px, pz]) => f(px, pz));
  b.prism(outline, y0, y1, key, key);
}

/** A compact appliance with softened casing edges, a recessed control panel and hardware. */
function appliance(b: Builder, c: XZ, angle: number, length: number, depth: number, height: number, floor: number, kind: 'standard' | 'hood' = 'standard') {
  const f = frame(c, angle);
  const front = depth / 2;
  const screenW = Math.min(0.25, length * 0.34);
  const panelH = Math.max(0.16, Math.min(0.31, height * 0.22));
  box(b, FURN.frame, f, 0, 0, length - 0.06, depth - 0.06, floor, floor + 0.075);
  chamferedBox(b, FURN.equipment, f, length, depth, floor + 0.075, floor + height - 0.035, Math.min(0.055, depth * 0.1));
  // A fine stainless cap and a darker plinth make the casing read as assembled equipment.
  box(b, FURN.steel, f, 0, 0, length + 0.022, depth + 0.022, floor + height - 0.035, floor + height);
  box(b, FURN.rubber, f, 0, front + 0.012, Math.min(0.43, length * 0.68), 0.012, floor + 0.1, floor + 0.14);
  // Recessed controls: dark surround, glass display, and tactile controls beside it.
  const panelY = floor + (kind === 'hood' ? height * 0.16 : Math.min(height * 0.64, height - panelH - 0.08));
  box(b, FURN.equipmentDark, f, 0, front + 0.012, Math.min(0.42, length * 0.68), 0.016, panelY, panelY + panelH);
  box(b, FURN.screen, f, -Math.min(0.045, length * 0.08), front + 0.022, screenW, 0.008, panelY + panelH * 0.24, panelY + panelH * 0.78);
  for (let i = 0; i < 2; i++) {
    const bx = Math.min(0.12, length * 0.18) + i * 0.065;
    if (bx < length * 0.34) {
      box(b, FURN.steel, f, bx, front + 0.025, 0.032, 0.018, panelY + panelH * 0.55, panelY + panelH * 0.75);
      box(b, FURN.indicator, f, bx, front + 0.036, 0.012, 0.006, panelY + panelH * 0.28, panelY + panelH * 0.4);
    }
  }
  // Door line, pull handle and low ventilation slots give the cabinet visible scale.
  if (height > 0.58) {
    box(b, FURN.frame, f, length * 0.18, front + 0.012, 0.006, 0.009, floor + 0.18, panelY - 0.08);
    box(b, FURN.steel, f, length * 0.34, front + 0.035, 0.025, 0.025, floor + height * 0.36, floor + height * 0.58);
  }
  if (height > 0.55) {
    const vents = Math.max(2, Math.min(6, Math.floor(length / 0.13)));
    for (let i = 0; i < vents; i++) {
      const x = -((vents - 1) * 0.055) / 2 + i * 0.055;
      box(b, FURN.equipmentDark, f, x, front + 0.012, 0.028, 0.008, floor + 0.19, floor + 0.205);
    }
  }
  if (kind === 'hood') {
    // A glazed sash and work chamber identify this as a fume hood rather than a plain cabinet.
    const chamberBottom = floor + height * 0.38;
    const chamberTop = floor + height * 0.78;
    box(b, FURN.frame, f, 0, front + 0.018, length * 0.76, 0.024, chamberBottom, chamberTop);
    box(b, FURN.glass, f, 0, front + 0.034, length * 0.68, 0.008, chamberBottom + 0.025, chamberTop - 0.025);
    box(b, FURN.steel, f, 0, front + 0.05, length * 0.73, 0.018, chamberBottom, chamberBottom + 0.025);
    box(b, FURN.steel, f, 0, 0, length * 0.82, depth * 0.86, floor + height * 0.82, floor + height * 0.85);
    box(b, FURN.equipmentDark, f, 0, front + 0.017, length * 0.28, 0.012, floor + height * 0.89, floor + height * 0.93);
  }
  shade(b, c, angle, 0, 0, length, depth, floor, 0.09);
}

/** A small monitor and keyboard for office or lab workstations. */
function workstation(b: Builder, c: XZ, angle: number, floor: number, tabletop = 0.77) {
  const f = frame(c, angle);
  box(b, FURN.equipmentDark, f, 0, 0, 0.46, 0.3, floor + tabletop, floor + tabletop + 0.03);
  box(b, FURN.frame, f, 0, -0.08, 0.08, 0.05, floor + tabletop + 0.03, floor + tabletop + 0.34);
  box(b, FURN.equipmentDark, f, 0, -0.08, 0.58, 0.065, floor + tabletop + 0.31, floor + tabletop + 0.68);
  box(b, FURN.screen, f, 0, -0.043, 0.51, 0.008, floor + tabletop + 0.34, floor + tabletop + 0.65);
  box(b, FURN.frame, f, 0, -0.08, 0.1, 0.06, floor + tabletop + 0.68, floor + tabletop + 0.7);
  // Keyboard keys are spaced in rows; a mouse and its cable-side rest complete the workstation.
  box(b, FURN.equipmentDark, f, 0, 0.3, 0.44, 0.19, floor + tabletop, floor + tabletop + 0.026);
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 9; col++) {
      box(b, FURN.rubber, f, -0.185 + col * 0.046, 0.235 + row * 0.05, 0.026, 0.018, floor + tabletop + 0.027, floor + tabletop + 0.031);
    }
  }
  box(b, FURN.equipmentDark, f, 0.31, 0.3, 0.085, 0.11, floor + tabletop, floor + tabletop + 0.04);
}

/** A compact microscope model for the lab worktops. */
function microscope(b: Builder, c: XZ, angle: number, floor: number) {
  const f = frame(c, angle);
  const y = floor + 0.9;
  b.prism(ellipse(f, 0, 0, 0.18, 0.15), y, y + 0.07, FURN.equipmentDark);
  b.prism(ellipse(f, -0.02, -0.01, 0.075, 0.07), y + 0.07, y + 0.31, FURN.equipment);
  box(b, FURN.equipmentDark, f, 0, 0.005, 0.21, 0.16, y + 0.3, y + 0.33);
  box(b, FURN.equipment, f, -0.035, -0.045, 0.13, 0.19, y + 0.32, y + 0.37);
  // Arm, eyepiece and objective lenses use contrasting metal and dark optics.
  box(b, FURN.equipment, f, -0.02, -0.01, 0.065, 0.055, y + 0.3, y + 0.52);
  box(b, FURN.equipmentDark, f, -0.01, -0.06, 0.085, 0.13, y + 0.49, y + 0.56);
  box(b, FURN.equipment, f, 0.035, 0.025, 0.042, 0.085, y + 0.34, y + 0.45);
  b.prism(ellipse(f, 0.045, 0.025, 0.026, 0.026), y + 0.34, y + 0.37, FURN.rubber);
  for (const x of [-0.095, 0.095]) {
    b.prism(ellipse(f, x, 0.015, 0.038, 0.038), y + 0.2, y + 0.24, FURN.steel);
  }
}

/** The central four-season forest island, with a clear circulation ring around it. */
function seasonalModel(b: Builder, c: XZ, floor: number) {
  const f = frame(c, 0);
  b.prism(ellipse(f, 0, 0, 1.47, 1.47, 48), floor, floor + 0.22, FURN.woodDark);
  b.prism(ellipse(f, 0, 0, 1.4, 1.4, 48), floor + 0.22, floor + 0.3, FURN.wood);
  b.prism(ellipse(f, 0, 0, 1.27, 1.27, 48), floor + 0.3, floor + 0.38, FURN.soil);

  // Four tactile landscape quadrants surround the central native-tree grove.
  const seasons = [FURN.seasonSpring, FURN.seasonSummer, FURN.seasonAutumn, FURN.seasonWinter];
  for (let i = 0; i < seasons.length; i++) {
    const a0 = i * 90 + 5;
    const a1 = (i + 1) * 90 - 5;
    b.prism(sector(c, 1.02, 1.25, a0, a1).poly, floor + 0.38, floor + 0.45, seasons[i]);
    const a = a0 + 45;
    const p = polar(c, a, 1.11);
    const dx = p[0] - c[0];
    const dz = p[1] - c[1];
    box(b, FURN.woodDark, f, dx, dz, 0.09, 0.09, floor + 0.45, floor + 0.78);
    foliage(b, [p[0], floor + 0.96, p[1]], 0.22, 0.78);
  }

  b.prism(ellipse(f, 0, 0, 0.88, 0.88, 32), floor + 0.38, floor + 0.5, FURN.soil);
  const trees: [number, number, number, number][] = [
    [-0.34, -0.17, 1.58, 0.42], [0.18, -0.3, 1.38, 0.36],
    [0.33, 0.22, 1.78, 0.44], [-0.24, 0.38, 1.27, 0.34],
  ];
  for (const [x, z, top, crown] of trees) {
    b.prism(ellipse(f, x, z, 0.075, 0.075, 10), floor + 0.5, floor + top - crown * 0.45, FURN.woodDark);
    const p = f(x, z);
    foliage(b, [p[0], floor + top, p[1]], crown, 0.9);
    foliage(b, [p[0] + 0.08, floor + top - 0.24, p[1] - 0.04], crown * 0.72, 0.85);
  }
  // Four low touch points sit on the exhibit rim rather than in the walking aisle.
  for (const [x, z] of [[0, -0.83], [0.83, 0], [0, 0.83], [-0.83, 0]] as const) {
    box(b, FURN.equipmentDark, f, x, z, 0.28, 0.16, floor + 0.46, floor + 0.5);
    box(b, FURN.screen, f, x, z, 0.22, 0.11, floor + 0.5, floor + 0.507);
  }
  shade(b, c, 0, 0, 0, 2.94, 2.94, floor, 0.14);
}

/** A low circular tree-ring exhibit, kept beside the main island and out of the door path. */
function treeRingDisplay(b: Builder, c: XZ, floor: number) {
  const f = frame(c, 0);
  b.prism(ellipse(f, 0, 0, 0.88, 0.88, 36), floor, floor + 0.68, FURN.woodDark);
  b.prism(ellipse(f, 0, 0, 0.83, 0.83, 36), floor + 0.68, floor + 0.74, FURN.wood);
  for (let i = 0; i < 7; i++) {
    const radius = 0.68 - i * 0.085;
    b.prism(ellipse(f, 0, 0, radius, radius, 32), floor + 0.74 + i * 0.006, floor + 0.746 + i * 0.006, i % 2 ? FURN.woodDark : FURN.wood);
  }
  b.prism(ellipse(f, 0, 0, 0.09, 0.09, 16), floor + 0.786, floor + 0.8, FURN.woodDark);
  box(b, FURN.equipmentDark, f, 0, -0.73, 0.3, 0.07, floor + 0.74, floor + 0.79);
  box(b, FURN.screen, f, 0, -0.73, 0.24, 0.01, floor + 0.79, floor + 0.797);
  shade(b, c, 0, 0, 0, 1.76, 1.76, floor, 0.1);
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

/** A glass display case comparing vegetated soil with bare, eroding soil. */
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
  // Two sloped soil beds, one planted and one bare, drain into a visible collection channel.
  const bedDepth = depth * 0.48;
  for (const [x, planted] of [[-length * 0.23, true], [length * 0.23, false]] as const) {
    box(b, FURN.frame, f, x, 0, length * 0.38, bedDepth, glass0 + 0.04, glass0 + 0.1);
    box(b, FURN.soil, f, x, -depth * 0.035, length * 0.36, bedDepth * 0.75, glass0 + 0.1, glass0 + 0.31);
    box(b, FURN.woodDark, f, x, -depth * 0.035, length * 0.36, 0.035, glass0 + 0.31, glass0 + 0.34);
    box(b, FURN.water, f, x, depth * 0.31, length * 0.38, 0.095, glass0 + 0.1, glass0 + 0.16);
    if (planted) {
      for (const px of [-0.48, -0.16, 0.16, 0.48]) {
        const p = f(x + px, -depth * 0.035);
        foliage(b, [p[0], glass0 + 0.35 + (px === 0 ? 0.03 : 0), p[1]], 0.1, 0.72);
      }
    } else {
      for (const px of [-0.38, 0, 0.38]) {
        const p = f(x + px, -depth * 0.035);
        b.prism(ellipse(frame(p, 0), 0, 0, 0.055, 0.04, 8), glass0 + 0.31, glass0 + 0.36, FURN.stone);
      }
    }
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
  // laboratory 12: sheet vinyl
  f2.cap(FURN.vinyl, [...arcPoints(O, OUTER_IN, -41.85, 14.25, 1.5), ...innerFace(14.25, -41.85)], [], F2 + lift, 1);
}

// ---- Rooms --------------------------------------------------------------------------------------

/** Index of the curved room divider between 15 and 16 (see plan.ts). */
const DIVIDER_15_16 = 1;

/** Lobby (1): six learning stops, with the timeline and seasonal model as the main exhibits. */
function lobby(b: Builder) {
  // Pair the interactive forest map and soil experiment beside the entry, leaving a straight,
  // generous route from the courtyard doors to the main island.
  touchTable(b, [-2.75, -7.55], 0, 1.9, 0.78, F1);
  vitrine(b, [2.75, -7.55], 0, 2.0, 0.82, F1);
  seasonalModel(b, [0.2, -10.35], F1);
  // A separate tree-ring table sits to the right with a full visitor aisle around it.
  treeRingDisplay(b, [4.3, -10.35], F1);
  // counter and timeline panel along the back wall
  arcCounter(b, O, OUTER_IN - 0.5, OUTER_IN - 0.005, -8.6, 13.6, F1);
  arcPanel(b, FURN.timeline, O, OUTER_IN - 0.02, -8.2, 13.2, F1 + 1.25, F1 + 2.75);
  // bench along room 3's curved wall
  arcBench(b, O, 9.95, 10.4, -34.3, -18.5, F1);
  // Keep the entrance approach and the loop around the island free of loose furniture.
  for (const r of [9.0, 11.4]) for (const t of [-3, 6, 15, 24, 33]) ceilingLight(b, polar(O, t, r), CEILING[0]);
  for (const t of [-3, 6]) ceilingLight(b, polar(O, t, 13.6), CEILING[0]);
}

/** Classroom (3): twelve student seats facing the teacher's table and the whiteboard. */
function classroom(b: Builder) {
  const angle = 54.7;
  // Six two-seat tables keep an open centre aisle to the door and a clear teaching zone.
  const desks: XZ[] = [
    [-7.16, -11.82],
    [-5.25, -12.78],
    [-3.28, -13.46],
    [-5.8, -9.95],
    [-3.83, -10.94],
    [-1.99, -11.66],
  ];
  for (const c of desks) {
    table(b, c, angle, 1.3, 0.58, F1);
    const f = frame(c, angle);
    for (const x of [-0.32, 0.32]) chair(b, f(x, -0.5), angle + 90, F1);
  }
  table(b, [-7.62, -10.17], 49, 0.9, 0.6, F1);
  chair(b, frame([-7.62, -10.17], 49)(0, 0.5), 49 - 90, F1);
  whiteboard(b, radialFace(-41.8, P, 11.5, 1), radialFace(-41.8, P, 13.9, 1), 1, F1);
  for (const r of [11.8, 13.6]) for (const t of [-35, -27, -19, -12]) ceilingLight(b, polar(O, t, r), CEILING[0]);
}

/** Staff rooms 4 and 5: one bed and a locker set in each room. */
function staffRooms(b: Builder) {
  // room 4: men's staff quarters
  cabinets(b, radialFace(-41.8, P, 12.0, -1), radialFace(-41.8, P, 14.55, -1), -1, 0.5, F1, { tall: true });
  bed(b, polar(O, -49, 13.1), 41, F1);
  ceilingLight(b, polar(O, -49.5, 13.3), CEILING[0]);
  // room 5: women's staff quarters
  cabinets(b, leftEndFace(5.75), leftEndFace(7.75), 1, 0.5, F1, { tall: true });
  bed(b, polar(O, -61.3, 13.15), 28.7, F1);
  ceilingLight(b, polar(O, -66, 13.3), CEILING[0]);
}

/** Kitchen (6): compact preparation counter, sink, cooktop and refrigerator. */
function hall6(b: Builder) {
  arcCounter(b, I, 10.3, 10.9, -64, -45, F1, 0.9, FURN.worktop);
  basin(b, polar(I, -59, 10.55), towards(-59), F1, 0.5);
  appliance(b, polar(I, -50, 10.65), 40, 0.9, 0.72, 0.92, F1);
  appliance(b, polar(I, -64, 11.2), 28, 0.78, 0.72, 1.8, F1);
  ceilingLight(b, polar(I, -50, 11.07), CEILING[0]);
  ceilingLight(b, polar(I, -61, 11.07), CEILING[0]);
}

/** Office (7): staff work desk, computer, storage and printer. */
function office7(b: Builder) {
  const desk = polar(I, -55, 8.75);
  table(b, desk, 35, 1.6, 0.78, F1);
  workstation(b, desk, 35, F1);
  chair(b, frame(desk, 35)(0, 0.66), 35 + 180, F1);
  cabinets(b, leftEndFace(0.75), leftEndFace(2.45), 1, 0.55, F1, { height: 1.85, tall: true });
  const endWall = frame(mid(END.left.inner, END.left.outer), heading(END.left.inner, END.left.outer));
  appliance(b, endWall(2.8 - dist(END.left.inner, mid(END.left.inner, END.left.outer)), 0.46), 22, 0.54, 0.5, 0.72, F1);
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

/** DIY workshop (8): reusable timber benches, a paper-making table and seed trays. */
function workshop(b: Builder) {
  const benches: XZ[] = [
    polar(O, 49, 11.6),
    polar(O, 60, 13.5),
    polar(O, 72, 13.4),
  ];
  for (const c of benches) {
    table(b, c, -15, 1.85, 0.82, F1);
    for (const x of [-0.42, 0.42]) {
      chair(b, frame(c, -15)(x, 0.69), -105, F1);
      chair(b, frame(c, -15)(x, -0.69), 75, F1);
    }
  }
  // Reused wood stock, paper pulp tubs and a tray for seed-starting demonstrations.
  cabinets(b, polar(O, 73, 12.6), polar(O, 59, 12.6), -1, 0.42, F1, { height: 0.9, top: FURN.wood });
  const materialSamples: [XZ, string][] = [
    [[8.55, -4.95], FURN.woodDark],
    [[9.0, -4.95], FURN.equipment],
    [[9.45, -4.95], FURN.seasonSpring],
  ];
  for (const [c, key] of materialSamples) {
    box(b, key, frame(c, 0), 0, 0, 0.34, 0.36, F1, F1 + 0.32);
  }
  for (const c of benches) ceilingLight(b, polar(O, 58, Math.hypot(...c)), CEILING[0]);
}

/** Laboratory 12: three island benches, a counter under the courtyard window, a wall counter. */
function laboratory(b: Builder) {
  // Leave a continuous 1.2 m perimeter aisle behind the island benches.
  for (const t of [-23.3, -7.9, 6.4]) labBench(b, t, 10.9, 13.1, F2);
  for (const t of [-23.3, -7.9, 6.4]) {
    const along = t - 90;
    microscope(b, polar(O, t, 11.7), along, F2);
    microscope(b, polar(O, t, 12.4), along, F2);
    workstation(b, polar(O, t, 12.85), along, F2, 0.9);
  }
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
  workstation(b, frame(c, -13)(-0.35, -0.08), -13, F2, 0.9);
  // wall counter with a shelf above, on the wall to room 14
  const a = radialFace(-41.85, P, 10.6, 1);
  const e = radialFace(-41.85, P, 14.45, 1);
  cabinets(b, a, e, 1, 0.65, F2);
  shelving(b, radialFace(-41.85, P, 10.8, 1), radialFace(-41.85, P, 14.3, 1), 1, 0.3, F2 + 1.45, 0.62, 2, 31);
  for (const r of [9.6, 11.8, 13.8]) for (const t of [-34, -24, -14, -4, 6]) ceilingLight(b, polar(O, t, r), CEILING[1]);
}

/** Changing and rest area (10): lockers and a quiet seating bench beside the stair hall. */
function stairHall(b: Builder) {
  cabinets(b, polar(O, 19, 8.05), polar(O, 38, 8.05), 1, 0.52, F2, { height: 1.9, tall: true });
  sofa(b, polar(O, 27, 9.5), 117, F2);
  appliance(b, polar(O, 37, 9.0), 53, 0.36, 0.36, 1.08, F2);
  pottedPlant(b, polar(O, 22, 7.1), F2, 0.8);
  ceilingLight(b, polar(O, 22, 9.3), CEILING[1]);
  ceilingLight(b, polar(O, 31, 10.3), CEILING[1]);
}

/** Microbiology lab (11): laminar hood, autoclave, PCR, incubator and microscopes. */
function room11(b: Builder) {
  cabinets(b, polar(O, 45.8, OUTER_IN - 0.005), polar(O, 72.3, OUTER_IN - 0.005), 1, 0.8, F2, { height: 0.88, top: FURN.wood });
  const hood = polar(O, 53, 11.15);
  appliance(b, hood, 37, 1.65, 0.72, 1.55, F2, 'hood');
  appliance(b, polar(O, 63, 11.3), 27, 0.82, 0.72, 1.35, F2);
  appliance(b, polar(O, 71, 10.85), 19, 0.78, 0.65, 1.1, F2);
  appliance(b, polar(O, 55, 12.55), 35, 0.72, 0.56, 0.78, F2);
  const bench = polar(O, 60, 9.45);
  table(b, bench, -30, 1.8, 0.78, F2, 0.9);
  microscope(b, frame(bench, -30)(-0.42, 0), -30, F2);
  microscope(b, frame(bench, -30)(0.38, 0), -30, F2);
  workstation(b, frame(bench, -30)(0, -0.3), -30, F2);
  appliance(b, frame(bench, -30)(0.55, 0.12), -30, 0.38, 0.34, 0.34, F2);
  ceilingLight(b, polar(O, 55, 10.4), CEILING[1]);
  ceilingLight(b, polar(O, 64, 12.6), CEILING[1]);
}

/** Rooms 14, 15, 16 (first floor, left wing): desk counter, shelving, desk, low cabinets. */
function leftWingF2(b: Builder) {
  // 14: sample preparation and genetics equipment beside the laboratory wall.
  cabinets(b, radialFace(-41.85, P, 10.6, -1), radialFace(-41.85, P, 14.45, -1), -1, 0.6, F2);
  const sink = frame(radialFace(-41.85, P, 13.9, -1), -41.85 + 180);
  box(b, FURN.steel, sink, 0.3, 0, 0.4, 0.45, F2 + 0.9, F2 + 0.903);
  box(b, FURN.steel, sink, 0.06, 0, 0.03, 0.03, F2 + 0.9, F2 + 1.15);
  chair(b, frame(radialFace(-41.85, P, 11.8, -1), -41.85 + 180)(0.75, 0), -41.85, F2);
  // Move the extraction hood out of the doorway and keep the inner approach clear.
  appliance(b, polar(O, -48, 11.65), 42, 1.45, 0.78, 1.55, F2, 'hood'); // fume hood
  appliance(b, polar(O, -50, 12.2), 40, 0.62, 0.58, 0.78, F2); // sample grinder
  appliance(b, polar(O, -46, 13.25), 44, 0.58, 0.58, 0.62, F2); // refrigerated centrifuge
  appliance(b, polar(O, -54, 10.65), 36, 0.48, 0.48, 0.48, F2); // water bath
  appliance(b, polar(O, -51, 13.6), 39, 0.64, 0.5, 0.65, F2); // gel documentation
  appliance(b, polar(O, -56, 12.2), 34, 0.48, 0.48, 0.52, F2); // ultrasonic cleaner
  ceilingLight(b, polar(O, -49.5, 10.5), CEILING[1]);
  ceilingLight(b, polar(O, -49.5, 13.2), CEILING[1]);
  // 15: dedicated chemical safety cabinets and an extraction unit.
  cabinets(b, leftEndFace(0.8), leftEndFace(2.5), 1, 0.6, F2, { height: 1.9, tall: true });
  appliance(b, polar(O, -62, 12.5), 28, 0.85, 0.62, 1.65, F2);
  const safeCabinet = frame(polar(O, -59, 13.1), 31);
  box(b, FURN.chemical, safeCabinet, 0, 0, 0.82, 0.62, F2, F2 + 1.8);
  box(b, FURN.equipmentDark, safeCabinet, 0, 0.32, 0.72, 0.018, F2 + 0.15, F2 + 1.65);
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
  // 16: ultra-low freezer, standard laboratory refrigerator and a liquid-nitrogen Dewar.
  arcCounter(b, O, OUTER_IN - 0.45, OUTER_IN - 0.005, -72.3, -57.8, F2, 0.85, FURN.wood);
  cabinets(b, leftEndFace(5.3), leftEndFace(7.25), 1, 0.6, F2);
  appliance(b, polar(O, -68, 11.5), 22, 0.9, 0.82, 1.28, F2);
  appliance(b, polar(O, -72, 13.2), 18, 0.72, 0.72, 1.45, F2);
  const dewar = frame(polar(O, -65, 9.3), 25);
  b.prism(ellipse(dewar, 0, 0, 0.24, 0.24), F2, F2 + 0.72, FURN.steel);
  b.prism(ellipse(dewar, 0, 0, 0.16, 0.16), F2 + 0.72, F2 + 0.82, FURN.equipmentDark);
  ceilingLight(b, polar(O, -66, 13.2), CEILING[1]);
}

/** All furniture, fittings, finishes and lights; ground floor into `f1`, first floor into `f2`. */
export function buildFurniture(f1: Builder, f2: Builder) {
  buildFinishes(f1, f2);
  lobby(f1);
  classroom(f1);
  staffRooms(f1);
  hall6(f1);
  office7(f1);
  toilets(f1, F1, CEILING[0]);
  workshop(f1);
  laboratory(f2);
  stairHall(f2);
  room11(f2);
  toilets(f2, F2, CEILING[1]);
  leftWingF2(f2);
}
