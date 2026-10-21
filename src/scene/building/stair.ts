// The stair from the lobby to the first floor, its balustrades, and an invisible ramp along the
// nosings for the walk-mode collider.

import { Builder } from './builder';
import { LEVEL, STAIR, type XZ } from './plan';
import { stairPoint } from './slabs';

export const STAIR_KEYS = { tread: 'stairTread', glass: 'railGlass', rail: 'metalDark' } as const;

const rise = (LEVEL.f2 - LEVEL.f1) / STAIR.risers;
const run = (STAIR.end - STAIR.start) / (STAIR.risers - 1);

/** The flight as solid steps, and glass balustrades on its open side and around the opening. */
export function buildStair(b: Builder) {
  const near = STAIR.offset;
  const far = STAIR.offset + STAIR.width;
  for (let k = 0; k < STAIR.risers - 1; k++) {
    const r0 = STAIR.start + k * run;
    const r1 = r0 + run + 0.03; // a small overlap so treads read as one flight
    const top = LEVEL.f1 + (k + 1) * rise;
    const poly: XZ[] = [stairPoint(r0, near), stairPoint(r1, near), stairPoint(r1, far), stairPoint(r0, far)];
    b.prism(poly, LEVEL.f1, top, STAIR_KEYS.tread);
  }

  // Balustrade along the open side of the flight: a sloping glass panel with a handrail.
  const railHeight = 0.95;
  const edge = far - 0.03;
  const segments = 6;
  for (let i = 0; i < segments; i++) {
    const s0 = STAIR.start - run + ((STAIR.end - STAIR.start + run) * i) / segments;
    const s1 = STAIR.start - run + ((STAIR.end - STAIR.start + run) * (i + 1)) / segments;
    const y = (s: number) => LEVEL.f1 + Math.max(0, ((s - (STAIR.start - run)) / (STAIR.end - STAIR.start + run)) * (LEVEL.f2 - LEVEL.f1));
    const a = stairPoint(s0, edge);
    const c = stairPoint(s1, edge);
    b.quad(STAIR_KEYS.glass, [a[0], y(s0), a[1]], [c[0], y(s1), c[1]], [c[0], y(s1) + railHeight, c[1]], [a[0], y(s0) + railHeight, a[1]], [1, 0, 0]);
    b.beam(STAIR_KEYS.rail, a, c, 0.05, y(s0) + railHeight, y(s0) + railHeight + 0.05);
    b.beam(STAIR_KEYS.rail, a, c, 0.05, y(s1) + railHeight - 0.001, y(s1) + railHeight + 0.049);
  }

  // Upstairs, around the opening: along its open side and across its lower end.
  const f2 = LEVEL.f2;
  const corners: XZ[] = [stairPoint(STAIR.openingFrom, near), stairPoint(STAIR.openingFrom, far + 0.05), stairPoint(STAIR.end, far + 0.05)];
  for (let i = 0; i < corners.length - 1; i++) {
    const a = corners[i];
    const c = corners[i + 1];
    b.beam(STAIR_KEYS.glass, a, c, 0.02, f2, f2 + 1.0);
    b.beam(STAIR_KEYS.rail, a, c, 0.06, f2 + 1.0, f2 + 1.05);
  }
}

/**
 * Triangles over the nosings, from the floor in front of the first step to the landing, and a
 * short flat run onto the landing: where the slope simply stopped at the edge of the floor
 * opening, the walker's step test looked down through the gap and took the edge for a wall.
 */
export function stairRamp(): number[] {
  const near = STAIR.offset;
  const far = STAIR.offset + STAIR.width;
  const s0 = STAIR.start - run;
  const s1 = STAIR.end;
  const s2 = STAIR.end + 0.4;
  const y0 = LEVEL.f1 + 0.02;
  const y1 = LEVEL.f2 + 0.02;
  const quad = (r0: number, h0: number, r1: number, h1: number) => {
    const a = stairPoint(r0, near);
    const b = stairPoint(r0, far);
    const c = stairPoint(r1, far);
    const d = stairPoint(r1, near);
    return [a[0], h0, a[1], b[0], h0, b[1], c[0], h1, c[1], a[0], h0, a[1], c[0], h1, c[1], d[0], h1, d[1]];
  };
  return [...quad(s0, y0, s1, y1), ...quad(s1, y1, s2, y1)];
}
