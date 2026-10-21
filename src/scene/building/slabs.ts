// Floor slabs, the roof (green roof, solar panels) and the entrance steps.

import { arcPoints, Builder, post } from './builder';
import { DEG, I, INNER_END, INNER_IN, INNER_OUT, LEVEL, O, OUTER_END, OUTER_IN, OUTER_OUT, polar, STAIR, WALL, type XZ } from './plan';

export const SLAB = {
  floor: 'floor',
  ceiling: 'ceiling',
  edge: 'slabEdge',
  roof: 'roofGreen',
  solar: 'solar',
  solarFrame: 'metalDark',
  step: 'stone',
} as const;

/**
 * Outline of the slabs: along the middle of the outer, inner and end walls, so that their edges
 * stay hidden inside the walls (on the wall faces they would flicker).
 */
export function ringOutline(): XZ[] {
  const half = WALL.exterior / 2;
  const outer = (OUTER_IN + OUTER_OUT) / 2;
  const inner = (INNER_OUT + INNER_IN) / 2;
  const outerEnd = OUTER_END - half / outer / DEG;
  const innerEnd = INNER_END - half / inner / DEG;
  return [...arcPoints(O, outer, -outerEnd, outerEnd), ...arcPoints(I, inner, innerEnd, -innerEnd)];
}

/** Point at distance r from O along the stair line, `off` metres to its lobby side. */
export function stairPoint(r: number, off: number): XZ {
  const t = (STAIR.theta * Math.PI) / 180;
  const [x, z] = polar(O, STAIR.theta, r);
  // perpendicular to the flight, towards smaller angles (the lobby side)
  return [x - Math.cos(t) * off, z - Math.sin(t) * off];
}

/** Rectangle above the stair flight where the first floor is open. */
export function stairOpening(margin = 0.05): XZ[] {
  const near = STAIR.offset - margin;
  const far = STAIR.offset + STAIR.width + margin;
  return [stairPoint(STAIR.openingFrom, near), stairPoint(STAIR.end + margin, near), stairPoint(STAIR.end + margin, far), stairPoint(STAIR.openingFrom, far)];
}

export function buildSlabs(shell: Builder) {
  const ring = ringOutline();
  // Ground floor slab (its edge is hidden by the plinth), first floor with the stair opening, roof.
  shell.slab(ring, [], LEVEL.f1 - LEVEL.slab, LEVEL.f1, SLAB.floor, SLAB.ceiling, SLAB.edge);
  shell.slab(ring, [stairOpening()], LEVEL.f2 - LEVEL.slab, LEVEL.f2, SLAB.floor, SLAB.ceiling, SLAB.edge);
  shell.slab(ring, [], LEVEL.roof, LEVEL.roof + LEVEL.roofSlab, SLAB.roof, SLAB.ceiling, SLAB.edge);

  // Solar panels in three rows along the arc, facing away from the courtyard (south-east, uphill).
  const roofTop = LEVEL.roof + LEVEL.roofSlab;
  const low = 0.3;
  const high = 1.0;
  for (const r of [9.4, 11.3, 13.2]) {
    for (let a = -68; a <= 64; a += 5.0) {
      const a1 = a + 4.3 * (11.3 / r);
      const front0 = polar(O, a, r + 0.75);
      const front1 = polar(O, a1, r + 0.75);
      const back0 = polar(O, a, r - 0.75);
      const back1 = polar(O, a1, r - 0.75);
      shell.quad(SLAB.solar, [front0[0], roofTop + low, front0[1]], [front1[0], roofTop + low, front1[1]], [back1[0], roofTop + high, back1[1]], [back0[0], roofTop + high, back0[1]], [0, 1, 0]);
      shell.quad(SLAB.solarFrame, [front0[0], roofTop + low - 0.04, front0[1]], [front1[0], roofTop + low - 0.04, front1[1]], [back1[0], roofTop + high - 0.04, back1[1]], [back0[0], roofTop + high - 0.04, back0[1]], [0, -1, 0]);
      for (const p of [front0, front1]) post(shell, SLAB.solarFrame, p, 0.06, roofTop, roofTop + low);
      for (const p of [back0, back1]) post(shell, SLAB.solarFrame, p, 0.06, roofTop, roofTop + high);
    }
  }

  // Entrance: two steps from the plaza (1.072) up to the ground floor (1.272) in front of the door.
  const door = polar(I, 0, INNER_OUT);
  const out: XZ = [0, 1]; // the entrance faces +Z (towards the courtyard)
  const across: XZ = [1, 0];
  for (const [depth, top] of [[1.7, LEVEL.plaza + 0.1], [0.85, LEVEL.f1]] as const) {
    const half = 1.9;
    const p0: XZ = [door[0] - across[0] * half, door[1] - across[1] * half];
    const p1: XZ = [door[0] + across[0] * half, door[1] + across[1] * half];
    const q0: XZ = [p0[0] + out[0] * depth, p0[1] + out[1] * depth];
    const q1: XZ = [p1[0] + out[0] * depth, p1[1] + out[1] * depth];
    shell.prism([p0, p1, q1, q0], LEVEL.plaza - 0.3, top, SLAB.step);
  }
}
