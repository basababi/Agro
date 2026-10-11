// Site-local frame <-> three.js world (CLAUDE.md §4).
// Site-local: origin = site centre, +ly = downhill (north-west), metres.
// three.js: Y-up, north = -Z.

import type { Vec3 } from '../data/views';

const K = Math.SQRT1_2;

/** tan(15°): the site slopes down towards +ly. */
export const SLOPE = Math.tan((15 * Math.PI) / 180);
/** Half-size of the site square (0.14 ha). */
export const SITE_HALF = 18.75;
/** Half-size of the terrain mesh in the GLB. */
export const TERRAIN_HALF = 45;

export function localToWorld(lx: number, ly: number, height = 0): Vec3 {
  return [K * (lx - ly), height, -K * (lx + ly)];
}

export function worldToLocal(x: number, z: number): [lx: number, ly: number] {
  return [K * (x - z), -K * (x + z)];
}

/** Height of the untouched 15° slope (ignores the building pad and the pond). */
export function slopeHeight(x: number, z: number): number {
  return SLOPE * K * (x + z);
}
